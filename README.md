# SpeziSpezl
A vending machine system with RFID authentification, payment transaction and resupply tracking and PayPal deposit support. The system is uses at the Institute of Automotive Technology to supply the students and employees with cool drinks and fresh ground coffee. The integrated accounting system can be charged with PayPal and the user can see all transactions in his user account.
All services and statistical data is monitored and analyzed with a grafana dashboard, sending alerts if someone forgot to clean the coffee machine or to join the party if a little more beer was bought.

#### Key Facts:
 * fully automatic PayPal charging
 * Transaction tracking in responsive web app
 * Support for price groups (student, employee, guest...)
 * Multiple RFID tag support per user account
 * Option to trust users, letting them overdraw their account
 * wide RFID support (ISO 15693 and ISO 14443 tags)
 * Smartphone registration via WebNFC (Chrome on Android only)
 * Sale statistics and system monitoring with Grafana and Prometheus
 * Login token stored in cookies with multi device support
 * Hashed passwords, e-mail verification, change password, forgot password
## Frontend
### User frontend
A simple JS + CSS frontend for user account manangement, transaction overview and some user settings.    
Depending on user role vending machine fillup and submission of supply expenses is possible
## Vending Frontend
The vending machine frontend is designed for an old Sielaff FK90 bottle vending machine, which is retrofitteted with a rasberry Pi 3B, a 1024x600px IPS HDMI display and a Teensy 4.0 for controlling the machines hardware and the RFID card reader. The teensy is running in dual CDC serial mode, providing one serial port to be connected as WebSerial to the chromium browser. The other port is used for switching to bootloader mode by sending a corresponding command.   
data exchange is done with json strings.

## Backend
The backend is written in NodeJs and split into two parts. The user backend which is avaliable for public and a vending machine backend which is protected by basic auth. Both backend endpoints have a nginx reverse proxy for providing HTTPS and connect to a PostgreSQL databeas for storing accounts, cards, tokens, transactions and sensor (mostly temperature) values.
### User Backend


### Vending Backend



## Vending machine hardware
As a RFID card reader a NXP PN5180 is used in mixed mode (fast switching between ISO 15693 and ISO 14443) connected either to an ESP32 or a teensy (could be any other µC as well). The ESP32 variant is a standalone device connecting to WiFi (eduroam), the other exchange JSON messages with an embedded linux system (raspi) via uart (USB CDC) which is then handling the network connection. All hardware connects to the same vending API.
