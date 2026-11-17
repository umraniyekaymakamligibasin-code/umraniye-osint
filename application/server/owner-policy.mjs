export function validateOwner(username,password,allowNamedOwner=false){
 const namedOwnerException=username?.normalize('NFC')==='basınadmin'&&allowNamedOwner&&password?.length>=9;
 if(!username||(!namedOwnerException&&(!password||password.length<12))||/^(change|example|replace)/i.test(password))throw Error('Yönetici adı ve güçlü şifre yapılandırılmalı. Kısa parola yalnız açıkça etkinleştirilen basınadmin sahibi istisnasında kullanılabilir.');
}
