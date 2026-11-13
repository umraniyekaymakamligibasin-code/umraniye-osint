const fs=require('node:fs');
(async()=>{
  const base='/opt/umraniye-osint-deneme/server/';
  const {curateSocial}=await import(base+'social-quality.mjs');
  const html=fs.readFileSync(base+'social.html','utf8');
  const start=html.indexOf('function norm(');
  const end=html.indexOf('function safeLink(',start);
  if(start<0||end<0)throw Error('Kod sinirlari bulunamadi');
  const candidate=fs.readFileSync(base+'merge-candidate.js','utf8');
  const run=new Function(html.slice(start,end)+'\n'+candidate+
    '\nreturn rows=>mergeEventGroups(groupItems(rows));')();
  let failed=0,id=0;
  function check(name,ok){
    console.log((ok?'GECTI: ':'KALDI: ')+name);
    if(!ok)failed++;
  }
  const item=(text,date='2026-10-24T10:00:00Z')=>({
    url:'https://example.test/'+(++id),publishedAt:date,
    viewText:text,viewTitle:text,priorityLevel:'P2'
  });
  const text="Ümraniye Güven Sanayi Sitesi'nde balkon çöktü, 3 işçi yaralandı.";
  const a=item(text);
  const generic=item("Ümraniye sanayi sitesinde balkon çöktü, 3 işçi yaralandı.");
  const other=item(text.replace('Güven','Yıldız'));
  const cases=[
    ['Farkli yayin gunu',[a,item(text,'2026-10-25T10:00:00Z')],2],
    ['Ayni gunde 13 saat fark',[item(text,'2026-10-24T00:00:00Z'),
      item(text,'2026-10-24T13:00:00Z')],2],
    ['Tam 12 saat siniri',[item(text,'2026-10-24T00:00:00Z'),
      item(text,'2026-10-24T12:00:00Z')],1],
    ['Gecersiz tarih',[a,item(text,'bilinmiyor')],2],
    ['Farkli sanayi sitesi',[a,other],2],
    ['Farkli olay turu',[a,item(text.replace('balkon çöktü','yangın çıktı'))],2],
    ['Farkli yarali sayisi',[a,item(text.replace('3 işçi','4 işçi'))],2],
    ['Farkli olay tarihi',[item(text+' Olay 24 Ekim 2026 tarihinde yaşandı.'),
      item(text+' Olay 23 Ekim 2026 tarihinde yaşandı.')],2],
    ['Farkli mahalleler',[item(text+' Çakmak Mahallesi.'),
      item(text+' Elmalıkent Mahallesi.')],2],
    ['Belirsiz haber ayri',[a,other,generic],3],
    ['Ayni olay birlesiyor',[a,generic],1]
  ];
  function permutations(xs){
    if(xs.length<2)return [xs];
    return xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i))
      .map(rest=>[x,...rest]));
  }
  for(const [name,rows,count] of cases)
    check(name,permutations(rows).every(p=>run(p).length===count));

  const raw=JSON.parse(fs.readFileSync(0,'utf8'));
  const rows=raw.map(curateSocial).filter(Boolean)
    .map(e=>({...e,viewText:e.description,viewTitle:e.title}));
  const before=JSON.stringify(rows);
  const canonical=xs=>JSON.stringify(xs.map(e=>JSON.stringify(e)).sort());
  check('Gercek 5 haber tek kart',rows.length===5&&run(rows).length===1);
  check('Kaynaklar, saatler ve tum alanlar korundu',
    canonical(run(rows).flatMap(g=>g.items))===canonical(rows));
  check('Gercek haberlerin 120 siralamasi',
    rows.length===5&&permutations(rows).every(p=>run(p).length===1));
  check('Girdi kayitlari degismedi',JSON.stringify(rows)===before);
  console.log('BASARISIZ TEST:',failed,'— PANEL DEGISTIRILMEDI');
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
