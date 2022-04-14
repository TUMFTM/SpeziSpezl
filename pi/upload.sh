#!/bin/bash

#install teensy loader: https://github.com/PaulStoffregen/teensy_loader_cli
#Download and unpack, run make

#install arduino cli https://arduino.github.io/arduino-cli/0.21/installation/

#./arduino-cli lib install --git-url https://github.com/adafruit/Adafruit-MCP23017-Arduino-Library.git
#./arduino-cli lib install --git-url https://github.com/adafruit/Adafruit_NeoPixel.git
#./arduino-cli lib install --git-url https://github.com/ATrappmann/PN5180-Library.git
#./arduino-cli lib install --git-url https://github.com/milesburton/Arduino-Temperature-Control-Library.git
#./arduino-cli lib install --git-url https://github.com/bblanchon/ArduinoJson.git
#./arduino-cli lib install --git-url https://github.com/adafruit/Adafruit_BusIO.git

/home/pi/arduino-cli compile -b teensy:avr:teensy40:usb=serial2,speed=600,opt=o2std,keys=en-us --build-path /home/pi/temp/ /home/pi/spezispezl/firmware/teensy/ ;
chmod 666 /dev/ttyACM2 ;
echo -ne '{"FLASH":true}\n' > /dev/ttyACM1 ; sleep 2 ;
/home/pi/teensy_loader_cli --mcu=TEENSY40 -wsv /home/pi/temp/teensy.ino.hex