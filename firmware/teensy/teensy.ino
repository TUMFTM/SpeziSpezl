#include <Adafruit_MCP23X17.h>
#include <Adafruit_NeoPixel.h>
#include "src/PN5180.h"
#include "src/PN5180ISO15693.h"
#include "src/PN5180ISO14443.h"
//#include "src/PN5180FeliCa.h"
#include <ArduinoJson.h>
#include <OneWire.h> 
#include <DallasTemperature.h>




#define NUM_SLOTS 10


// PINS on MCP23017
byte mcp_pins[16] = {INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP,OUTPUT,INPUT_PULLUP,INPUT_PULLUP,INPUT_PULLUP}; 
// A0. A1, ...B0, B1
#define PIN_SW_OPEN 10
#define PIN_SW_CLOSED 11
#define PIN_RELEASE 12 // opener output


#define LED_COUNT 25
int led_map[LED_COUNT] = {0,0,0,1,1,2,2,2,3,3,4,4,4,5,5,6,6,6,7,7,8,8,8,9,9};


// Teensy pins
#define ONE_WIRE_BUS 6
#define ONE_WIRE_BUS2 23
#define PIN_INTA 21
#define PIN_INTB 20
#define PIN_NEO 2

// RFID
#define PIN_CLK 13
#define PIN_MISO 12
#define PIN_MOSI 11
#define PN5180_NSS  10
#define PN5180_BUSY 15
#define PN5180_RST  14

#define SER_BUFFER_SIZE 150 // Serial buffer size for commands

OneWire oneWire(ONE_WIRE_BUS); 
OneWire oneWire2(ONE_WIRE_BUS2); 
DallasTemperature sensors(&oneWire);
DallasTemperature sensors2(&oneWire2);


Adafruit_MCP23X17 mcp;
Adafruit_NeoPixel strip(LED_COUNT, PIN_NEO, NEO_GRB + NEO_KHZ800);

PN5180ISO14443 nfc14443(PIN_MISO,PIN_MOSI,PIN_CLK,PN5180_NSS, PN5180_BUSY, PN5180_RST); 
PN5180ISO15693 nfc15693(PIN_MISO,PIN_MOSI,PIN_CLK,PN5180_NSS, PN5180_BUSY, PN5180_RST);
//DynamicJsonDocument json(1024);
StaticJsonDocument<1024> json;

const char compile_date[] = __DATE__ " " __TIME__;

char serialbuffer[SER_BUFFER_SIZE];
uint16_t ser_counter = 0;
String card_id;
uint32_t last_state_change = 0;
float balance = 0;
bool trust_user = false;
int slot_selected = 0;
int slot_selected_prev = 0;
bool box_opened = false;
bool box_closed = false;
bool card_present = false;
bool transaction_ok = false;
bool balance_received= false;
bool led_changed = false;
uint32_t slot_sel_time = 0;
bool screensaver = false;
bool alert_send = false;
uint32_t card_time =0; // time a read card will expire. gets updated while card is present
uint32_t card_hold_time = 3500; // time the card can be removed until a purchase is blocked
uint32_t last_card_present = 0;

typedef enum {reset, wait_for_card, ready_to_buy, slot_unlocked, slot_open, slot_closed, wait_for_balance} State;
String state_str [7] = {"reset", "wait_for_card", "ready_to_buy", "slot_unlocked", "slot_open", "slot_closed", "wait_for_balance"};
State state = reset;

typedef struct _Product {
	bool valid;
	int p_id;
	int items;
	float price;
	uint32_t color;
} Product;

typedef struct _RGB {
	uint8_t R;
	uint8_t G;
	uint8_t B;
	float br;
} RGB_;


RGB_ led_slots[NUM_SLOTS];
Product products[NUM_SLOTS] ={ {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0}, {0,0,0,0,0} };

uint32_t last_sensor_time = 0;

