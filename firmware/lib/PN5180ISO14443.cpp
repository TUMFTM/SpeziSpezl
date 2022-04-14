// NAME: PN5180ISO14443.h
//
// DESC: ISO14443 protocol on NXP Semiconductors PN5180 module for Arduino.
//
// Copyright (c) 2019 by Dirk Carstensen. All rights reserved.
//
// This file is part of the PN5180 library for the Arduino environment.
//
// This library is free software; you can redistribute it and/or
// modify it under the terms of the GNU Lesser General Public
// License as published by the Free Software Foundation; either
// version 2.1 of the License, or (at your option) any later version.
//
// This library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Lesser General Public License for more details.
//
// #define DEBUG 1

#include <Arduino.h>
#include "PN5180ISO14443.h"
#include "PN5180.h"
#include "Debug.h"

PN5180ISO14443::PN5180ISO14443(uint8_t MISOpin, uint8_t MOSIpin,uint8_t CLKpin, uint8_t SSpin, uint8_t BUSYpin, uint8_t RSTpin) 
              : PN5180(MISOpin, MOSIpin, CLKpin, SSpin, BUSYpin, RSTpin) {
}

bool PN5180ISO14443::setupRF(uint8_t tx_c, uint8_t rx_c) {
  PN5180DEBUG(F("Loading RF-Configuration...\n"));
  _tx_c = tx_c;
  _rx_c = rx_c;
  if (loadRFConfig(_tx_c, _rx_c)) {  // ISO14443 parameters
    PN5180DEBUG(F("done.\n"));
  }
  else return false;

  PN5180DEBUG(F("Turning ON RF field...\n"));
  if (setRF_on()) {
    PN5180DEBUG(F("done.\n"));
  }
  else return false;

  return true;
}

