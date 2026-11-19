import json,sys,smtplib,ssl,hashlib
from email.message import EmailMessage

def deliver(d,smtp_factory=smtplib.SMTP):
    sender='umraniyeosint@gmail.com'
    address=d.get('to','')
    if any(c in address for c in '\r\n') or '@' not in address: return {'ok':False,'definitelyNotSent':True,'code':'recipient_invalid'}
    message=EmailMessage();message['From']=sender;message['To']=address
    message['Subject']='Ümraniye OSINT kurum panelinde yeni kayıt'
    message['Message-ID']='<'+hashlib.sha256(d['idempotencyKey'].encode()).hexdigest()+'@osint.umraniyeosint.com>'
    message.set_content(d['text'])
    data_started=False
    accepted=False
    try:
        with smtp_factory('smtp.gmail.com',587,timeout=20) as smtp:
            smtp.ehlo();smtp.starttls(context=ssl.create_default_context());smtp.ehlo();smtp.login(sender,d['password'])
            # After entering DATA, a dropped connection can hide a successful acceptance.
            data_started=True
            refused=smtp.send_message(message)
            if refused:return {'ok':False,'definitelyNotSent':True,'code':'recipient_refused'}
            # The message is accepted here; a later QUIT/close failure must not turn it into 'unknown'.
            accepted=True
            return {'ok':True}
    except smtplib.SMTPSenderRefused:
        return {'ok':False,'definitelyNotSent':True,'code':'sender_refused'}
    except smtplib.SMTPRecipientsRefused:
        return {'ok':False,'definitelyNotSent':True,'code':'recipient_refused'}
    except smtplib.SMTPDataError:
        return {'ok':False,'definitelyNotSent':True,'code':'data_rejected'}
    except Exception:
        if accepted:return {'ok':True}
        return {'ok':False,'definitelyNotSent':not data_started,'code':'smtp_failed' if not data_started else 'delivery_outcome_unknown'}

if __name__=='__main__':
    try: result=deliver(json.load(sys.stdin))
    except Exception:result={'ok':False,'definitelyNotSent':True,'code':'invalid_payload'}
    print(json.dumps(result))