void setup(){
	Serial.begin(115200);
	SerialUSB1.begin(115200);

	strip.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip.show();            // Turn OFF all pixels ASAP
  strip.setBrightness(100); // Set BRIGHTNESS to about 1/5 (max = 255)
  sensors.begin();
  sensors2.begin();

	nfc14443.begin(NULL); // use default SPI
	nfc15693.begin(NULL);

	setup_pins(false);
	get_temp();
	get_ambient_temp();

}

void setup_pins(bool en_interrupt){
	Wire.end();
	delay(10);
	Wire.begin();
	Wire.setClock(100000);
	if (mcp.begin_I2C(0x27, &Wire)){

	  // OPTIONAL - call this to override defaults
	  // mirror INTA/B so only one wire required
	  // active drive so INTA/B will not be floating
	  // INTA/B will be signaled with a LOW
	  //mcp.setupInterrupts(true, false, LOW);
	  //mcp.setupInterruptPin(PIN_SLOT_1, LOW);

	  for (int i = 0; i < 16; i++) {     // Set GPI Pins 1-16 to state in mcp_pins , change of state triggers Interrupt
	    mcp.pinMode(i, mcp_pins[i]);
	    //mcp.setupInterruptPin(i, CHANGE);
	  }
	  mcp.digitalWrite(PIN_RELEASE, 0); // Lock

	  pinMode(PIN_INTA, INPUT);
	  pinMode(PIN_INTB, INPUT);

	 
	}
}

void read_pins(){
	static uint32_t pin_state_old=0;
	static int samecount = 0;

	setup_pins(false);

	uint16_t pin_state = mcp.readGPIOAB(); // The LSB corresponds to Port A, pin 0, and the MSB corresponds to Port B, pin 7.

	// Serial.println(pin_state,BIN);
	// SerialUSB1.println(pin_state, BIN);


	if(pin_state == 0xFFFF) {
		Serial.println("MCP Reset");
		SerialUSB1.println("MCP Reset");
		setup_pins(false);
		pin_state = mcp.readGPIOAB();
	}

//	static uint16_t pin_state_old =0;
//	if(pin_state != pin_state_old) {
//		Serial.println(pin_state,BIN); 
//		pin_state_old=pin_state;}

	if(pin_state == pin_state_old){ // at least 2 cycles with same state
		samecount ++;
		if(samecount >0){
			slot_selected = 0;
			for (int i = 0; i<NUM_SLOTS; i++){
				if( !(pin_state & (1 << i))){ // Pin is LOW
					if(slot_selected){
						Serial.print("Error. MCP Reset. More than 1 slot selected: "); Serial.println(slot_selected);
						SerialUSB1.print("Error. MCP Reset. More than 1 slot selected: "); SerialUSB1.println(slot_selected);
						setup_pins(false);
						slot_selected = 0; 
						return;
					}
					slot_selected = i+1;
					//Serial.printf("Slot selected: %i\n",slot_selected);
				}
			}
			box_opened = !(pin_state & (1 << PIN_SW_OPEN ));
			box_closed = !(pin_state & (1 << PIN_SW_CLOSED )); // set pins
		}
	}else {
		samecount = 0;
	}
	pin_state_old = pin_state;
}


void set_state(State s){
	if(s != state){
		state = s;
		Serial.println(state_str[s]);
		last_state_change = millis();
	}
}

void clear_all(){
balance_received = false;
alert_send = false;
uint8_t uid[8]={0,0,0,0,0,0,0,0};
get_card(uid);
}