uint16_t PN5180ISO14443::rxBytesReceived() {
	uint32_t rxStatus;
	uint16_t len = 0;
	readRegister(RX_STATUS, &rxStatus);
	bool valid = getIRQStatus() & 0x01;
	clearIRQStatus(0xffffffff); 
	// Lower 9 bits has length
	if(valid){
		len = (uint16_t)(rxStatus & 0x000001ff);
	} else {
		len = 0;
	}

	return len;
}
/*
* buffer : must be 10 byte array
* buffer[0-1] is ATQA
* buffer[2] is sak
* buffer[3..6] is 4 byte UID
* buffer[7..9] is remaining 3 bytes of UID for 7 Byte UID tags
* kind : 0  we send REQA, 1 we send WUPA
*
* return value: the uid length:
* -	zero if no tag was recognized
* - -1 general error
* - -2 card in field but with error
* -	single Size UID (4 byte)
* -	double Size UID (7 byte)
* -	triple Size UID (10 byte) - not yet supported
*/
int8_t PN5180ISO14443::activateTypeA(uint8_t *buffer, uint8_t kind) {
	uint8_t cmd[7];
	uint8_t uidLength = 0;
	
	// Load standard TypeA protocol already done in reset()
	if (!loadRFConfig(0x0, 0x80)) {
		Serial.print(F("*** ERROR: Load standard TypeA protocol failed!\n"));
		return -1;
	}
	// activate RF field
	setRF_on();
	// wait RF-field to ramp-up
	delay(10);
	
	// OFF Crypto
	if (!writeRegisterWithAndMask(SYSTEM_CONFIG, 0xFFFFFFBF)) {
		Serial.print(F("*** ERROR: OFF Crypto failed!\n"));
		return -1;
	}
	// clear RX CRC
	if (!writeRegisterWithAndMask(CRC_RX_CONFIG, 0xFFFFFFFE)) {
		Serial.print(F("*** ERROR: Clear RX CRC failed!\n"));
		return -1;
	}
	// clear TX CRC
	if (!writeRegisterWithAndMask(CRC_TX_CONFIG, 0xFFFFFFFE)) {
		Serial.print(F("*** ERROR: Clear TX CRC failed!\n"));
		return -1;
	}

	// set the PN5180 into IDLE state  
	if (!writeRegisterWithAndMask(SYSTEM_CONFIG, 0xFFFFFFF8)) {
		Serial.print(F("*** ERROR: set IDLE state failed!\n"));
		return -1;
	}
		
	  // activate TRANSCEIVE routine  
	if (!writeRegisterWithOrMask(SYSTEM_CONFIG, 0x00000003)) {
		Serial.print(F("*** ERROR: Activates TRANSCEIVE routine failed!\n"));
		return -1;
	}
	
	// wait for wait-transmit state
	PN5180TransceiveStat transceiveState = getTransceiveState();
	if (PN5180_TS_WaitTransmit != transceiveState) {
		Serial.print(F("*** ERROR: Transceiver not in state WaitTransmit!?\n"));
		return -1;
	}
	
/*	uint8_t irqConfig = 0b0000000; // Set IRQ active low + clear IRQ-register
    writeEEprom(IRQ_PIN_CONFIG, &irqConfig, 1);
    // enable only RX_IRQ_STAT, TX_IRQ_STAT and general error IRQ
    writeRegister(IRQ_ENABLE, RX_IRQ_STAT | TX_IRQ_STAT | GENERAL_ERROR_IRQ_STAT);  
*/

	// clear all IRQs
	clearIRQStatus(0xffffffff); 

	//Send REQA/WUPA, 7 bits in last byte
	cmd[0] = (kind == 0) ? 0x26 : 0x52;
	if (!sendData(cmd, 1, 0x07)) {
		PN5180DEBUG(F("*** ERROR: Send REQA/WUPA failed!\n"));
		return 0;
	}
	
	// wait some mSecs for end of RF receiption
	delay(10);

	// READ 2 bytes ATQA into  buffer
	if (!readData(2, buffer)) {
		PN5180DEBUG(F("*** ERROR: READ 2 bytes ATQA failed!\n"));
		return 0;
	}
	unsigned long startedWaiting = millis();
	while (PN5180_TS_WaitTransmit != getTransceiveState()) {   
		if (millis() - startedWaiting > 200) {
			PN5180DEBUG(F("*** ERROR: timeout in PN5180_TS_WaitTransmit!\n"));
			return -1; 
		}	
	}
	
	// clear all IRQs
	clearIRQStatus(0xffffffff); 
	
	// send Anti collision 1, 8 bits in last byte
	cmd[0] = 0x93; // cascade level 1
	cmd[1] = 0x20; // NVB inital value is 0x20
	if (!sendData(cmd, 2, 0x00)) {
		PN5180DEBUG(F("*** ERROR: Send Anti collision 1 failed!\n"));
		return -2;
	}
	
	// wait some mSecs for end of RF receiption
	delay(5);

	uint8_t numBytes = rxBytesReceived();
	if (numBytes != 5) {
		PN5180DEBUG(F("*** ERROR: Read 5 bytes sak failed!\n"));
		return -2;
	};
	// read 5 bytes sak, we will store at offset 2 for later usage
	if (!readData(5, cmd+2)) {
		Serial.println("Read 5 bytes failed!");
		return -2;
	}
	// We do have a card now! enable CRC and send anticollision
	// save the first 4 bytes of UID
	for (int i = 0; i < 4; i++) buffer[3+i] = cmd[2 + i];
	
	//Enable RX CRC calculation
	if (!writeRegisterWithOrMask(CRC_RX_CONFIG, 0x01)) 
	  return -2;
	//Enable TX CRC calculation
	if (!writeRegisterWithOrMask(CRC_TX_CONFIG, 0x01)) 
	  return -2;

	//Send Select anti collision 1, the remaining bytes are already in offset 2 onwards
	cmd[0] = 0x93;
	cmd[1] = 0x70;
	if (!sendData(cmd, 7, 0x00)) {
		// no remaining bytes, we have a 4 byte UID
		return 4;
	}

	delay(5);
	//Read 1 byte SAK into buffer[2]
	if (!readData(1, buffer+2)){ 
	  return -2;
	}
	// Check if the tag is 4 Byte UID or 7 byte UID and requires anti collision 2
	// If Bit 3 is 0 it is 4 Byte UID
	if ( buffer[2] != 0x88 && (buffer[2] & 0x04) == 0) {
		// Take first 4 bytes of anti collision as UID store at offset 3 onwards. job done
		for (int i = 0; i < 4; i++) buffer[3+i] = cmd[2 + i];
		uidLength = 4;
		//Serial.println("IS 4 byte ID");
	}
	else {
		// Take First 3 bytes of UID, Ignore first byte 88(CT)
		if (cmd[2] != 0x88){
		  return 0;
		}
		for (int i = 0; i < 3; i++) buffer[3+i] = cmd[3 + i];

		// Clear RX CRC
		if (!writeRegisterWithAndMask(CRC_RX_CONFIG, 0xFFFFFFFE)) 
	     return -2;
		// Clear TX CRC
		if (!writeRegisterWithAndMask(CRC_TX_CONFIG, 0xFFFFFFFE)) 
	     return -2;

		// Do anti collision 2
		cmd[0] = 0x95;
		cmd[1] = 0x20;
		if (!sendData(cmd, 2, 0x00)){
	      return -2;
	    }
	 	delay(5);
		//Read 5 bytes. we will store at offset 2 for later use
		uint8_t buf2 [5];
		if (!readData(5, buf2)){
	      return -2;
	    }

		// first 4 bytes belongs to last 4 UID bytes, we keep it.
		for (int i = 0; i < 4; i++) {
		  buffer[6 + i] = buf2[i];
		}
		//Enable RX CRC calculation
		if (!writeRegisterWithOrMask(CRC_RX_CONFIG, 0x01)) 
	      return -2;
		//Enable TX CRC calculation
		if (!writeRegisterWithOrMask(CRC_TX_CONFIG, 0x01)) 
	      return -2;

	  
	  for (int i = 0; i < 5; i++){cmd[2+i] = buf2[i];}
		//Send Select anti collision 2 
		cmd[0] = 0x95;
		cmd[1] = 0x70;
		if (!sendData(cmd, 7, 0x00)){
	      return -2;
	    }

	  delay(5);
		//Read 1 byte SAK into buffer[2]
		if (!readData(1, buffer+2)){
	      return -2;
	    }
		uidLength = 7;
	}
    return uidLength;
}

