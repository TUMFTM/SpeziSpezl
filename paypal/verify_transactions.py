import json
import requests
from requests.auth import HTTPBasicAuth
import datetime
from sqlalchemy import create_engine
import config

cnx = create_engine(config.postgres_str)


def get_transactions():
    start_d = (datetime.datetime.utcnow()- datetime.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S-0000")
    end_d = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S-0000")

    url = "https://api-m.paypal.com/v1/reporting/transactions?start_date={start_date}&end_date={end_date}&fields=all".format (start_date = start_d, end_date=end_d)
    print(url)
    r = requests.get(url, auth=HTTPBasicAuth(config.client_id, config.client_secret))  
    if(len(r.content) > 20):
        return r.content
    else:
        print(r.content)
        return ""


# T0011: paypal freunde
# T0300: bank get
# T0006: waren&dienstleistungen
# T0007: geldausgang?
# T1501: geldausgang ?
# T1105: gedausgang?

def balance():
    url = "https://api-m.paypal.com/v1/reporting/balances?currency_code=ALL&as_of_time={time}".format (time = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S-0000"))
    r = requests.get(url, auth=HTTPBasicAuth(config.client_id, config.client_secret))  
    if(len(r.content) > 20):
        print(r.content)

def verify(tid):
    print(tid)
    qstr = '''update spezispezl.transactions set verified = true where transaction_id='{tid}'; '''.format(tid = tid)
    try:
        user = cnx.execute(qstr)
    except:
        print("verification error")

def parse_content(c):
    js = json.loads(c)['transaction_details']
    for j in js:
        if 'transaction_info' in j:
            #print(j['transaction_info'])
            amount = float(j['transaction_info']['transaction_amount']['value'])
            status = j['transaction_info']['transaction_status']
            event = j['transaction_info']['transaction_event_code']
            if status == 'S' and  amount > 0 and event != 'T0007' and event != 'T1501' and event != 'T1105':
                t_date = j['transaction_info']['transaction_initiation_date']
                currency = j['transaction_info']['transaction_amount']['currency_code']
                payer=j['payer_info']['email_address']
                tid=j['transaction_info']['transaction_id']
                print(amount, currency, payer, t_date)
                verify(tid)
            #else:
            #    print(j)
    
#balance()
parse_content(get_transactions())