void loop(){
uint8_t uid[8]={0,0,0,0,0,0,0,0};

if(get_rfid(uid)){
	card_time = millis() + card_hold_time;
	if(get_card(uid)){
		card_present = true;
		screensaver=false;
		slot_sel_time = millis();
		send_card(card_id);
		last_card_present = millis();
	}
	if(millis()-last_card_present > 1000){send_card_still_present(card_id); last_card_present=millis();}
}else {
	if( ((millis() > card_time) && (card_present || balance_received) && state != slot_unlocked)) {
		clear_all();
		card_present = false;
		card_id="";
		balance = 0;
		trust_user = false;
		send_card_removed();
	}
}

	read_serial();
	read_serial_USB();

	read_pins();

	if(slot_selected != slot_selected_prev){ // change in slot selection
		if(slot_selected){ // slot active
			slot_sel_time = millis(); 
			screensaver=false;
		}

		if(slot_selected_prev && slot_selected == 0){
			Serial.println("Slot released");
			SerialUSB1.println("Slot released");
		}
		slot_selected_prev = slot_selected;
		set_led(slot_selected-1); // light all slots with this product
		send_slot(slot_selected);
	}

	if(slot_selected && millis() - slot_sel_time > 60000){
		send_slot_stuck(slot_selected);
		slot_sel_time = millis(); // send onece a minute if still blocked
	}

	if( (card_present || balance_received) && slot_selected == 0){
		set_led(-2); // light all slots
	} else if( (millis()-slot_sel_time > 6000) && !screensaver){
		screensaver = true; // turn on screensaver
		clear_all();
		Serial.println("screensaver on");
		SerialUSB1.println("screensaver on");
	} else if( (millis()-slot_sel_time > 4000) && !screensaver){
		set_led(-3); // turn leds off
		//Serial.println("LED OFF");
	} else if(screensaver){
		rainbowCycle(5); // run screensaver
	}

		switch (state){
		case wait_for_card:
			if(card_present && box_closed && !box_opened){ 
				set_state(wait_for_balance);
			}
		break;

		case wait_for_balance:
			if(card_present && box_closed && !box_opened && balance_received){ set_state(ready_to_buy); balance_received=false;}
			else if(millis()- last_state_change > 1500){
				Serial.println("No answer from Backend -> reset");
				SerialUSB1.println("No answer from Backend -> reset");
				set_state(reset);
			}
		break;

		case ready_to_buy:
			if(card_present && slot_selected && ( (balance >= products[slot_selected].price) || trust_user)){
				Serial.printf("Opening slot %i, balance was %0.2f, price is %0.2f\n", slot_selected, balance, products[slot_selected].price);
				SerialUSB1.printf("Opening slot %i, balance was %0.2f, price is %0.2f\n", slot_selected, balance, products[slot_selected].price);
				unlock();
				set_state(slot_unlocked);
			}
			else if( !card_present){set_state(reset);}
		break;

		case slot_unlocked:
			if(box_opened){
				send_transaction_single(slot_selected);
				lock();
				set_state(slot_open);
			}
			else if( !box_opened && (!slot_selected || (millis()- last_state_change > 7000) )) {
				lock();
				set_state(reset);
			} // not opend or closed again
		break;

		case slot_open:
			if(!alert_send && millis()-last_state_change > 60000){ // 1 min open
				send_open_alert(slot_selected);
				alert_send = true;
			}
			if(!box_opened){ set_state(slot_closed); }
		break;

		case slot_closed:
			if(box_closed && !box_opened && !slot_selected){ set_state(wait_for_card);}
			else if(millis()- last_state_change > 15000){
				Serial.println("failed to reinit");
				set_state(reset);
			}
		break;

		case reset:
			clear_all();
			card_present = false;
			card_id="";
			balance = 0;
			trust_user = false;
			send_card_removed();
			set_state(wait_for_card);
			
		break;
	}

	write_led();

// setup pins every minute

	static uint32_t last_setup = 0;
	if(screensaver && millis() - last_setup > 60*1000){
		setup_pins(false);
		last_setup = millis();
	//	SCB_AIRCR = 0x05FA0004;
	//	asm volatile ("dsb");
	}
}

void unlock(){
	mcp.digitalWrite(PIN_RELEASE, 1);
	mcp.digitalWrite(PIN_RELEASE, 1);
	mcp.digitalWrite(PIN_RELEASE, 1);
	Serial.println("Unlocked");
	SerialUSB1.println("Unlocked");
}
void lock(){
	mcp.digitalWrite(PIN_RELEASE, 0);
	mcp.digitalWrite(PIN_RELEASE, 0);
	mcp.digitalWrite(PIN_RELEASE, 0);
	Serial.println("Locked");
	SerialUSB1.println("Locked");
}


