#define ELINK_SS 5
#define ELINK_BUSY 4
#define ELINK_RESET 16
#define ELINK_DC 17

#include <GxEPD.h>
#include <GxIO/GxIO_SPI/GxIO_SPI.h>
#include <GxIO/GxIO.h>
#include <qrcodeeink.h>

#include "src/PN5180.h"
#include "src/PN5180ISO15693.h"
#include "src/PN5180ISO14443.h"
//#include "src/PN5180FeliCa.h"

// RFID reader PN5180
#define PIN_CLK 14
#define PIN_MISO 25
#define PIN_MOSI 26
#define PN5180_NSS  27
#define PN5180_BUSY 12
#define PN5180_RST  0

SPIClass* spiH=NULL;

PN5180ISO14443 nfc14443(PIN_MISO,PIN_MOSI,PIN_CLK,PN5180_NSS, PN5180_BUSY, PN5180_RST); 
PN5180ISO15693 nfc15693(PIN_MISO,PIN_MOSI,PIN_CLK,PN5180_NSS, PN5180_BUSY, PN5180_RST);




GxIO_Class io(SPI, ELINK_SS, ELINK_DC, ELINK_RESET);
GxEPD_Class display(io, ELINK_RESET, ELINK_BUSY);

QRcodeEink qrcode (&display);

String card_id ="";
String old_card = "";
uint32_t card_time;
uint32_t card_hold_time = 10000;

void setup() {

    Serial.begin(115200);
    Serial.println("");
    Serial.println("Starting...");

    spiH = new SPIClass(HSPI);

    nfc15693.begin(spiH);
    nfc14443.begin(spiH);

    qrcode.init();
}

void loop() { 
    uint8_t uid[8]={0,0,0,0,0,0,0,0};
    if(get_rfid(uid)){
          card_time = millis() + card_hold_time;
          if(get_card(uid)){
               Serial.println(card_id);
               qrcode.create(String("https://spezispezl.de/?card_id=") + card_id);
          }
    }
    if( card_time && millis() > card_time){
        Serial.println("clear");
        card_id ="";
        old_card = "";
        card_time =0;
        qrcode.screenwhite();
        qrcode.screenupdate();
    }

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

bool get_card(uint8_t* uid){
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