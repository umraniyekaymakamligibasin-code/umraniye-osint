const briefDay=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function briefText(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,'').replace(/\b(?:WhatsApp|Facebook|Telegram)\b/gi,'').replace(/\s+/g,' ').trim()}
export function publisherName(value){return briefText(value).split(/\s*[·|]\s*/)[0].replace(/\s*[-–]\s*Ümraniye.*$/i,'').trim()||'Yayıncı belirtilmedi'}
export function briefDescription(event){
 let text=briefText(event.description).replace(/^HABER\s*:\s*ÜMRANİYE GÜNDEMİ\s*/i,'');const title=briefText(event.title);if(text.startsWith(title))text=text.slice(title.length).trim();
 if(!text)return 'Bu kayıt için başlık dışında ayrıntı alınamadı.';
 const sentences=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('tr',{granularity:'sentence'}).segment(text)].map(s=>s.segment.trim()):[text];
 text=[...new Set(sentences)].slice(0,3).join(' ');if(text.length>650){const cut=text.slice(0,650);text=cut.slice(0,cut.lastIndexOf(' '))+'…'}return text;
}
export function prepareBriefing({events=[],socialEvents=[],date,generatedAt=new Date().toISOString()}){
 const day=date||briefDay(generatedAt),valid=[...events,...socialEvents.map(e=>({...e,briefStream:'social'}))].filter(e=>e.publishedAt&&Number.isFinite(Date.parse(e.publishedAt))&&briefDay(e.publishedAt)===day).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const rows=valid.map(e=>({id:e.id,title:briefText(e.title).slice(0,240),detail:briefDescription(e),topic:briefText(e.nationalCritical?(e.nationalUrgent===false?'Ulusal olay takibi':e.nationalCategory||'Ulusal kritik'):e.topic||'Genel gündem'),location:briefText(e.nationalCritical?e.nationalLocation||'Türkiye geneli':e.neighborhood||'İlçe geneli'),publishedAt:e.publishedAt,national:!!e.nationalCritical,social:e.briefStream==='social',sources:[...new Set((e.sources?.length?e.sources:[e]).map(s=>publisherName(s.sourceName||e.sourceName)))]}));
 const local=rows.filter(e=>!e.national&&!e.social),national=rows.filter(e=>e.national&&!e.social),social=rows.filter(e=>e.social),counts={};for(const e of local)counts[e.topic]=(counts[e.topic]||0)+1;
 const topics=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>t.toLocaleLowerCase('tr-TR')+' ('+n+')').join(', ');
 const summary=rows.length?'Bugün yayımlanan haberlerden '+rows.length+' kayıt derlenmiştir. Bunların '+local.length+' adedi Ümraniye gündemine, '+national.length+' adedi ulusal gündeme, '+social.length+' adedi sosyal medya haberlerine ilişkindir.'+(topics?' Yerel gündemde öne çıkan konular: '+topics+'.':''):'Bugün yayımlanan ve izleme kapsamına giren bir haber kaydı bulunmamaktadır.';
 return {day,generatedAt,rows,local,national,social,summary};
}
export function createBriefingPdf(input,{jsPDF=globalThis.jspdf.jsPDF,fonts,logo}={}){
 const report=prepareBriefing(input),doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 doc.addFileToVFS('NotoSans-Regular.ttf',fonts.normal);doc.addFileToVFS('NotoSans-Bold.ttf',fonts.bold);doc.addFont('NotoSans-Regular.ttf','NotoSans','normal');doc.addFont('NotoSans-Bold.ttf','NotoSans','bold');
 const red=[183,36,56],ink=[31,45,65],muted=[99,113,132],left=17,right=193;let y=0,index=0;
 const font=(size=11,bold=false,color=ink)=>{doc.setFont('NotoSans',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color)};
 const lines=(text,width,size,bold=false)=>{font(size,bold);return doc.splitTextToSize(text,width)};
 const dateLabel=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'long'}).format(new Date(report.day+'T12:00:00+03:00'));
 const timeLabel=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(report.generatedAt));
 function header(first=false){doc.setFillColor(...red);doc.rect(0,0,210,31,'F');if(logo){doc.setFillColor(255,255,255);doc.circle(24.5,15,8.5,'F');doc.addImage(logo,'PNG',17,7.5,15,15)}font(10,true,[255,255,255]);doc.text('T.C. ÜMRANİYE KAYMAKAMLIĞI',36,12);font(14,true,[255,255,255]);doc.text('GÜNLÜK GÜNDEM BRİFİNGİ',36,22);y=first?43:42;if(!first){font(9,false,muted);doc.text(dateLabel+' · Devam',left,y);y+=10}}
 function next(){doc.addPage();header()}
 header(true);font(22,true);doc.text('Günlük gündem brifingi',left,y);y+=10;font(10,false,muted);doc.text(dateLabel,left,y);doc.text('Hazırlanma: '+timeLabel+' · Türkiye saati',right,y,{align:'right'});y+=9;
 doc.setFillColor(242,245,248);doc.roundedRect(left,y,176,25,2,2,'F');const metrics=[['DERLENEN HABER',report.rows.length],['ÜMRANİYE',report.local.length],['ULUSAL GÜNDEM',report.national.length],['SOSYAL MEDYA',report.social.length]];metrics.forEach(([label,n],i)=>{const x=left+5+i*44;font(8,true,muted);doc.text(label,x,y+8);font(17,true);doc.text(String(n),x,y+19)});y+=36;
 font(12,true);doc.text('Yönetici özeti',left,y);y+=7;const summaryLines=lines(report.summary,176,10.5);font(10.5);doc.text(summaryLines,left,y,{lineHeightFactor:1.45});y+=summaryLines.length*5.4+9;
 font(8.5,false,muted);const scope=lines('Kapsam: yalnız '+dateLabel+' tarihli yayınlar. Bilgiler belirtilen yayıncıların haberlerinden derlenmiştir; bağımsız doğrulama içermez.',176,8.5);doc.text(scope,left,y,{lineHeightFactor:1.35});y+=scope.length*4.3+12;
 for(const [title,rows]of [['Ümraniye gündemi',report.local],['Ulusal kritik gündem',report.national],['Sosyal medya haberleri',report.social]]){
  if(!rows.length)continue;if(y>237)next();font(13,true);doc.text(title+' · '+rows.length+' haber',left,y);doc.setDrawColor(216,223,231);doc.line(left,y+4,right,y+4);y+=12;
  for(const e of rows){
   const dayOnly=/^\d{4}-\d{2}-\d{2}$/.test(e.publishedAt),published=dayOnly?'Yayın saati belirtilmemiş':new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(e.publishedAt));
   const titleLines=lines(e.title,161,12.5,true),metaLines=lines(published+' · '+e.topic+' · '+e.location,161,8.5),detailLines=lines(e.detail,161,10.5),sourceLines=lines('Kaynak: '+(e.sources.join(', ')||'Yayıncı belirtilmedi'),161,9);
   const height=titleLines.length*5.8+metaLines.length*4.2+detailLines.length*5.2+sourceLines.length*4.4+16;if(y+height>276)next();
   index++;font(14,true,red);doc.text(String(index).padStart(2,'0'),left,y+1);font(12.5,true);doc.text(titleLines,32,y,{lineHeightFactor:1.3});y+=titleLines.length*5.8+3;
   font(8.5,false,muted);doc.text(metaLines,32,y,{lineHeightFactor:1.35});y+=metaLines.length*4.2+5;font(10.5);doc.text(detailLines,32,y,{lineHeightFactor:1.4});y+=detailLines.length*5.2+5;
   font(9,true,muted);doc.text(sourceLines,32,y,{lineHeightFactor:1.35});y+=sourceLines.length*4.4+8;doc.setDrawColor(231,235,240);doc.line(32,y-3,right,y-3);y+=4;
  }
 }
 const pages=doc.internal.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);doc.setDrawColor(218,225,233);doc.line(left,281,right,281);font(8,false,muted);doc.text('Ümraniye OSINT · '+dateLabel,left,287);doc.text('Sayfa '+page+' / '+pages,right,287,{align:'right'});font(7.5,false,muted);doc.text('© 2026 Hakan Bilgin · Tüm hakları saklıdır.',left,292)}
 doc.setProperties({title:'Ümraniye OSINT - Günlük gündem brifingi - '+report.day,author:'Hakan Bilgin',subject:'Kaynaklı günlük gündem özeti',creator:'Ümraniye OSINT'});return {doc,report};
}
