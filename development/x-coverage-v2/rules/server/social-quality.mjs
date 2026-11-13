import {newsworthiness} from '../src/newsworthiness.js';
import {localSportsNews} from './local-sports.mjs';
import {institutionalReference} from './institutional-reference.mjs';
const geoSentenceText=t=>t.replace(/\b(Cd|Cad|Blv|Bulv)\.(?=\s)/gi,'$1').replace(/(\d)\.(?=\s*(?:Yıl|Yil)\b)/giu,'$1');
import {analyzeGeoText,geoLocationFields} from './geo-dictionary.mjs';
import {canonicalFacebookDisplay} from './facebook-display-model.mjs';
import {isGovernorActivity} from './governor-activity.mjs';

const normalize = value => String(value || "")
  .toLocaleLowerCase("tr-TR")
  .replace(/[çğıöşü]/g, c =>
    ({ç:"c",ğ:"g",ı:"i",ö:"o",ş:"s",ü:"u"}[c]))
  .replace(/[^a-z0-9]+/g, " ").trim();

function extract(value) {
  let text = String(value || "").replace(/\s+/g, " ").trim();

  text = text.replace(/^(?:Facebook[\s·|]*){2,}/iu, "").trim();

  let author = "";
  const match = text.match(/^(.{2,100}?)\s*·\s*Takip Et\s*/iu);

  if (match) {
    author = match[1].trim();
    text = text.slice(match[0].length);
  }

  text = text.replace(
    /^\d+\s+(?:dakika|saat|gün|hafta|ay)\s+önce\s*/iu, ""
  );

  text = text.replace(
    /^\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2}(?:\s+(?:Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar))?,?\s*(?:\d{1,2}:\d{2})?\s*/iu,
    ""
  );

  text = text.replace(/^[·•|,\s]+/, "");
  text = text.replace(
    /\b(?:Daha fazlasını gör|Yorum yaz|Yorum Yap|Beğen|Paylaş)\b/giu,
    " "
  ).replace(/\s+/g, " ").trim();

  return {text, author};
}

const location = /\b(?:umraniye|dudullu|cakmak mahallesi|tepeustu|ihlamurkuyu|elmalikent|parseller|yamanevler|armaganevler|topagaci)\b/;

const incident = /\b(?:yangin\w*|kaza\w*|yaral\w*|darp\w*|kavga\w*|cinayet\w*|olum\w*|coktu|coken|cokmus|coker\w*|cokme\w*|cokus\w*|gocuk\w*|patla\w*|deprem\w*|hirsiz\w*|soygun\w*|saldir\w*|silahli|bicakli|gozalti|tutuklan\w*|operasyon\w*|yakalan\w*|kesinti\w*|itfaiye|ambulans|sorustur\w*|tahliye\w*|mahsur|vefat|hayatini kaybet\w*|dolandir\w*|afet|su baskini)\b/;

const development = /\b(?:aciklama\w*|uyari\w*|duyuru\w*|karar\w*|denetim\w*|ceza\w*|basvuru\w*|toplanti\w*|toren\w*|ziyaret\w*|proje\w*|acilis\w*|egitim\w*|okul\w*|hastane\w*|kaymakam\w*|valilik|belediye\w*|yikim\w*|eylem\w*|protesto\w*|yol kapan\w*|trafik\w*)\b/;

const advertisement = /\b(?:reklam|sponsorlu|isbirligi|kampanya|indirim|firsat|siparis|satilik|kiralik|alisveris|magaza|urun|stok|fiyat|spotcu|ikinci el esya|melodizenith|platinum rhythm|elsa spot|rezervasyon)\b/;

function shorten(value, limit) {
  if (value.length <= limit) return value;
  return value.slice(0, limit - 1)
    .replace(/\s+\S*$/, "") + "…";
}

