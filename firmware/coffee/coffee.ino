#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "HTTPClient.h"
#include "esp_wpa2.h"
#include "esp_wifi.h"
#include "time.h"
#include "src/PN5180.h"
#include "src/PN5180ISO15693.h"
#include "src/PN5180ISO14443.h"
//#include "src/PN5180FeliCa.h"
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include "base64.h"

//#define ASYNC_HTTP_DEBUG_PORT           Serial
// Use from 0 to 4. Higher number, more debugging messages and memory usage.
//#define _ASYNC_HTTP_LOGLEVEL_           4

//#include <AsyncHTTPSRequest_Generic.h>            // https://github.com/khoih-prog/AsyncHTTPSRequest_Generic
#include <AsyncHTTPRequest_Generic.h>            // https://github.com/khoih-prog/AsyncHTTPRequest_Generic
#include "config.h"
#include "driver/temp_sensor.h"

#define REQUEST AsyncHTTPRequest // AsyncHTTPSRequest

const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0; // use UTC

const char* apiurl = "http://spezispezl.de/api/";
String auth;


hw_timer_t* timer = NULL;
String card_id ="";
uint32_t last_state_change = 0;

// user data
float balance = 0;
bool trust_user = false; // if user is allowed to overdraft

bool card_present = false; // card is currently present
bool transaction_ok = false; // if response is positive
bool balance_received= false; // if response is received
bool products_received=false; // if response is received
uint32_t card_time =0; // time a read card will expire. gets updated while card is present
uint32_t card_hold_time = 5500; // time the card can be removed until a purchase is blocked

typedef enum {reset, wait_for_card, wait_for_balance, ready_to_buy, transaction_running, wait_to_complete, wait, error } State;
String state_str [8] = {"reset", "wait_for_card", "wait_for_balance", "ready_to_buy", "transaction_running", "wait_to_complete","wait", "error"};
State state = reset;

uint32_t mill_out_start = 0;
uint32_t mill_start = 0;
uint32_t mill_time = 0;
uint32_t mill_time_transaction = 0;
bool mill_allowed = false;
uint32_t last_temp_time=0;




#define PIN_NEO 8  // Neopixel LED Pin

// RFID reader PN5180
#define PIN_CLK 4
#define PIN_MISO 5
#define PIN_MOSI 6
#define PN5180_NSS  7
#define PN5180_BUSY 1
#define PN5180_RST  0


// Coffee Mill Signal input and output pins
#define PIN_IN 3
#define PIN_OUT 2

// Devicename for product requests
#define DEVICENAME String("astoria")


Adafruit_NeoPixel strip(1, PIN_NEO, NEO_GRB + NEO_KHZ800);

// LED Colors
typedef enum {black, green, red, yellow, purple, blue, aqua, pink} Color;
#define NUM_COLORS 8
uint8_t color [NUM_COLORS][3] = {
  {0,0,0},
  {0,200,0}, 
  {255,0,0}, 
  {150,150,0},
  {90,0,220}, 
  {0,0,100},
  {0,150,150},
  {150,20,100}
};


// Struct for product definition
typedef struct _Product {
  bool valid;
  int p_id;
  int items;
  float price;
  uint32_t property;
} Product;

#define NUM_SLOTS 7
Product products[NUM_SLOTS] ={ {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0} , {0,0,0,0,0} , {0,0,0,0,0} , {0,0,0,0,0} , {0,0,0,0,0} };


PN5180ISO14443 nfc14443(PIN_MISO,PIN_MOSI,PIN_CLK,PN5180_NSS, PN5180_BUSY, PN5180_RST); 
PN5180ISO15693 nfc15693(PIN_MISO,PIN_MOSI,PIN_CLK,PN5180_NSS, PN5180_BUSY, PN5180_RST);

DynamicJsonDocument json(1024);
REQUEST request;
uint32_t product_select_time=0;
bool sensor_ok = true;
int errcount =0;

void IRAM_ATTR onTimer() {
  digitalWrite(PIN_OUT, 0);
  mill_time = 0;
  Serial.printf("Milling ended: %lu %lu\n", millis()- mill_out_start, millis());
  mill_out_start = 0;
  timerStop(timer);
}

void IRAM_ATTR isr_off(); // declare here due to cyclic use in isr_on. definition below

void IRAM_ATTR isr_on(){
    if(!mill_start){
    mill_start = millis();
    detachInterrupt(PIN_IN);
    attachInterrupt(PIN_IN, isr_off, RISING);
  }
}
void IRAM_ATTR isr_off(){
  if(mill_start){
     mill_time = millis()-mill_start;
     mill_time_transaction = mill_time; // copy value
     mill_start = 0;
     Serial.println(mill_time);
     detachInterrupt(PIN_IN);
     attachInterrupt(PIN_IN, isr_on, FALLING);

     if(mill_out_start){ // set end time
      set_timer(mill_time-(millis()-mill_out_start));
     }
   }
}