void send_card(String card){
	json.clear();
	json["new_card"] = card;
	send_json();
}

void send_card_removed(){
	json.clear();
	json["card_removed"] = true;
	send_json();
}

void send_slot(int slot){
	json.clear();
	json["slot"] = slot;
	send_json();
}

void send_version(){
	json.clear();
	json["version"] = compile_date; // "Sep 22 2013 01:19:49";
	send_json();
}

void send_card_still_present(String card){
	json.clear();
	json["card"] = card;
	send_json();
}

void send_transaction(int slot){
	json.clear();
	json["transaction"]["slot"] = slot;
	json["transaction"]["card_id"] = card_id;
	send_json();
}

void send_transaction_done(int slot){
	json.clear();
	json["transaction_done"]["slot"] = slot;
	json["transaction_done"]["card_id"] = card_id;
	send_json();
}

void send_transaction_single(int slot){
	json.clear();
	json["transaction_single"]["slot"] = slot;
	json["transaction_single"]["card_id"] = card_id;
	send_json();
}

void send_slot_stuck(int slot){
	json.clear();
	json["slot_blocked"] = slot;
	send_json();
}


void send_open_alert(int slot){
	json.clear();
	json["alert"]["slot"] = slot;
	send_json();
}

void send_json(){
	serializeJson(json, Serial);
	Serial.println();
	serializeJson(json, SerialUSB1);
	SerialUSB1.println();
}

void send_sensor(int num){
	json.clear();
	if (num == 1){
		json["sensor"]["id"] = 1;
		json["sensor"]["value"] = get_temp();
	}
	else if(num == 2){
		json["sensor"]["id"] = 3;
		json["sensor"]["value"] = get_ambient_temp();
	}
	send_json();
}


void read_serial(){
	bool process = false;
	while(Serial.available() && !process){
		serialbuffer[ser_counter] = Serial.read();
		if(serialbuffer[ser_counter] == '\n'){process = true;}
		else {ser_counter++;}
	}
	if(process){
		process_cmd(serialbuffer);
		// reset buffer
		memset(serialbuffer, 0, SER_BUFFER_SIZE);
		ser_counter = 0;
	}
}

void read_serial_USB(){
	bool process = false;
	while(SerialUSB1.available() && !process){
		serialbuffer[ser_counter] = SerialUSB1.read();
		if(serialbuffer[ser_counter] == '\n'){process = true;}
		else {ser_counter++;}
	}
	if(process){
		process_cmd(serialbuffer);
		// reset buffer
		memset(serialbuffer, 0, SER_BUFFER_SIZE);
		ser_counter = 0;
	}
}



bool process_cmd(char * str){
	//Serial.print("Preocessing command: "); Serial.println(str);
	DeserializationError error = deserializeJson(json, str);
	if (error) {
    Serial.print(F("deserializeJson() failed\n"));
    return false;
  }
  if(json.containsKey("TRANSACTION")){ 
  	transaction_ok = json["TRANSACTION"]; 
  } 
  else if(json.containsKey("PRODUCT_CLEAR")){ 
  	Serial.println("Got product clear");
  } 
  else if(json.containsKey("OPEN")){ 
  	Serial.println("Testing Unlock");
  	unlock();
  	delay(1000);
  	lock();

  } 
  else if(json.containsKey("GET_SENSOR")){ 
  	send_sensor(json["GET_SENSOR"]);
  } 
  else if(json.containsKey("PRODUCT")){ 
  	int slot = int(json["PRODUCT"]["slot"]) -1;
  	products[slot].valid = true;
  	products[slot].price = json["PRODUCT"]["price"];
  	products[slot].items = json["PRODUCT"]["items"];
  	products[slot].p_id = json["PRODUCT"]["p_id"];
  	products[slot].color = json["PRODUCT"]["color"];
  	//Serial.println("Got product");
  }
  else if(json.containsKey("BALANCE")){ 
  	balance = json["BALANCE"]["value"]; 
  	trust_user = json["BALANCE"]["trust"];
  	balance_received = true;
  	Serial.println("Got balance");
  } 
  else if(json.containsKey("FLASH")){
  	_reboot_Teensyduino_();
  }
  else if(json.containsKey("VERSION")){
  	send_version();
  }

  else{ return false;}
  return true;

}

