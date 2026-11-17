// Yönetici şifre politikası: sabit kullanıcı adı istisnası YOK.
// Kısa şifre istisnası yalnızca ortam değişkeniyle, açıkça adı verilen bir
// hesap için ve açık onay bayrağıyla etkinleşir; kod içinde gömülü ad yoktur.
export function validateOwner(username,password,allowNamedOwner=false){
 const name=typeof username==='string'?username.normalize('NFC').trim():'';
 const pass=typeof password==='string'?password:'';
 const exceptionUser=String(process.env.OSINT_OWNER_EXCEPTION_USERNAME||'').normalize('NFC').trim();
 const shortAllowed=!!exceptionUser&&name===exceptionUser&&allowNamedOwner&&pass.length>=9;
 const placeholder=/^(change|example|replace)/i.test(pass);
 if(!name||!pass||placeholder||(pass.length<12&&!shortAllowed))
  throw Error('Yönetici adı ve güçlü şifre yapılandırılmalı (en az 12 karakter).');
}