function curateSocialCore(entry) {
 const reference=institutionalReference(entry);if(reference){const text=String(entry.fullText||entry.description||entry.title||'').trim();if(text.length<15)return null;return {...entry,institutionalReference:reference,title:text.slice(0,160),description:text.slice(0,390),fullText:text,priorityLevel:'P3',notificationEligible:false,criticalAlert:false,locationStatus:'review_required',locationVerified:false};}

  if(entry?.facebookDecision?.version==='facebook-display-v1'){
    if(!canonicalFacebookDisplay(entry))return null;
    const text=extract(entry.fullText||entry.description||entry.title).text;
    if(text.length<12)return null;
    return {...entry,...geoLocationFields(analyzeGeoText(text)),title:shorten(geoSentenceText(text).split(/(?<=[.!?])\s+/u)[0],160),description:shorten(text,390)};
  }

  if (!entry || typeof entry !== "object") return null;

  const a = extract(entry.platform==='x'||String(entry.url||'').startsWith('https://x.com/')?entry.fullText||entry.description:entry.description);
  const b = extract(entry.title);
  const chosen = a.text.length >= b.text.length ? a : b;

  const text = chosen.text;
  const geo=analyzeGeoText(entry.title+' '+(entry.fullText||text));
  const n = normalize(text);

  if (n.length < 30 || n.split(" ").length < 6) return null;
  if (!location.test(n)&&!isGovernorActivity(entry)&&!geo.localCandidate) return null;
  if (advertisement.test(n) && !incident.test(n)) return null;
  if (!incident.test(n) && !development.test(n) && !localSportsNews(text)) return null;

  const sentences = geoSentenceText(text).split(
    /(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/u
  );

  const title = shorten(
    sentences[0].replace(/[.!?]+$/, "").trim(), 160
  );
  const description = shorten(
    sentences.slice(0, 2).join(" "), 390
  );

  if (title.length < 15) return null;

  let sourceName = entry.sourceName || "";
  const author = a.author || b.author;

  if (
    author &&
    author.length < 85 &&
    /^Facebook hesabı\s*·\s*Facebook$/iu.test(sourceName)
  ) {
    sourceName = author + " · Facebook";
  }

  return {...entry,...geoLocationFields(geo),fullText:entry.fullText||text, title, description, sourceName};
}


function tidyLead(value) {
  let s=String(value||"").replace(/\s+/g," ").trim();
  let author="";

  s=s.replace(/^(?:Facebook[\s·|]*){2,}/iu,"").trim();

  const authorTime=s.match(
    /^(.{3,90}?)\s+\d+\s+(?:dakika|saat|gün|hafta|ay)\s+önce\s+(?=\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2})/iu
  );

  if(authorTime){
    author=authorTime[1].trim();
    s=s.slice(authorTime[0].length).trim();
  }

  s=s.replace(
    /^\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2}(?:\s+(?:Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar))?,?\s*(?:\d{1,2}:\d{2})?\s*(?:[·•|,-]\s*)?/iu,
    ""
  );

  // Facebook'tan kesik gelen gun ve saat basliklari.
  s=s.replace(
    /^(?:[\p{L}]{2,14},?\s+)?\d{1,2}:\d{2}\s*(?:[·•|,-]\s*)?/u,
    ""
  );

  s=s.replace(/^[·•|,\s]+/u,"").trim();
  return {text:s,author};
}

export function curateSocial(entry) {
  if(newsworthiness(entry).exclude)return null;
  const result=curateSocialCore(entry);
  if(!result)return null;

  const a=tidyLead(result.title);
  const b=tidyLead(result.description);

  let title=a.text;
  let description=b.text;

  if(title.length<15 && description.length>=15)
    title=description.split(/(?<=[.!?])\s+/u)[0];

  if(description.length<25)
    description=title;

  if(title.length<15 || description.length<25)
    return null;

  title=title.slice(0,160).trim();
  description=description.slice(0,390).trim();

  let sourceName=result.sourceName;
  const author=a.author||b.author;

  if(
    author &&
    author.length<85 &&
    /^Facebook hesabı\s*·\s*Facebook$/iu.test(sourceName||"")
  ){
    sourceName=author+" · Facebook";
  }

  return {...result,title,description,sourceName};
}


// OSINT_SOCIAL_DIAGNOSTICS_V1
export function socialQualityReason(entry) {
  const worth=newsworthiness(entry);if(worth.exclude)return worth.reason;
  if(entry?.facebookDecision?.version==='facebook-display-v1')return canonicalFacebookDisplay(entry)?'display_accepted':(entry.facebookDecision.reasons||['display_rejected']).join(',');
  if (!entry || typeof entry !== 'object')
    return 'invalid_entry';

  const a=extract(entry.description);
  const b=extract(entry.title);
  const text=a.text.length>=b.text.length ? a.text : b.text;
  const n=normalize(text);

  if(n.length<30 || n.split(' ').length<6)
    return 'short_text';

  if(!location.test(n))
    return 'location_missing';

  if(advertisement.test(n) && !incident.test(n))
    return 'commercial_content';

  if(!incident.test(n) && !development.test(n))
    return 'event_signal_missing';

  return 'content_unusable';
}
