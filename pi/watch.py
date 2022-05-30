import os
from gpiozero import CPUTemperature
from gpiozero import LEDBarGraph, LoadAverage
import requests
from requests.auth import HTTPBasicAuth
import time


api = 'https://spezispezl.de/api/log_sensor'
user = 'spezl'
passwd = 'spezispezl2022'

#os.system('sudo reboot')

def send_values():
	la = LoadAverage().value
	print(la)
	cpu = CPUTemperature()
	print(cpu.temperature)

	f = open("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq")
	clock = (int(f.read()) / 1000)
	print("%u MHz" % clock)


	r = requests.post(api, data={'id': '5', 'value': cpu.temperature}, verify=False, auth=HTTPBasicAuth(user, passwd)) #id=2&value=
	print(r.text)
	r = requests.post(api, data={'id': '6', 'value': la}, verify=False, auth=HTTPBasicAuth(user, passwd)) #id=2&value=
	r = requests.post(api, data={'id': '7', 'value': clock}, verify=False, auth=HTTPBasicAuth(user, passwd)) #id=2&value=



starttime = time.time()
updatefreq = 10.0
while True:
    send_values()
    time.sleep(updatefreq - ((time.time() - starttime) % updatefreq))