bool PN5180ISO14443::mifareBlockRead(uint8_t blockno, uint8_t *buffer) {
	bool success = false;
	uint16_t len;
	uint8_t cmd[2];
	// Send mifare command 30,blockno
	cmd[0] = 0x30;
	cmd[1] = blockno;
	if (!sendData(cmd, 2, 0x00))
	  return false;
	//Check if we have received any data from the tag
	delay(5);
	len = rxBytesReceived();
	if (len == 16) {
		// READ 16 bytes into  buffer
		if (readData(16, buffer))
		  success = true;
	}
	return success;
}


uint8_t PN5180ISO14443::mifareBlockWrite16(uint8_t blockno, uint8_t *buffer) {
	uint8_t cmd[2];
	// Clear RX CRC
	writeRegisterWithAndMask(CRC_RX_CONFIG, 0xFFFFFFFE);

	// Mifare write part 1
	cmd[0] = 0xA0;
	cmd[1] = blockno;
	sendData(cmd, 2, 0x00);
	readData(1, cmd);

	// Mifare write part 2
	sendData(buffer,16, 0x00);
	delay(10);

	// Read ACK/NAK
	readData(1, cmd);

	//Enable RX CRC calculation
	writeRegisterWithOrMask(CRC_RX_CONFIG, 0x1);
	return cmd[0];
}

bool PN5180ISO14443::mifareHalt() {
	uint8_t cmd[2];
	//mifare Halt
	cmd[0] = 0x50;
	cmd[1] = 0x00;
	sendData(cmd, 2, 0x00);	
	return true;
}

int8_t PN5180ISO14443::readCardSerial(uint8_t *buffer) {
  
    uint8_t response[10];
	int8_t uidLength;
	// Always return 10 bytes
    // Offset 0..1 is ATQA
    // Offset 2 is SAK.
    // UID 4 bytes : offset 3 to 6 is UID, offset 7 to 9 to Zero
    // UID 7 bytes : offset 3 to 9 is UID
    for (int i = 0; i < 10; i++){response[i] = 0;}
	// try to activate Type A until response or timeout
	uidLength = activateTypeA(response, 0);

	if (uidLength <= 0)
	  return uidLength;
	// UID length must be at least 4 bytes
	if (uidLength < 4)
	  return 0;

	if ((response[0] == 0xFF) && (response[1] == 0xFF))
	  uidLength = 0;
		
	// first UID byte should not be 0x00 or 0xFF
	if ((response[3] == 0x00) || (response[3] == 0xFF)) 
		uidLength = 0;
		
	// check for valid uid, skip first byte (0x04)
	// 0x04 0x00 0xFF 0x00 => invalid uid
	bool validUID = false;
	for (int i = 1; i < uidLength; i++) {
		if ((response[i+3] != 0x00) && (response[i+3] != 0xFF)) {
			validUID = true;
			break;
		}
	}
	if (uidLength == 4) {
		if ((response[3] == 0x88)) {
			// must not be the CT-flag (0x88)!
			validUID = false;
		};
	}
	if (uidLength == 7) {
		if ((response[6] == 0x88)) {
			// must not be the CT-flag (0x88)!
			validUID = false;
		};
		if ((response[6] == 0x00) && (response[7] == 0x00) && (response[8] == 0x00) && (response[9] == 0x00)) {
			validUID = false;
		};
		if ((response[6] == 0xFF) && (response[7] == 0xFF) && (response[8] == 0xFF) && (response[9] == 0xFF)) {
			validUID = false;
		};
	};
//	mifareHalt();
	if (validUID) {
		for (int i = 0; i < uidLength; i++) {
			buffer[6-i] =  response[i+3];
		}
		return uidLength;
	} else {
		return 0;
	}
}

bool PN5180ISO14443::isCardPresent() {

    uint8_t buffer[10];
	return (readCardSerial(buffer) >=4);
}
