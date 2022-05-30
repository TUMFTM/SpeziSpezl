import imaplib
import email
from email.header import decode_header
import re
from sqlalchemy import create_engine
from smtplib import SMTP_SSL, SMTP_SSL_PORT
from email.mime.text import MIMEText
import config

supportmail = 'schmid.flori@t-online.de'


cnx = create_engine(config.postgres_str)


def send_mail(mode, amount, mail, loaded):
    from_email = 'Spezispezl <spezispezl@mail.de>'  # or simply the email address
    to_emails = [mail]
    if mode == 'insert':
        body = "Die Aufladung über {loaded:.2f}€ war erfolgreich.\nDein neues Guthaben beträgt {amount:.2f}€".format(loaded = loaded, amount=amount)
        msg=MIMEText(body.encode('utf-8'), _charset='utf-8')
        msg['Subject'] = 'Spezispezl: Aufladung'
        msg['From'] = from_email
        msg['To'] = mail

    if mode == 'error':
        body = "Parsen der Aufladung fehlgeschlagen: {loaded}".format(loaded = loaded)
        msg=MIMEText(body.encode('utf-8'), _charset='utf-8')
        msg['Subject'] = 'Spezispezl: Paypal Mail error'
        msg['From'] = from_email
        msg['To'] = mail


    try:
        smtp_server = SMTP_SSL(config.SMTP_HOST, port=SMTP_SSL_PORT)
        smtp_server.login(config.username, config.password)
        smtp_server.sendmail(from_email, to_emails, msg.as_string())
        smtp_server.quit()
        print("Mail sent")
    except Exception as e:
        print(e)


def insert_transaction(comment, amount, fee, tid, name, surname):
    user_id = None
    qstr = '''select user_id from spezispezl."user" where lower(mail)='{mail}'; '''.format(mail = comment.lower())
    user = cnx.execute(qstr).fetchall()
    if len(user) > 0:
        user_id = user[0][0]
    else:
        qstr = '''select user_id from spezispezl."user" where lower(name)='{name}' and lower(surname)='{surname}'; '''.format(name = name.lower(), surname = surname.lower())
        print(qstr)
        user = cnx.execute(qstr).fetchall()
        if len(user) > 0:
            user_id = user[0][0]
        else:
            qstr = '''select user_id from spezispezl."user" where lower(name) like '%%{name}'; '''.format(name = name.lower())
            print(qstr)
            user = cnx.execute(qstr).fetchall()
            #print(user)
            if len(user) == 1:
                user_id = user[0][0]
            else:
                print("no user found")
    print("User Id: " + str(user_id))
    if user_id:
        qstr = '''insert into spezispezl.transactions (user_id, source, product, price, transaction_id, sender, balance_new, fee) values ({uid},'paypal', 'deposit', {amount}, '{tid}', '{sender}', (select balance from spezispezl.user u where u.user_id = {uid}) + {amount} , {fee}) ;'''.format(uid= user_id, amount = amount, tid = tid, sender = name +', '+surname, fee= fee )
        qstr2 = '''update spezispezl.user set balance = balance + {amount} where user_id = {uid} returning balance, (select mail from spezispezl.user where user_id='{uid}');'''.format(uid= user_id, amount = amount)
        try: 
            cnx.execute(qstr)
            balance = cnx.execute(qstr2).fetchall()
            if len(balance) > 0:
                send_mail('insert', balance[0][0], balance[0][1], amount)
                print("OK: ", balance[0][0], balance[0][1], amount)
                return True
        except Exception as e:
            print("insert error")
            print(e)
            return False
        print("unknown error")
        return False
    else:
        print("Can not find user_id")
        send_mail('error', 0, supportmail, ["Can not find user ID for name: {name} surname: {surname} comment: {comment}".format(name=name, surname=surname, comment=comment)])
    return False