// HTTP request callback. Gets called when a async anser is received
void requestCB(void* optParm, REQUEST* request, int readyState) {
  (void) optParm;
  if (readyState == readyStateDone){
    //Serial.println(request->responseText());
    process_cmd(request->responseText());
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Start");

// Init WS2812 LED
  strip.begin();
  set_led(black);
  strip.show();

// Init ESP32 intrnal temperature sensor. just for fun logging if ESP is still online
  temp_sensor_config_t temp_sensor = {
    .dac_offset = TSENS_DAC_L2,
    .clk_div = 6,
  };
  temp_sensor_set_config(temp_sensor);

// Init in/out pins
  pinMode(PIN_IN,INPUT_PULLUP);
  pinMode(PIN_OUT,OUTPUT);
  digitalWrite(PIN_OUT,0);

  nfc15693.begin(NULL); // use default SPI
  nfc14443.begin(NULL);

// Set request callback function
  request.onReadyStateChange(requestCB);
  request.setDebug(false);
  auth = String("Basic " + base64::encode(authUsername + ":" + authPassword));

// Start Timer and attach Interrupts for mill signal reading
 timer = timerBegin(0, 80, true);
 timerAttachInterrupt(timer, &onTimer, true);
 attachInterrupt(PIN_IN, isr_on, FALLING);
}

void set_state(State s){
  if(s != state){
    state = s;
    Serial.println(state_str[s]);
    last_state_change = millis();
    if(s == reset){
      //clear_all();
    }
    if(s==error){
      reset_card();
    }
  }
}

void reset_card(){
    uint8_t uid[8]={0,0,0,0,0,0,0,0};
    get_card(uid);
    //clear_all();
    card_present = false;
    card_id = "";
    products_received = false;
    balance_received = false;
    mill_time_transaction = 0;
    balance = 0;
    trust_user = false;
    transaction_ok = false;
}


void loop() {
//if(wifi_connect()){
if(eduroam_connect()){ // reconnect if no connection
// if(bayernwlan_connect()){

  uint8_t uid[8]={0,0,0,0,0,0,0,0};

  if(get_rfid(uid)){
    card_time = millis() + card_hold_time;
    if(get_card(uid)){
      card_present = true;
      Serial.println(card_id);
    }
  }else {
    if(millis() > card_time && card_present && state < ready_to_buy){
      reset_card();
    }
  }

  switch (state){
    case wait_for_card:
      if(card_present){
        last_temp_time = millis(); // do not send temp while user action
        if(!balance) {get_balance(card_id);}
        else {balance_received = true;}
        set_state(wait_for_balance);
        set_led(yellow);
      }
      if(mill_start){
        if(!product_select_time){product_select_time=millis();}
        set_led(pink);
      }

      if(product_select_time && (millis()- product_select_time > 8000)){
          Serial.println("Timeout: wait_for_card");
          product_select_time=0;
          set_state(error);
          break;
        }

    break;
    case wait_for_balance:
      if(balance_received){
        get_products(card_id);
        balance_received = false;
        set_state(wait_for_balance); // renew timer
      }
      if(products_received){
        if ((balance >= get_max_price() || trust_user )){
          set_led(green);
          mill_allowed = true;
          set_state(ready_to_buy);
        } else {
          Serial.println("Balance not sufficient");
          set_led(red);
          set_state(error);
        }
      } else if(millis()- last_state_change > 5500){
        Serial.println("Timeout: wait_for_balance");
        set_state(error);
      }
    break;
    case ready_to_buy:
      if(mill_time_transaction){ // balance is sufficient and timer already started
        Serial.printf("Milltime: %lu\n", mill_time_transaction);
        if(!send_transaction(card_id, get_product_from_time(mill_time_transaction), (float)mill_time_transaction/1000)){
          set_state(transaction_running);
        } else { // some extra powder
          set_led(aqua);
          set_state(wait);
        }
      } else if(millis()- last_state_change > 10000 && !mill_out_start){
        mill_allowed = false;
        Serial.println("Timeout: ready_to_buy");
        set_state(error);
      }
    break;
    case transaction_running:
      if(transaction_ok){
        transaction_ok = false;
        mill_time_transaction=0; // clear, transaction is handled
        set_state(wait_to_complete);
      } else if(millis()- last_state_change > 4000){
          Serial.println("Timeout: transaction_running");
          set_state(error);
      }
    break;
    case wait: // just wait to keep led in aqua state
      if(millis()- last_state_change > 1000){
        set_state(transaction_running);
      }
    break;
    case wait_to_complete:
      if(mill_time == 0){ // milling is finished
        set_state(reset);
      }
    break;
    case error:
      set_led(red);
      if(millis()- last_state_change > 1000){
        reset_card();
        set_state(reset);
      }
    break;
    case reset:
      mill_time = 0;
      product_select_time=0;
      mill_time_transaction = 0;
      reset_card();
      set_led(blue);
      set_state(wait_for_card);
    break;
  }

    
    if(mill_allowed){ // start if not running yet
      mill_allowed = false;
      if(mill_time){
        start_milling();
        set_timer(mill_time);
      } else if(mill_start > 0){
        start_milling();
      } else {
        mill_allowed = true; // retry
      }
    }

  if(millis()-last_temp_time > 20000){
    
    float tsens_out;
    temp_sensor_read_celsius(&tsens_out);
    if(send_temp(tsens_out)){
      last_temp_time = millis();
      sensor_ok = false;
    } else {
      // retry
    }
  }

  if(!sensor_ok && millis()-last_temp_time > 5000){
    Serial.println("Send sensor timeout");
    errcount++;
    sensor_ok = true; // to avoid multiple countups
  }

  if(errcount > 2){
    ESP.restart();
  }

}
}

void start_milling(){
  digitalWrite(PIN_OUT,1); // turn mill on
  set_led(purple);
  mill_out_start = millis();
  Serial.printf("Milling started: %lu\n", millis());
}

void set_timer(uint32_t mt){
  timerRestart(timer);
  timerAlarmWrite(timer, 1000 * mt, false); // turn mill off by interrupt timer
  timerAlarmEnable(timer);
  timerStart(timer);
  Serial.printf("Timer set: %lu\n", mt);

}

void set_led(Color c){
strip.setPixelColor(0, color[c][0],color[c][1],color[c][2]);
strip.show();
}

int get_product_from_time(uint32_t mt){ // get the longest milltime of products
  int max_id = 0;
  uint32_t max_mt = 0;
  for( int i =0; i< NUM_SLOTS; i++){
    if(products[i].valid){
      if(mt > products[i].property && products[i].property > max_mt ){
        max_mt = products[i].property;
        max_id = i;
      }
    }
  }
  return max_id;
}

float get_max_price(){
  float max_price = 0;
  for( int i =0; i< NUM_SLOTS; i++){
    if(products[i].price > max_price){
      max_price = products[i].price;
    }
  }
  return max_price;
}


int send_transaction(String card_id, int slot, float time){
    String url = apiurl+ String("do_transaction");
    String data = String("card_id=")+ card_id + String("&device=")+ DEVICENAME +String("&slot=")+ String(slot+1)+ String("&single=true")+String("&parameter=") +String(time);
    sendRequest(url, data);
    Serial.printf("Slot: %i\n", slot+1);
    return slot+1 == 1; // true if nachmahlen
}

bool get_products(String card_id){
  String url = apiurl+ String("get_products");
  String data = String("device=") + DEVICENAME + String("&card_id=") +card_id;
  return sendRequest(url, data);
}

bool get_balance(String card_id){
  String url = apiurl+ String("get_balance");
  String data = String("card_id=")+card_id;
  return sendRequest(url, data);
}

bool send_temp(float temp){
  String url = apiurl+ String("log_sensor");
  String data = String("id=2&value=") +String(temp);
  return sendRequest(url, data);
}


// GET / POST sending fuction. Adds Auth header
bool sendRequest(String url, String data) {
  if ((WiFi.status() == WL_CONNECTED)) {
    static bool requestOpenResult;
    //Serial.println(data);
    if (request.readyState() == readyStateUnsent || request.readyState() == readyStateDone){
      if(data == ""){
        requestOpenResult = request.open("GET", url.c_str());
      } else {
        requestOpenResult = request.open("POST", url.c_str());
      }
      if (requestOpenResult){
        request.setReqHeader("Authorization", auth.c_str());
        request.setReqHeader("Content-Type", "application/x-www-form-urlencoded");
        if(data == ""){
          request.send();
        } else {
          request.send(data.c_str());
        }
        return true;
      } else {
        Serial.println(F("Can't send bad request"));
      }
    } else {
      Serial.println(F("Can't send request"));
    }
  } else {
      Serial.println(F("Wifi not Connected"));
    }
  return false;
}

// process incomming responses (JSON)
bool process_cmd(String str){
  json.clear();
  Serial.print("Processing command: "); Serial.println(str);
  DeserializationError err = deserializeJson(json, str);
  if (err) {
    Serial.print(F("deserializeJson() failed\n"));
    return false;
  }
  if(json.containsKey("state")){ // 
    if(state == transaction_running || state == ready_to_buy || state == wait){
      if(json["state"] == "success") {
        transaction_ok = true;
        Serial.println("Transaction ok");
      } else {
        Serial.println("Transaction failed");
      }
    } else if(state == wait_for_balance){ // {"state":"user not exists"}
      set_state(error);
    }
  } 
  if(json.containsKey("sensor")){ 
      if(json["sensor"] == "success") {
        sensor_ok = true;
        errcount = 0; // reset errors
      } else {
        Serial.println("Sensor failed");
      }
  }
  else if(json.containsKey("balance")){ //{"balance":"-1.80","surname":"Test","trusted":false}
    balance = json["balance"];
    trust_user = json["trusted"];
    balance_received = true;
  }
  else if(json.size()>0){
    for(int i=0; i<json.size(); i++){
      int slot = json[i]["slot"];
      if(slot < NUM_SLOTS){
        products[slot-1].valid = true;
        products[slot-1].price = json[i]["price"];
        products[slot-1].property = json[i]["property"];
      }
      //products[slot].display_name = json[i]["display_name"];
// [{"slot":1,"product_id":99,"items":0,"price":"1.00","name":"coffee","display_name":"Kaffee 1x","property":0},
//{"slot":2,"product_id":99,"items":0,"price":"1.00","name":"coffee_2","display_name":"Kaffee 2x","property":0}]
    }
    products_received = true;
  } else{
    Serial.println("Unknown response");
    return false;
  }
  return true;
}


// store card id to global variable and check if it is still the same card
bool get_card(uint8_t* uid){
  static String old_card = "";
  char temp [20];
  sprintf(temp, "%02X%02X%02X%02X%02X%02X%02X%02X", uid[0], uid[1], uid[2], uid[3], uid[4], uid[5], uid[6], uid[7] );
  card_id = String(temp);
  if( old_card != card_id){
    old_card = card_id;
    //Serial.println(card_id);
    return true;
  }
  return false;
}

// read card id
bool get_rfid(uint8_t* uid){
// Setup NFC Reader
  nfc15693.reset();
  nfc15693.setupRF(0x0d, 0x8d);
  uint8_t rc = nfc15693.getInventory(uid);
  if(rc == 0) { // card present
    //Serial.println("nfc15693");
    return true;
  } 

  delay(5);

  nfc14443.reset();
  nfc14443.setupRF(0x00, 0x80);
  int8_t uidLength = nfc14443.readCardSerial(uid);
  if(uidLength > 0){
    uid[7]=0xE0;
    //Serial.println("nfc14443");
    return true;
  } 
return false;
}


bool eduroam_connect(){
  if(WiFi.status() != WL_CONNECTED){
    Serial.println("Connecting to eduroam");
    WiFi.disconnect(false,true);  //disconnect form wifi to set new wifi connection
    delay(50);
    WiFi.enableSTA(true); //init wifi mode
    delay(50);
    esp_wifi_sta_wpa2_ent_set_identity((uint8_t *)EAP_IDENTITY, strlen(EAP_IDENTITY)); //provide identity
    esp_wifi_sta_wpa2_ent_set_username((uint8_t *)EAP_IDENTITY, strlen(EAP_IDENTITY)); //provide username --> identity and username is same
    esp_wifi_sta_wpa2_ent_set_password((uint8_t *)EAP_PASSWORD, strlen(EAP_PASSWORD)); //provide password
    //esp_wpa2_config_t config = WPA2_CONFIG_INIT_DEFAULT(); //set config settings to default
    //esp_wifi_sta_wpa2_ent_enable(&config); //set config settings to enable function
    esp_wifi_sta_wpa2_ent_enable();
    delay(50);
    WiFi.begin("eduroam"); //connect to wifi


    uint32_t count =0;
  while (WiFi.status() != WL_CONNECTED && count <60)
  {
    if(count%2){
      set_led(black);
    } else {
      set_led(yellow);
    }
    Serial.print(".");
    delay(200);
    count ++;
  }
  Serial.print("\n");
  if(WiFi.status() == WL_CONNECTED) {
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    configTime(gmtOffset_sec, 0, ntpServer); // do not change summer time
    printLocalTime();
    set_led(blue);
    return true;
  } else {return false;}
}
return true;
}

bool wifi_connect(){
    uint32_t count = 0;
  if(WiFi.status() != WL_CONNECTED){
    //WiFi.disconnect(true);  //disconnect form wifi to set new wifi connection
    WiFi.mode(WIFI_STA); //init wifi mode
    WiFi.begin("NewtonNetwork", "einstein1879"); //connect to wifi
    while (WiFi.status() != WL_CONNECTED){
      if(count%2){
        set_led(black);
      } else {
        set_led(yellow);
      }
      Serial.print(".");
      delay(200);
      count ++;
      if(count > 60){return false;}
    }
    configTime(gmtOffset_sec, 0, ntpServer); // do not change summer time
    printLocalTime();
    set_led(blue);
  }
  return true;
}

void printLocalTime()
{
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)){
    Serial.println("Failed to obtain time");
    return;
  }
  Serial.println(&timeinfo, "%A, %B %d %Y %H:%M:%S");
}