void set_led(int slot){ //-1 none selected, -2 show all, -3 show none
	if(slot == -1){ return;}
	int current_product = -1;
	if( slot >= 0 ){current_product = products[slot].p_id;}
	//light up slots by product color
	for( int i = 0; i< NUM_SLOTS; i++){
		int p = products[i].p_id;
		if(products[i].items <=0 || !products[i].valid || (current_product != -1 && current_product != p) || slot == -3) {
			set_led_slot(i,0,0,0,0); // light off if empty
		} else{ 
			set_led_slot(i, col_from_hex(products[i].color, 0), col_from_hex(products[i].color, 1), col_from_hex(products[i].color, 2),1 );
		}
	}
	led_changed = true;
}

uint8_t col_from_hex(uint32_t hex, int pos){
 if(pos == 0){ return (uint8_t)(hex >> 4);} // 0x00FF0000
 if(pos == 1){ return (uint8_t)(hex >> 2);} // 0x0000FF00
 if(pos == 2){ return (uint8_t)(hex >> 0);} // 0x000000FF
 return 0;
}

void set_led_slot(int slot, uint8_t r, uint8_t g, uint8_t b, float bri){
	//Serial.printf("Setting Slot %i to %i %i %i BR:%0.2f\n", slot, r, g, b, bri);
	led_slots[slot].R = r;
	led_slots[slot].G = g;
	led_slots[slot].B = b;
	led_slots[slot].br = bri;
}

void write_led(){
if(led_changed){
	led_changed = false;
	for(int i = 0; i< strip.numPixels(); i++){
		RGB_ t = led_slots[led_map[i]];
		strip.setPixelColor(i ,(uint8_t )((float)t.R*t.br), (uint8_t)((float)t.G*t.br), (uint8_t)((float)t.B*t.br));
	}
	strip.show();
	}
}

float get_temp(){
	sensors.requestTemperatures();
	float temp;
	temp = sensors.getTempCByIndex(0);
	uint32_t start = millis();
	while (temp < -100 && millis()-start < 250){
		sensors.requestTemperatures();
		temp = sensors.getTempCByIndex(0);
		//Serial.printf("Temp: %0.2f\n", temp);
	}
	return temp;
}

float get_ambient_temp(){
	sensors2.requestTemperatures();
	float temp;
	temp = sensors2.getTempCByIndex(0);
	uint32_t start = millis();
	while (temp < -100 && millis()-start < 250){
		sensors2.requestTemperatures();
		temp = sensors2.getTempCByIndex(0);
		//Serial.printf("Temp: %0.2f\n", temp);
	}
	return temp;
}


void rainbowCycle(uint8_t wait) {
	static uint32_t time = 0;
	static uint16_t i, j = 0;

	if(millis()-time > wait){
		j++;
		time=millis();
		for(i=0; i< strip.numPixels(); i++) {
      strip.setPixelColor(i, Wheel(((i * 256 / strip.numPixels()) + j) & 255));
    }
    strip.show();
	}
}


// Input a value 0 to 255 to get a color value.
// The colours are a transition r - g - b - back to r.
uint32_t Wheel(byte WheelPos) {
  WheelPos = 255 - WheelPos;
  if(WheelPos < 85) {
    return strip.Color(255 - WheelPos * 3, 0, WheelPos * 3);
  }
  if(WheelPos < 170) {
    WheelPos -= 85;
    return strip.Color(0, WheelPos * 3, 255 - WheelPos * 3);
  }
  WheelPos -= 170;
  return strip.Color(WheelPos * 3, 255 - WheelPos * 3, 0);
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

  //delay(5);

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