def paypal_parse(html):
    html = html.replace("\n", '')
    #print(html)
    fee = 0
    comment = ''
    surname = ''
    name = ''
    amount = 0
    comment_pattern = r'Mitteilung von .*?:(?:<.*?>\s*)*([\w@.-]*).*'
    name_pattern = r'>([\w -]*) hat Ihnen ([\d,]*).*?€.*gesendet<'
    tid_pattern = r'.*Transaktionscode(?:\s*<.*?>\s*)*(\w*).*?Erhaltener Betrag(?:\s*<.*?>\s*)*([0-9,.]*)'
    pattern_fee = r'.*Gebühr(?:\s*<.*?>\s*)*([0-9,.]*)'

    m = re.search(comment_pattern, html)
    if m:
        for g in m.groups():
            print(g)
        if len(m.groups()) == 1:
            comment = m.group(1)

    m = re.search(name_pattern, html)
    if m:
        for g in m.groups():
            print(g)
        if len(m.groups()) == 2:
            surname = m.group(1).strip().split(' ')[0]
            name = m.group(1).strip().split(' ')[-1]
            #print("Surname: "+ surname)
            #print("Name: "+ name)

    m = re.search(tid_pattern, html)
    if m:
        for g in m.groups():
            print(g)
        if len(m.groups()) == 2:
            #surname = m.group(1)
            #name = m.group(2)
            tid = m.group(1)
            amount = float(m.group(2).replace(',','.'))
            #amount2 = float(m.group(5).replace(',','.'))
            #if amount1 == amount2:
            #    amount = amount1
            #else:
            #    print("Amount does not match")


    m = re.search(pattern_fee, html)
    if m:
        for g in m.groups():
            print(g)
        if len(m.groups()) == 1:
            #print(m.groups())
            fee = float(m.group(1).replace(',','.'))
            print("Fee:", fee)

    print(surname, name, comment, tid, amount- fee)    

    if name and amount - fee > 0 and tid:
        return insert_transaction(comment, amount - fee, fee, tid, name, surname)
    else:
        if name !='' or surname != '' or amount !=0: # found something but can not insert
            send_mail('error', 0, supportmail, ["PayPal pase error for name: {name} surname: {surname} comment: {comment}".format(name=name, surname=surname, comment=comment)])
        return True #delete mail

def handle_mails():
    imap = imaplib.IMAP4_SSL(config.server)
    imap.login(config.username, config.password)
    status, messages = imap.select("INBOX")
    messages = int(messages[0])
    print(messages, " new mails")

    for i in range(messages, 0, -1):
        try:
            ret = ""
            res, msg = imap.fetch(str(i), "(RFC822)")
            for response in msg:
                if isinstance(response, tuple):
                    msg = email.message_from_bytes(response[1])
                    subject, encoding = decode_header(msg["Subject"])[0]
                    if "Return-Path" in msg:
                        sender, encoding = decode_header(msg["Return-Path"])[0]
                        if encoding and isinstance(subject, bytes):
                            subject = subject.decode(encoding)

                        if subject == "Sie haben eine Zahlung erhalten" and sender == '<service@paypal.de>':
                            if msg.is_multipart():
                                for part in msg.walk():
                                    content_type = part.get_content_type()
                                    content_disposition = str(part.get("Content-Disposition"))
                                    try:
                                        body = part.get_payload(decode=True).decode()
                                    except:
                                        pass
                                    if content_type == "text/plain" and "attachment" not in content_disposition:
                                        ret = body
                                    elif "attachment" in content_disposition:
                                        ret = part.get_payload(decode=True)
                            else:
                                content_type = msg.get_content_type()
                                body = msg.get_payload(decode=True).decode()
                                if content_type == "text/plain":
                                    ret = body
                            if content_type == "text/html":
                                ret = body
                            if paypal_parse (ret):
                                print("insert ok. moving mail")
                                imap.copy(str(i), "imported")
                                imap.store(str(i), '+FLAGS', '\\Deleted')
                                return

                imap.copy(str(i), "no_fit")
                imap.store(str(i), '+FLAGS', '\\Deleted')
        except Exception as e:
            print(e)
            send_mail('error', 0, 'schmid.flori@t-online.de', e)
    imap.close()
    imap.logout()


handle_mails()