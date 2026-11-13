/* Ümraniye OSINT collector. Fixed public sources only; no user-supplied fetch URLs. */
const APP_HTML = __APP_HTML__;
const BRIEFING_JS = __BRIEFING_JS__;
const ADMIN_HTML = __ADMIN_HTML__;
const ADMIN_LOGIN_HTML = __ADMIN_LOGIN_HTML__;
const INITIAL_DATA = __INITIAL_DATA__;
const LOGO_BASE64 = __LOGO_BASE64__;
export const SOURCES = [

  {id:'belediye',name:'Ümraniye Belediyesi',short:'ÜB',type:'Resmî kurum',url:'https://umraniye.bel.tr/haberler/',format:'html',color:'#197b66'},
  {id:'kaymakamlik',name:'Ümraniye Kaymakamlığı',short:'ÜK',type:'Resmî kurum',url:'https://umraniye.gov.tr/haberler',format:'html',color:'#315797'},
  {id:'meb',name:'Ümraniye İlçe Millî Eğitim',short:'ME',type:'Resmî kurum',url:'https://umraniye.meb.gov.tr/',format:'html',color:'#9b6435'},
  {id:'yerel',name:'Yerel Gazete · Ümraniye',short:'YG',type:'Yerel basın',url:'https://www.yerelgazete.com.tr/etiket/umraniye/feed/',format:'rss',color:'#8a5385'},
  {id:'aa',name:'Anadolu Ajansı · Güncel',short:'AA',type:'Ajans',url:'https://www.aa.com.tr/tr/rss/default?cat=guncel',format:'rss'},
  {id:'dha',name:'Demirören Haber Ajansı · Ümraniye',short:'DHA',type:'Ajans',url:'https://www.dha.com.tr/haberleri/umraniye',format:'html'},
  {id:'trt',name:'TRT Haber',short:'TRT',type:'Ulusal basın',url:'https://www.trthaber.com/',format:'html'},
  {id:'ntv',name:'NTV · Türkiye',short:'NTV',type:'Ulusal basın',url:'https://www.ntv.com.tr/turkiye.rss',format:'rss'},
  {id:'haberler',name:'Haberler.com',short:'H',type:'Ulusal basın',url:'https://rss.haberler.com/rss.asp',articleOrigins:['https://www.haberler.com','https://haberler.com'],format:'rss'},
  {id:'sabah',name:'Sabah',short:'S',type:'Ulusal basın',url:'https://www.sabah.com.tr/rss/anasayfa.xml',format:'rss'},
  {id:'sozcu',name:'Sözcü',short:'SZ',type:'Ulusal basın',url:'https://www.sozcu.com.tr/feeds/rsssubpub',format:'rss'},
  {id:'cumhuriyet',name:'Cumhuriyet',short:'C',type:'Ulusal basın',url:'https://www.cumhuriyet.com.tr/',format:'html'},
  {id:'haberturk',name:'Habertürk',short:'HT',type:'Ulusal basın',url:'https://www.haberturk.com/rss',format:'rss'},
  {id:'hurriyet',name:'Hürriyet',short:'HR',type:'Ulusal basın',url:'https://www.hurriyet.com.tr/istanbul/umraniye-haberleri/',format:'html'},
  {id:'milliyet',name:'Milliyet',short:'M',type:'Ulusal basın',url:'https://www.milliyet.com.tr/',format:'html'},
  {id:'bolgeninsesi',name:'Bölgenin Sesi',short:'BS',type:'Yerel basın',url:'https://www.bolgeninsesi.com/feed/',format:'rss'},
  {id:'ilcehaber',name:'İlçe Haber',short:'İH',type:'Yerel basın',url:'https://www.ilcehaber.com/feed/',format:'rss'},
  {id:'rha',name:'RHA Ajans',short:'RHA',type:'Ajans',url:'https://rhaajans.com/rss',format:'rss'},
  {id:'sivas360',name:'Sivas360 · kurum ziyaretleri',short:'S360',type:'Yerel basın',url:'https://sivas360.com/rss/news',format:'rss'},
  {"id": "nethaberler", "name": "Net Haberler", "short": "NH", "type": "Yerel basın", "url": "https://www.nethaberler.com/arama?q=%C3%9Cmraniye", "format": "html"},
  {"id": "yenimetropol", "name": "Yeni Metropol Medya", "short": "YM", "type": "Yerel basın", "url": "https://www.yenimetropol.com/rss", "format": "rss"},
  {"id": "nethaber", "name": "Net Haber · Ümraniye", "short": "NET", "type": "Yerel basın", "url": "https://www.nethaber.com.tr/umraniye", "format": "html"},
  {"id": "anadoluyakasi", "name": "Anadolu Yakası · Ümraniye", "short": "AY", "type": "Yerel basın", "url": "https://www.anadoluyakasi.net/kategori/umraniye/feed/", "format": "rss"},
  {"id": "sonhaberburda", "name": "Son Haber Burda", "short": "SHB", "type": "Yerel basın", "url": "https://sonhaberburda.com/feed/", "format": "rss"},
  {"id": "istanbulgazetesi", "name": "İstanbul Gazetesi", "short": "İG", "type": "Yerel basın", "url": "https://www.istanbulgazetesi.com.tr/umraniye-haberleri", "format": "html"},
  {"id": "songazete", "name": "Son Gazete · İstanbul", "short": "SG", "type": "Yerel basın", "url": "https://www.songazete.com/rss/istanbul-haberleri", "format": "rss"},
  {"id": "yerelhabergazetesi", "name": "Yerel Haber Gazetesi · Ümraniye", "short": "YHG", "type": "Yerel basın", "url": "https://yerelhabergazetesi.org/etiket/umraniye", "format": "html"},
  {"id": "ahaber", "articleDetails": 3, "name": "A Haber · Ümraniye ve video", "short": "AH", "url": "https://www.ahaber.com.tr/haberleri/umraniye", "format": "html", "extraUrls": ["https://www.ahaber.com.tr/rss/anasayfa.xml", "https://www.ahaber.com.tr/video/yasam-videolari"], "type": "Ulusal basın"},
  {"id": "cnnturk", "name": "CNN Türk · Ümraniye", "short": "CNN", "url": "https://www.cnnturk.com/haberleri/umraniye", "format": "html", "type": "Ulusal basın"},
  {"id": "tgrthaber", "name": "TGRT Haber · Ümraniye", "short": "TGRT", "url": "https://www.tgrthaber.com/umraniye", "format": "html", "type": "Ulusal basın"},
  {"id": "tv100", "name": "TV100 · Ümraniye", "short": "TV100", "url": "https://www.tv100.com/umraniye-haberleri", "format": "html", "type": "Ulusal basın"},
  {"id": "haberglobal", "name": "Haber Global", "short": "HG", "url": "https://haberglobal.com/rss", "format": "rss", "articleOrigins": ["https://haberglobal.com"], "type": "Ulusal basın"},
  {"id": "tele1", "name": "Tele1", "short": "T1", "url": "https://tele1.com.tr/rss", "format": "rss", "type": "Ulusal basın"},
  {"id": "ulusal", "name": "Ulusal Kanal · Ümraniye", "short": "UK", "url": "https://www.ulusal.com.tr/haberleri/umraniye", "format": "html", "extraUrls": ["https://www.ulusal.com.tr/rss"], "type": "Ulusal basın"},
  {"id": "beyazgazete", "name": "Beyaz Gazete · Ümraniye", "short": "BG", "url": "https://beyazgazete.com/yerel/istanbul/umraniye/", "format": "html", "type": "Ulusal basın"},
  {"id": "turkiye", "name": "Türkiye Gazetesi · Ümraniye", "short": "TG", "url": "https://www.turkiyegazetesi.com.tr/umraniye", "format": "html", "type": "Ulusal basın"},
  {"id": "pencere", "name": "Gazete Pencere · Ümraniye", "short": "GP", "url": "https://www.gazetepencere.com/haberler/umraniye", "format": "html", "type": "Ulusal basın"},
  {"id": "habercom", "name": "Haber.com · Ümraniye", "short": "HC", "url": "https://www.haber.com/haberleri/umraniye", "format": "html", "type": "Ulusal basın"},
  {"id": "umraniyegundemi", "name": "Ümraniye Gündemi", "short": "ÜG", "url": "https://umraniyegundemi.com.tr/rss.xml", "format": "rss", "type": "Yerel basın"},
  {"id": "showhaber", "name": "Show Haber", "short": "SH", "url": "https://www.showtv.com.tr/show-ana-haber", "format": "html", "type": "Ulusal basın"},
  {"id": "nowhaber", "name": "NOW Haber", "short": "NOW", "url": "https://www.nowtv.com.tr/haber", "format": "html", "type": "Ulusal basın"},
  {"id": "kanaldhaber", "name": "Kanal D Haber", "short": "KD", "url": "https://www.kanald.com.tr/haber", "format": "html", "type": "Ulusal basın"},
  {"id": "ulketv", "name": "Ülke TV", "short": "ÜTV", "url": "https://www.ulketv.com/", "format": "html", "type": "Ulusal basın"},
  {"id": "24tv", "name": "24 TV", "short": "24", "url": "https://www.yirmidort.tv/", "format": "html", "type": "Ulusal basın"},
  {"id": "tvnet", "name": "TVNET", "url": "https://www.tvnet.com.tr/", "format": "html", "type": "Ulusal basın", "short": "TVNET"},
  {"id": "akittv", "name": "Akit TV", "url": "https://www.akittv.com.tr/", "format": "html", "type": "Ulusal basın", "short": "AKIT"},
  {"id": "szctv", "name": "Sözcü TV", "url": "https://www.szctv.com.tr/", "format": "html", "type": "Ulusal basın", "short": "SÖZCÜ"},
  {"id": "benguturk", "name": "Bengü Türk", "url": "https://www.benguturk.com/rss", "format": "rss", "type": "Ulusal basın", "short": "BENGÜ"},
  {"id": "tv5", "name": "TV5", "url": "https://www.tv5.com.tr/rss", "format": "rss", "type": "Ulusal basın", "short": "TV5"},
  {"id": "liderhaber", "name": "Lider Haber", "url": "https://www.liderhaber.com.tr/rss", "format": "rss", "type": "Ulusal basın", "short": "LIDER"},
  {"id": "krt", "name": "KRT TV", "url": "https://www.krttv.com.tr/rss", "format": "rss", "type": "Ulusal basın", "short": "KRT"},
  {"id": "turkhaber", "name": "TH TürkHaber TV", "url": "https://www.turkhabertv.com/", "format": "html", "type": "Ulusal basın", "short": "TH"},
  {"id": "ilketv", "name": "İlke TV", "url": "https://ilketv.com.tr/feed/", "format": "rss", "type": "Ulusal basın", "short": "İLKE"},
  {"id": "bloomberght", "name": "Bloomberg HT", "url": "https://www.bloomberght.com/rss", "format": "rss", "type": "Ekonomi ve finans", "short": "BLOOM"},
  {"id": "trtworld", "name": "TRT World", "url": "https://www.trtworld.com/", "format": "html", "type": "Yabancı dilde yayın", "short": "TRT"},
  {"id": "apara", "name": "A Para", "url": "https://www.apara.com.tr/", "format": "html", "type": "Ekonomi ve finans", "short": "A"},
  {"id": "cnbce", "name": "CNBC-e", "url": "https://www.cnbce.com/rss", "format": "rss", "type": "Ekonomi ve finans", "short": "CNBC-"},
  {"id": "ekoturk", "name": "Ekotürk", "url": "https://www.ekoturk.com/", "format": "html", "type": "Ekonomi ve finans", "short": "EKOTÜ"},
  {"id": "anews", "name": "A News", "url": "https://www.anews.com.tr/rss/world.xml", "format": "rss", "type": "Yabancı dilde yayın", "short": "A"},
  {"id": "kanal3", "name": "Kanal 3", "url": "https://www.kanal3.com.tr/", "format": "html", "type": "Bölgesel yayın", "short": "KANAL"},
  {"id": "astv", "name": "AS TV", "url": "https://www.astv.com.tr/", "format": "html", "type": "Bölgesel yayın", "short": "AS"},
  {"id": "trtarabi", "name": "TRT Arabi", "url": "https://www.trtarabi.com/", "format": "html", "type": "Yabancı dilde yayın", "short": "TRT"},
  {"id": "kontv", "name": "KONTV", "url": "https://kontv.tr/", "format": "html", "type": "Bölgesel yayın", "short": "KONTV"},
  {"id": "kanal32", "name": "Kanal 32", "url": "https://www.kanal32.com.tr/", "format": "html", "type": "Bölgesel yayın", "short": "KANAL"},
  {"id": "kanalv", "name": "Kanal V", "url": "https://www.kanalv.com.tr/", "format": "html", "type": "Bölgesel yayın", "short": "KANAL"},
  {"id": "kanal23", "name": "Kanal 23", "url": "https://www.kanal23.com/", "format": "html", "type": "Bölgesel yayın", "short": "KANAL"},
  {"id": "caytv", "name": "Çay TV Haber", "url": "https://www.caytvhaber.com/", "format": "html", "type": "Bölgesel yayın", "short": "ÇAY"},
  {"id": "medyascope", "name": "Medyascope", "url": "https://medyascope.tv/feed/", "format": "rss", "type": "İnternet yayını", "short": "MEDYA"},
  {"id": "aksutv", "name": "Aksu TV", "url": "https://www.aksutvhaber.net/rss", "format": "rss", "type": "Bölgesel yayın", "short": "AKSU"},
  {"id": "edessa", "name": "Edessa TV", "url": "https://www.edessatv.com/", "format": "html", "type": "Bölgesel yayın", "short": "EDESS"},
  {"id": "gzt", "name": "GZT", "url": "https://www.gzt.com/", "format": "html", "type": "İnternet yayını", "short": "GZT"}
  ,{id:'afad-national',name:'AFAD · Ulusal afet açıklamaları',short:'AFAD',type:'Resmî kurum',url:'https://www.afad.gov.tr/',format:'html',national:true,articleDetails:3}
];
for(const s of SOURCES){if(['Ulusal basın','Ekonomi ve finans','İnternet yayını'].includes(s.type)||s.id==='aa')s.national=true;if(s.id==='trt')s.extraUrls=['https://www.trthaber.com/sondakika_articles.rss','https://www.trthaber.com/gundem_articles.rss','https://www.trthaber.com/turkiye_articles.rss'];if(s.national&&s.format==='html'){if(!s.articleDetails)s.articleDetails=3;if(/umraniye/.test(s.url))s.extraUrls=[...new Set([...(s.extraUrls||[]),new URL('/',s.url).href])];}}

export const SOURCE_CANDIDATES = [
  {
    "id": "halktv",
    "name": "Halk TV",
    "url": "https://halktv.com.tr/rss",
    "reason": "fetch failed"
  },
  {
    "id": "kanalb",
    "name": "Kanal B",
    "url": "https://www.kanalb.com.tr/",
    "reason": "robots 200 disallow"
  },
  {
    "id": "kanal15",
    "name": "Kanal 15",
    "url": "https://kanal15.com.tr/",
    "reason": "Haberler JavaScript uygulaması içinde yükleniyor; doğrudan haber akışı doğrulanamadı."
  },
  {
    "id": "tv264",
    "name": "TV264",
    "url": "https://www.tv264.com.tr/",
    "reason": "Haberler JavaScript uygulaması içinde yükleniyor; doğrudan haber akışı doğrulanamadı."
  },
  {
    "id": "bbnturk",
    "name": "BBN Türk",
    "url": "https://www.bbnturk.com.tr/",
    "reason": "fetch failed"
  },
  {
    "id": "haber61",
    "name": "Haber61 · Ümraniye",
    "url": "https://www.haber61.net/umraniye-haberleri",
    "reason": "HTTP 404"
  },
  {
    "id": "flashhaber",
    "name": "Flash Haber internet yayını",
    "url": "https://flashhabertv.com.tr/",
    "reason": "The operation was aborted due to timeout"
  },
  {
    "id": "ekoltv",
    "name": "Ekol TV",
    "url": "https://www.ekoltv.com.tr/",
    "reason": "Kullanıcının belirttiği kapanış bilgisi nedeniyle etkin taramaya alınmadı."
  },
  {
    "id": "kanal26",
    "name": "Kanal 26",
    "url": "https://www.kanal26.tv/",
    "reason": "Canlı sunucuda robots.txt HTTP 403 döndürüyor; otomatik tarama izni doğrulanamadı."
  }
];
export const KEYWORD_GROUPS = [
  {
    "name": "Yabancı dilde ilçe ve finans merkezi",
    "terms": [
      "Umraniye district",
      "Umraniye municipality",
      "حي عمرانية",
      "منطقة عمرانية",
      "مستشفى عمرانية",
      "مركز إسطنبول المالي"
    ],
    "context": "Arapça عمرانية ifadesi tek başına kabul edilmez; ilçe/mahalle/kurum ifadesi ve İstanbul bağlamı gerekir. Özgün yayın dili korunur."
  },
  {
    "name": "İlçe ve yazım varyantları",
    "terms": [
      "Ümraniye",
      "Umraniye",
      "Ümraniyede",
      "Ümraniye’de",
      "Ümraniye’deki",
      "Ümraniye ilçesi",
      "Ümraniyeli",
      "Ümraniyespor",
      "Dudullu",
      "Aşağı Dudullu",
      "Yukarı Dudullu"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Ümraniye Belediyesi",
    "terms": [
      "Ümraniye Belediyesi",
      "Ümraniye Belediye Başkanlığı",
      "Ümraniye Belediye Başkanı",
      "Ümraniye Belediye Meclisi",
      "Ümraniye meclis toplantısı",
      "Ümraniye belediye encümeni",
      "Ümraniye zabıta",
      "Ümraniye Fen İşleri",
      "Ümraniye temizlik işleri",
      "Ümraniye park ve bahçeler",
      "Ümraniye sosyal tesisleri",
      "Ümraniye kültür merkezleri",
      "Ümraniye belediye personeli",
      "Ümraniye belediye ihalesi",
      "Ümraniye belediye bütçesi"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Belediye başkanı ve kamu görevi",
    "terms": [
      "İsmet Yıldırım",
      "Ismet Yildirim",
      "Başkan İsmet Yıldırım",
      "Belediye Başkanı İsmet Yıldırım",
      "Ümraniye Belediye Başkanı İsmet Yıldırım",
      "İsmet Yıldırım açıklama",
      "İsmet Yıldırım ziyaret",
      "İsmet Yıldırım denetim",
      "Mayor Ismet Yildirim"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Kaymakam ve Kaymakamlık",
    "terms": [
      "Ümraniye Kaymakamlığı",
      "Ümraniye Kaymakamı",
      "T.C. Ümraniye Kaymakamlığı",
      "Kaymakam Yüksel Çelik",
      "Kaymakamımız Yüksel Çelik",
      "Yüksel Çelik",
      "Yuksel Celik",
      "Ümraniye Kaymakamı Yüksel Çelik",
      "Yüksel Çelik ziyaret",
      "Yüksel Çelik toplantı",
      "Yüksel Çelik denetim",
      "Yüksel Çelik açıklama",
      "Ümraniye Hükümet Konağı",
      "TC_Umraniye",
      "Ümraniye ilçe protokolü",
      "District Governor Yuksel Celik"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Kamu kurumları ve hizmetler",
    "terms": [
      "Ümraniye SYDV",
      "Ümraniye Sosyal Yardımlaşma ve Dayanışma Vakfı",
      "Ümraniye İlçe Milli Eğitim",
      "Ümraniye İlçe Emniyet",
      "Ümraniye İlçe Sağlık",
      "Ümraniye Müftülüğü",
      "Ümraniye Sosyal Hizmet Merkezi",
      "Ümraniye Nüfus Müdürlüğü",
      "Ümraniye Tapu Müdürlüğü",
      "Ümraniye Gençlik ve Spor",
      "Ümraniye Tarım ve Orman",
      "Ümraniye İlçe Seçim",
      "Ümraniye muhtarlar",
      "Ümraniye muhtarlık",
      "Ümraniye kamu yatırımı",
      "Ümraniye sağlık müdürlüğü"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Afet ve acil olaylar",
    "terms": [
      "yangın",
      "sanayi yangını",
      "fabrika yangını",
      "iş yeri yangını",
      "patlama",
      "balkon çökmesi",
      "balkon çöktü",
      "bina çöktü",
      "göçük",
      "enkaz",
      "deprem",
      "sel",
      "su baskını",
      "yoğun yağış",
      "fırtına",
      "istinat duvarı",
      "tahliye",
      "itfaiye",
      "AFAD",
      "arama kurtarma",
      "can kaybı",
      "yaralı",
      "acil durum",
      "kimyasal sızıntı",
      "gaz kaçağı",
      "iş kazası",
      "asansör kazası"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Asayiş ve adli gelişmeler",
    "terms": [
      "silahlı saldırı",
      "silahlı kavga",
      "bıçaklı saldırı",
      "cinayet",
      "şüpheli ölüm",
      "hırsızlık",
      "dolandırıcılık",
      "uyuşturucu",
      "operasyon",
      "gözaltı",
      "tutuklama",
      "kumar baskını",
      "kaçakçılık",
      "kayıp kişi",
      "kayıp çocuk",
      "polis",
      "emniyet",
      "adliye",
      "savcılık",
      "soruşturma",
      "trafik kavgası",
      "yol verme kavgası",
      "denetim"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Ulaşım ve trafik",
    "terms": [
      "trafik kazası",
      "zincirleme kaza",
      "minibüs kazası",
      "otobüs kazası",
      "araç devrildi",
      "yol kapandı",
      "trafik yoğunluğu",
      "metro arızası",
      "metro seferleri",
      "M5 metro",
      "M8 metro",
      "M12 metro",
      "Ümraniye Ataşehir Göztepe",
      "Ümraniye Kavacık Beykoz",
      "İETT",
      "sefer iptali",
      "Şile Yolu",
      "TEM Otoyolu",
      "Alemdağ Caddesi",
      "Nato Yolu",
      "trafik düzenlemesi"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Altyapı, çevre ve kent yaşamı",
    "terms": [
      "su kesintisi",
      "elektrik kesintisi",
      "doğalgaz kesintisi",
      "İSKİ",
      "AYEDAŞ",
      "İGDAŞ",
      "su arızası",
      "kanalizasyon",
      "yol çalışması",
      "asfalt",
      "altyapı",
      "hafriyat",
      "çevre kirliliği",
      "çöp",
      "park düzenlemesi",
      "imar",
      "kentsel dönüşüm",
      "riskli yapı",
      "yıkım",
      "Yarısı Bizden",
      "konut projesi",
      "hak sahipleri",
      "ruhsat",
      "kaçak yapı"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Eğitim, sağlık ve sosyal destek",
    "terms": [
      "okul",
      "öğrenci",
      "öğretmen",
      "okul inşaatı",
      "burs",
      "üniversite desteği",
      "kantin denetimi",
      "hastane",
      "aile sağlığı merkezi",
      "sağlık ocağı",
      "salgın",
      "aşı",
      "gıda zehirlenmesi",
      "sosyal yardım",
      "engelli hizmetleri",
      "yaşlı hizmetleri",
      "kadın konukevi",
      "çocuk koruma",
      "Ailemiz İstanbul",
      "Gönülden Bir Öğün",
      "kütüphane",
      "meslek kursu"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Ekonomi, sanayi ve finans",
    "terms": [
      "Dudullu OSB",
      "Dudullu Organize Sanayi",
      "İMES",
      "MODOKO",
      "DES Sanayi",
      "Ümraniye Oto Sanayi",
      "Güven Sanayi Sitesi",
      "İstanbul Finans Merkezi",
      "Istanbul Finance Center",
      "İFM",
      "iş yeri",
      "esnaf",
      "işçi",
      "üretim",
      "yatırım",
      "istihdam",
      "ticaret",
      "iş güvenliği"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Ziyaret, program ve yerel gündem",
    "terms": [
      "makam ziyareti",
      "halk günü",
      "muhtarlar toplantısı",
      "kurum ziyareti",
      "açılış",
      "temel atma",
      "anma programı",
      "resmî tören",
      "bayramlaşma",
      "protokol",
      "kültür sanat",
      "spor müsabakası",
      "mahalle toplantısı",
      "vatandaş buluşması",
      "basın açıklaması",
      "belediye meclisi"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  },
  {
    "name": "Mahalle ve önemli yer adları",
    "terms": [
      "Hekimbaşı",
      "Ihlamurkuyu",
      "Şerifali",
      "Finanskent",
      "Tepeüstü",
      "Yamanevler",
      "Esenşehir",
      "Canpark AVM",
      "Buyaka AVM",
      "Dudullu Meydanı",
      "Adem Yavuz Mahallesi",
      "Ümraniye Adem Yavuz",
      "Altınşehir Mahallesi",
      "Ümraniye Altınşehir",
      "Armağanevler Mahallesi",
      "Ümraniye Armağanevler",
      "Aşağı Dudullu Mahallesi",
      "Ümraniye Aşağı Dudullu",
      "Atakent Mahallesi",
      "Ümraniye Atakent",
      "Atatürk Mahallesi",
      "Ümraniye Atatürk",
      "Cemil Meriç Mahallesi",
      "Ümraniye Cemil Meriç",
      "Çakmak Mahallesi",
      "Ümraniye Çakmak",
      "Çamlık Mahallesi",
      "Ümraniye Çamlık",
      "Dumlupınar Mahallesi",
      "Ümraniye Dumlupınar",
      "Elmalıkent Mahallesi",
      "Ümraniye Elmalıkent",
      "Esenevler Mahallesi",
      "Ümraniye Esenevler",
      "Esenkent Mahallesi",
      "Ümraniye Esenkent",
      "Esenşehir Mahallesi",
      "Ümraniye Esenşehir",
      "Fatih Sultan Mehmet Mahallesi",
      "Ümraniye Fatih Sultan Mehmet",
      "Finanskent Mahallesi",
      "Ümraniye Finanskent",
      "Hekimbaşı Mahallesi",
      "Ümraniye Hekimbaşı",
      "Huzur Mahallesi",
      "Ümraniye Huzur",
      "Ihlamurkuyu Mahallesi",
      "Ümraniye Ihlamurkuyu",
      "İnkılap Mahallesi",
      "Ümraniye İnkılap",
      "İstiklal Mahallesi",
      "Ümraniye İstiklal",
      "Kazım Karabekir Mahallesi",
      "Ümraniye Kazım Karabekir",
      "Madenler Mahallesi",
      "Ümraniye Madenler",
      "Mehmet Akif Mahallesi",
      "Ümraniye Mehmet Akif",
      "Namık Kemal Mahallesi",
      "Ümraniye Namık Kemal",
      "Necip Fazıl Mahallesi",
      "Ümraniye Necip Fazıl",
      "Parseller Mahallesi",
      "Ümraniye Parseller",
      "Site Mahallesi",
      "Ümraniye Site",
      "Şerifali Mahallesi",
      "Ümraniye Şerifali",
      "Tantavi Mahallesi",
      "Ümraniye Tantavi",
      "Tatlısu Mahallesi",
      "Ümraniye Tatlısu",
      "Tepeüstü Mahallesi",
      "Ümraniye Tepeüstü",
      "Topağacı Mahallesi",
      "Ümraniye Topağacı",
      "Yamanevler Mahallesi",
      "Ümraniye Yamanevler",
      "Yukarı Dudullu Mahallesi",
      "Ümraniye Yukarı Dudullu"
    ],
    "context": "Genel olay, hizmet ve proje kelimeleri ancak Ümraniye, güvenilir yer adı veya doğrulanabilir kamu görevi bağlamıyla birlikte haber kabul edilir. İsimler tek başına yeterli değildir."
  }
];
export const NEIGHBORHOODS = ['Adem Yavuz','Altınşehir','Armağanevler','Aşağı Dudullu','Atakent','Atatürk','Cemil Meriç','Çakmak','Çamlık','Dumlupınar','Elmalıkent','Esenevler','Esenkent','Esenşehir','Fatih Sultan Mehmet','Finanskent','Hekimbaşı','Huzur','Ihlamurkuyu','İnkılap','İstiklal','Kazım Karabekir','Madenler','Mehmet Akif','Namık Kemal','Necip Fazıl','Parseller','Site','Şerifali','Tantavi','Tatlısu','Tepeüstü','Topağacı','Yamanevler','Yukarı Dudullu'];
const SOURCE_ORIGINS = new Set(SOURCES.flatMap(s=>[new URL(s.url).origin,...(s.articleOrigins||[])]).flatMap(o=>{const u=new URL(o);return [u.origin,u.protocol+'//'+(u.hostname.startsWith('www.')?u.hostname.slice(4):'www.'+u.hostname)]}));
const HEADERS = {'User-Agent':'UmraniyeOSINT/0.2 (public-news-monitor)','Accept':'text/html,application/rss+xml,application/atom+xml,application/xml,text/xml,text/plain,*/*;q=0.8'};
export function stripNoise(html=''){
  html=html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const stack=[],out=[];const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of html.matchAll(/<(\/?)([a-z][\w:-]*)([^>]*)>|([^<]+)/gi)){
    if(token[4]){if(!stack.some(n=>n.skip))out.push(token[4]);continue;}
    const closing=!!token[1],tag=token[2].toLowerCase();
    if(closing){const i=stack.map(n=>n.tag).lastIndexOf(tag);if(i>=0)stack.splice(i);if(['p','div','article','section','li'].includes(tag))out.push('\n');continue;}
    const noise=/^(nav|header|footer|aside|form|ins|svg|button)$/.test(tag)||/\b(?:class|id)\s*=\s*["'][^"']*(?:\badvert|\bads?\b|reklam|sponsor|cookie|consent|popup|paywall|social-share|related-news|breadcrumb)[^"']*["']/i.test(token[3]);
    if(!voids.has(tag)&&!token[3].endsWith('/'))stack.push({tag,skip:noise});
    if(tag==='br')out.push('\n');
  }return out.join(' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
}
const searchProfiles=new WeakMap();
function searchText(value){return norm(clean(value)).replace(/[’'`]/g,' ').replace(/[^a-z0-9_]+/g,' ').replace(/\s+/g,' ').trim()}
function phraseMatches(text,term){const phrase=searchText(term);return phrase&&(' '+text+' ').includes(' '+phrase+' ')}
export function relevance(title,description='',profile=KEYWORD_GROUPS){
 const raw=clean(title+' '+description),text=searchText(raw),matched=[],matchedGroups=[];
 let searchProfile=searchProfiles.get(profile);if(!searchProfile){searchProfile=profile.map(g=>({name:g.name,terms:g.terms.map(term=>({term,phrase:searchText(term),arabic:/[\u0600-\u06ff]/.test(term)}))}));searchProfiles.set(profile,searchProfile)}const padded=' '+text+' ';
 for(const group of searchProfile){let hit=false;for(const {term,phrase,arabic} of group.terms)if((phrase&&padded.includes(' '+phrase+' '))||(arabic&&raw.includes(term))){hit=true;if(!matched.includes(term))matched.push(term)}if(hit)matchedGroups.push(group.name)}
 const custom=profile!==KEYWORD_GROUPS&&profile.some(g=>g.name==='Yönetici tarafından eklenen ifadeler'&&g.terms.some(term=>phraseMatches(text,term)&&/umraniye|dudullu|yuksel celik|ismet yildirim/.test(searchText(term))));
 const district=/(?:^| )umraniye[a-z]*(?: |$)|(?:^| )dudullu(?: |$)|(?:^| )tc_umraniye(?: |$)/.test(text);
 const governor=phraseMatches(text,'Yüksel Çelik')&&/kaymakam|district governor/.test(text);
 const mayor=phraseMatches(text,'İsmet Yıldırım')&&/baskan|belediye|mayor/.test(text);
 const place=['Hekimbaşı','Ihlamurkuyu','Şerifali','Finanskent','Tepeüstü','Yamanevler','Esenşehir','İstanbul Finans Merkezi','Istanbul Finance Center','Dudullu OSB'].find(term=>phraseMatches(text,term));
 const eventContext=matchedGroups.some(name=>['Afet ve acil olaylar','Asayiş ve adli gelişmeler','Ulaşım ve trafik','Altyapı, çevre ve kent yaşamı','Eğitim, sağlık ve sosyal destek','Ekonomi, sanayi ve finans','Ziyaret, program ve yerel gündem'].includes(name));
 const localPlace=!!(place&&eventContext);
 const arabicDistrict=/(?:حي|منطقة|بلدية|مستشفى|قضاء|مقاطعة)\s+["«“]?(?:عمرانية|أومرانية|اومرانية)(?=$|[\s"»”،.:])/u.test(raw)&&/إسطنبول|اسطنبول|Istanbul/i.test(raw);
 const arabicFinance=/مركز\s+إسطنبول\s+المالي/u.test(raw);
 return {relevant:custom||district||governor||mayor||localPlace||arabicDistrict||arabicFinance,matchedKeywords:matched.slice(0,24),matchedGroups,matchReason:arabicDistrict||arabicFinance?'Arapça ilçe/finans merkezi adı ve İstanbul bağlamı eşleşti':governor?'Kaymakam adı ve kamu görevi birlikte eşleşti':mayor?'Belediye başkanı adı ve kamu görevi birlikte eşleşti':district?'Ümraniye / ilçe ifadesi eşleşti':localPlace?'İlçeyle ilişkili yer adı ve olay/hizmet bağlamı eşleşti; konum incelemesi gerekli':'Ümraniye bağı kurulamadı'};
}
export function clean(value='') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/&(amp|quot|apos|lt|gt|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/g,(_,v)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',rsquo:"'",lsquo:"'",rdquo:'"',ldquo:'"',ndash:'–',mdash:'—'}[v])).replace(/\s+/g,' ').trim();
}
export const norm = s => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
function stableId(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(36)}
export function classify(title,description='') {
  const text=norm(title+' '+description);
  const matches=NEIGHBORHOODS.filter(n=> !['Site','Atatürk','İstiklal'].includes(n) && new RegExp('(^|[^a-z])'+norm(n).replace(/ /g,'\\s*')+'([^a-z]|$)').test(text));
  let topic='Genel gündem';
  const rules=[['Afet ve acil durum',/yangin|\bsel\b|su baskin|deprem|firtina|afet|yogun yagis|gocuk|balkon\w* cokt|bina\w* cokt|patlama|gaz kacagi|is kazasi|asansor kazasi/],['Altyapı ve çevre',/kesinti|altyapi|su ariza|elektrik|temiz enerji|park|yesil|meydan|yol calisma|cevre/],['Ulaşım',/metro|trafik|ulasim|iett|otobus|sefer/],['Eğitim',/egitim|ogrenci|okul|kutuphane|universite|ogretmen|burs|kantin/],['Sağlık',/saglik|hastane|\basi\b|salgin|saglikli|zehirlenme/],['Kültür ve yaşam',/kultur|sanat|anildi|festival|etkinlik|spor|mac |tiyatro/]];
  for(const [name,re]of rules)if(re.test(text)){topic=name;break;}
  return {topic,neighborhood:matches[0]||'İlçe geneli',locationBasis:matches.length?'Ad eşleşmesi; olay konumu teyit edilmedi':'Mahalle belirlenmedi',priority:topic==='Afet ve acil durum'?'review':'normal',priorityReason:topic==='Afet ve acil durum'?'Afet/acil durum anahtar sözcüğü; insan incelemesi gerekli.':'Rutin gündem kaydı. Otomatik etki doğrulaması yapılmadı.'};
}
function canonical(input,base,allowed=[]){try{const u=new URL(input.replace(/&amp;/g,'&'),base);if(!['http:','https:'].includes(u.protocol)||/(?:^|\/)__trashed(?:[-\/]|$)/i.test(u.pathname))return null;const hosts=[new URL(base).hostname,...allowed.map(o=>new URL(o).hostname)].map(h=>h.replace(/^www\./,''));if(!hosts.includes(u.hostname.replace(/^www\./,'')))return null;u.hash='';for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_'))u.searchParams.delete(key);return u.href;}catch{return null}}
function makeItem(source,title,url,description='',publishedAt=null){
  title=clean(title);description=clean(stripNoise(description)).slice(0,700);
  const publication=publicationTime(publishedAt),date=publication.publishedAt;
  return {id:source.id+'-'+stableId(url),title,url,description,sourceId:source.id,sourceName:source.name,sourceType:source.type,publishedAt:date,datePrecision:publication.precision,dateWarning:publication.reason,collectedAt:new Date().toISOString(),...classify(title,description),...sourceSignals(source,title,description,url),evidence:source.type==='Resmî kurum'?'Resmî yayında yer alıyor':'Yayıncı haberi · teyit edilmedi',mode:'live'};
}
export function parseRSS(xml,source){
  const tag=(s,t)=>s.match(new RegExp('<'+t+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+t+'>','i'))?.[1]||'';
  return [...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0,100).map(m=>{
    const b=m[1],title=tag(b,'title');let link=clean(tag(b,'link'))||b.match(/<link[^>]+href=["']([^"']+)/i)?.[1];
    let url=canonical(link,source.url,source.articleOrigins);if(!url&&source.externalLinks){try{const u=new URL(link);if(u.protocol==='https:'&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)&&!/(?:^|\.)(localhost|local|internal)$/i.test(u.hostname))url=u.href;}catch{}}if(!url||!title)return null;
    const desc=tag(b,'description')||tag(b,'summary');
    if(!sourceSignals(source,title,clean(desc)).relevant)return null;
    const item=makeItem(source,title,url,desc,clean(tag(b,'pubDate')||tag(b,'published')||tag(b,'updated')));
    if(source.discovery){const publisher=clean(tag(b,'source'))||(source.externalLinks?new URL(url).hostname.replace(/^www\./,''):'');if(publisher){item.sourceName=publisher;item.discoveryVia=source.name;item.sourceType='Basın yayını';const suffix=' - '+publisher;if(item.title.endsWith(suffix))item.title=item.title.slice(0,-suffix.length);item.description='Haber arama akışında bulundu. Özgün yayın bağlantısından ayrıntıları inceleyin.';}}
    return item;
  }).filter(Boolean);
}
export function extractDescription(html){
  const candidates=[];
  for(const meta of html.matchAll(/<meta\b[^>]*>/gi)){
    const attrs={};for(const attr of meta[0].matchAll(/([a-z:-]+)\s*=\s*(["'])([\s\S]*?)\2/gi))attrs[attr[1].toLowerCase()]=attr[3];
    if((attrs.name==='description'||attrs.property==='og:description')&&attrs.content)candidates.push(clean(attrs.content));
  }return candidates.filter(s=>!/^Ümraniye (Municipality|Belediyesi)$/i.test(s)).sort((a,b)=>b.length-a.length)[0]?.slice(0,300)||'';
}
export function extractArticle(html){
  // Prefer articleBody when explicitly published as structured news data.
  for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const scan=v=>{if(!v||typeof v!=='object')return '';if(typeof v.articleBody==='string')return clean(stripNoise(v.articleBody));for(const child of Object.values(v)){if(typeof child==='object'){const found=Array.isArray(child)?child.map(scan).find(Boolean):scan(child);if(found)return found;}}return ''};const body=scan(JSON.parse(script[1]));if(body.length>100)return {text:body.slice(0,12000),method:'Yapılandırılmış haber metni'};}catch{}
  }
  const articles=[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(m=>clean(stripNoise(m[1]))).sort((a,b)=>b.length-a.length);
  if(articles[0]?.length>100)return {text:articles[0].slice(0,12000),method:'Reklam ve menüden ayıklanmış haber alanı'};
  return {text:extractDescription(html),method:'Yayıncının sayfa açıklaması'};
}
export function parseArticlePage(html,source,url=source.url){
 const meta={};for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){const attrs={};for(const a of tag[0].matchAll(/([a-z:-]+)\s*=\s*(["'])([\s\S]*?)\2/gi))attrs[a[1].toLowerCase()]=a[3];const key=attrs.property||attrs.name;if(key&&attrs.content)meta[key]=attrs.content;}
 const ogTitle=clean(meta['og:title']||''),pageTitle=clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');const title=ogTitle.length>=25?ogTitle:pageTitle;
 const safe=canonical(url,source.url,source.articleOrigins);if(!safe||!sourceSignals(source,title,meta.description||'').relevant)return null;
 return makeItem(source,title,safe,extractDescription(html),meta['article:published_time']||meta.datePublished||null);
}
export function parseHTML(html,source){
  const results=new Map();
  for(const match of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)){
    const attrs=match[1],body=match[2],href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
    const url=canonical(href,source.url);if(!url)continue;
    const path=new URL(url).pathname;
    if(path==='/'||url===source.url||/\/(?:haberleri|yerel)\/[^/]+\/?$/.test(path))continue;
    if(source.id==='belediye'&&!/^\/haber\//.test(path)&&!/^\/haberler\/.+/.test(path))continue;
    if(source.id==='kaymakamlik'&&(/\/haberler$|\/duyurular$/.test(path)||path.split('/').filter(Boolean).length!==1))continue;
    if(source.id==='meb'&&!/\/icerik\//.test(path))continue;
    if(!['belediye','kaymakamlik','meb'].includes(source.id)&&/\/(?:etiket|tag|kategori|category|arama|search|yazar|author|iletisim|reklam|kunye)(?:\/|$)/i.test(path))continue;
    let title=clean(body.replace(/<time\b[^>]*>[\s\S]*?<\/time>/gi,' '));
    const attrTitle=attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1];
    if(attrTitle&&clean(attrTitle).length>=25)title=clean(attrTitle);
    if(title.length<24)title=clean(attrTitle||body.match(/\balt=["']([^"']+)/i)?.[1]||title);
    title=title.replace(/^\d{1,2}[.\/]\d{1,2}[.\/]\d{4}\s*/,'').replace(/\s*(devamı|devamini oku|detaylar|tümünü gör)\s*$/i,'').trim();
    if(title.length<25||title.length>350||/tum .*haberlerini goster|daha fazla|haber arsivi|haberleri sayfasi/i.test(norm(title)))continue;
    if(source.id==='kaymakamlik'&&!/kaymakam|umraniye|ziyaret|mesaj|toplanti|toren|denetim/.test(norm(title)))continue;
    if(source.id==='meb'&&!/umraniye|ilce|dudullu|tantavi/.test(norm(title)))continue;
    if(!['belediye','kaymakamlik','meb'].includes(source.id)&&!sourceSignals(source,title+' '+path.replace(/[-_]/g,' ')).relevant)continue;
    let published=null;
    if(source.id==='belediye'){
      const preceding=clean(html.slice(Math.max(0,match.index-500),match.index));
      const dates=[...preceding.matchAll(/(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(20\d{2})/gi)];
      const date=dates.at(-1);if(date){const months=['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];published=date[3]+'-'+String(months.indexOf(norm(date[2]))+1).padStart(2,'0')+'-'+date[1].padStart(2,'0');}
    }
    if(!published){const preceding=clean(html.slice(Math.max(0,match.index-250),match.index));const date=[...preceding.matchAll(/(\d{2})\.(\d{2})\.(20\d{2})/g)].at(-1);if(date)published=date[3]+'-'+date[2]+'-'+date[1];}
    const old=results.get(url);if(!old||title.length<old.title.length){const item=makeItem(source,title,url,'',published);if(!item.relevant){const signals=sourceSignals(source,title+' '+path.replace(/[-_]/g,' '));if(!signals.relevant)continue;Object.assign(item,signals);}results.set(url,item);}
  }
  return [...results.values()].slice(0,30);
}
export function robotsAllows(body,targetPath){
  // Longest matching user-agent group, then longest path rule. Unknown formats fail closed.
  if(/<html|<!doctype/i.test(body))return false;
  const groups=[];let g={agents:[],rules:[]};let hasRules=false;
  for(let line of body.split(/\r?\n/)){line=line.split('#')[0].trim();if(!line)continue;const i=line.indexOf(':');if(i<0)continue;const k=line.slice(0,i).trim().toLowerCase(),v=line.slice(i+1).trim();
    if(k==='user-agent'){if(hasRules){groups.push(g);g={agents:[],rules:[]};hasRules=false;}g.agents.push(v.toLowerCase());}
    else if((k==='allow'||k==='disallow')&&g.agents.length){hasRules=true;g.rules.push({allow:k==='allow',path:v});}
  }if(g.agents.length)groups.push(g);
  let best=-1,rules=[];
  for(const group of groups){const score=Math.max(-1,...group.agents.map(a=>a==='*'?0:'umraniyeosint'.includes(a)?a.length:-1));if(score>best){best=score;rules=group.rules;}else if(score===best&&score>=0)rules.push(...group.rules);}
  let chosen=null;
  for(const rule of rules){if(!rule.path)continue;const re='^'+rule.path.split('*').map(x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*').replace(/\\\$$/,'$');let match;try{match=new RegExp(re).test(targetPath)}catch{return false}if(match&&(!chosen||rule.path.length>chosen.path.length||(rule.path.length===chosen.path.length&&rule.allow)))chosen=rule;}
  return chosen?.allow??true;
}
async function safeFetch(url,options={}){
  let current=new URL(url);
  for(let i=0;i<4;i++){
    if(!SOURCE_ORIGINS.has(current.origin))throw new Error('Kaynak dışına yönlendirme engellendi');
    const accept=current.pathname.endsWith('/robots.txt')?'text/plain,*/*;q=0.8':HEADERS.Accept;
    const response=await fetch(current.href,{...options,headers:{...HEADERS,Accept:accept},redirect:'manual',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(20000)});
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Geçersiz yönlendirme');current=new URL(location,current);continue;}
    return response;
  }throw new Error('Çok fazla yönlendirme');
}
async function readLimited(response,limit){const reader=response.body?.getReader();if(!reader)return '';let length=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new Error('İçerik boyutu sınırı aşıldı')}chunks.push(value)}const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}return new TextDecoder('utf-8').decode(bytes)}
export async function collectSource(source,options={}){
  const signal=AbortSignal.timeout(options.enrich===false?40000:120000);
  const fetchSource=url=>safeFetch(url,{signal});
  const checkedAt=new Date().toISOString();
  try{
    let robotsBody='';
    const origin=new URL(source.url).origin,robots=await fetchSource(origin+'/robots.txt');
    if(robots.status!==404){if(!robots.ok)throw new Error('robots.txt kontrol edilemedi (HTTP '+robots.status+')');robotsBody=await readLimited(robots,200000);if(!robotsAllows(robotsBody,new URL(source.url).pathname))return {id:source.id,status:'blocked',checkedAt,error:'robots.txt erişime izin vermiyor',items:[]};}
    const texts=[],itemMap=new Map();let lastError=null;
    for(const page of [source.url,...(source.extraUrls||[])]){
      if(!robotsAllows(robotsBody,new URL(page).pathname))continue;
      try{const response=await fetchSource(page);if(!response.ok)throw new Error('HTTP '+response.status);
      const text=await readLimited(response,2000000);texts.push(text);
      const pageSource={...source,url:page};const parsed=/<rss\b|<feed\b/i.test(text)?parseRSS(text,pageSource):parseHTML(text,pageSource);
      for(const item of parsed)itemMap.set(item.url,item);
      }catch(e){lastError=e}
    }
    if(!texts.length)throw lastError||Error('Kaynak sayfaları okunamadı');
    const text=texts.join('\n');let items=[...itemMap.values()];
    if(source.articleDetails){
      const detailItems=[...items].sort((a,b)=>Number(b.url.includes('/video/'))-Number(a.url.includes('/video/'))||Number(b.scope==='national'&&!b.publishedAt)-Number(a.scope==='national'&&!a.publishedAt)).slice(0,Math.min(source.articleDetails,3));
      await Promise.all(detailItems.map(async item=>{if(!robotsAllows(robotsBody,new URL(item.url).pathname))return;try{const page=await fetchSource(item.url);if(!page.ok)return;const article=parseArticlePage(await readLimited(page,1500000),source,item.url);if(article)Object.assign(item,{...article,publishedAt:article.publishedAt||item.publishedAt,description:article.description||item.description})}catch{}}));
    }
    if(options.enrich!==false&&['belediye','yerel','bolgeninsesi','ilcehaber','rha','nethaberler'].includes(source.id)){
      const latest=[...items].sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,source.id==='belediye'?4:2);
      for(const item of latest){
        if(!robotsAllows(robotsBody,new URL(item.url).pathname))continue;
        await new Promise(resolve=>setTimeout(resolve,3000));
        try{const article=await fetchSource(item.url);if(article.ok){const extracted=extractArticle(await readLimited(article,1500000));if(extracted.text){item.description=extracted.text.slice(0,500);item.descriptionType=extracted.method;Object.assign(item,classify(item.title,item.description),relevance(item.title,extracted.text));}}}catch{/* Keep original headline if article read fails. */}
      }
    }
    items=items.filter(item=>item.scope!=='national'||item.publishedAt);
    const validFeed=/<rss\b|<feed\b/i.test(text);
    return {id:source.id,status:items.length?'healthy':validFeed?'no_match':'empty',checkedAt,count:items.length,items,error:items.length?null:validFeed?'RSS okundu; bu kontrolde arama profiline uyan yeni haber yok.':'Sayfa okundu; ilgili kayıt bulunamadı. Dinamik içerik veya ayrıştırıcı kontrol edilmeli.'};
  }catch(e){const code=e.cause?.code;return {id:source.id,status:'error',checkedAt,error:code==='ENOTFOUND'?'Alan adı DNS üzerinde çözümlenemedi (ENOTFOUND)':code?.includes('CERT')?'Güvenli sertifika doğrulaması başarısız':e.name==='TimeoutError'?'Kaynak 20 saniyede yanıt vermedi':String(e.message).slice(0,180),items:[]};}
}
export function clusterItems(items){
  const groups=[],seen=new Map();
  for(const item of items){
    const key=norm(item.title).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    const publication=publicationKey(item),group=seen.get(publication);
    if(group){if(!group.publishedAt&&item.publishedAt){Object.assign(group,item,{id:group.id,sources:[item]})}continue;}
    const row={...item,id:'evt-'+stableId('publication|'+publication),key,sources:[item]};groups.push(row);seen.set(publication,row);
  }return groups;
}
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});

export function identity(request,env={}){
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 const owner=env.OSINT_ADMIN_EMAIL?.trim().toLowerCase();
 return {id:id||null,email:email||null,admin:!!(id&&email&&owner&&email===owner)};
}
const htmlResponse=(body,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"}});

const ADMIN_PRINCIPAL='password-admin-v3';
function loginPage(){return htmlResponse(ADMIN_LOGIN_HTML.replace('__ACCOUNT_STATUS__','Yönetici kullanıcı adınız ve şifrenizle giriş yapın.'));}
async function sha(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function equalSecret(a,b){const x=await sha(a),y=await sha(b);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0}
function cookieToken(request){return request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-osint_admin=([a-f0-9]{64})(?:;|$)/)?.[1]||''}
async function adminTokenDigest(token,env){return sha(token+'|'+(env.OSINT_ADMIN_SESSION_VERSION||'1')+'|'+await sha((env.OSINT_ADMIN_USERNAME||'')+'|'+(env.OSINT_ADMIN_PASSWORD||'')))}
async function adminSession(request,env,user){
 if(!env?.DB)return null;const token=cookieToken(request);if(!token)return null;
 const session=await env.DB.prepare('SELECT user_id,expires_at FROM admin_sessions WHERE token_hash=?').bind(await adminTokenDigest(token,env)).first();
 return session&&session.user_id===ADMIN_PRINCIPAL&&session.expires_at>Math.floor(Date.now()/1000)?session:null;
}
const clearAdminCookie='__Host-osint_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
async function passwordAction(request,env,user,url){
 if(request.method!=='POST')return json({error:'POST gerekli'},405,{'Allow':'POST'});
 if(request.headers.get('Origin')!==url.origin)return json({error:'İstek kaynağı reddedildi'},403);
 if(!env?.DB||!env.OSINT_ADMIN_USERNAME||!env.OSINT_ADMIN_PASSWORD)return json({error:'Giriş yapılandırması hazır değil.'},503);
 user={id:ADMIN_PRINCIPAL,email:env.OSINT_ADMIN_EMAIL||null,admin:true};
 if(url.pathname==='/api/admin/logout'){
   if(!await adminSession(request,env,user))return json({error:'Geçerli yönetim oturumu gerekli'},401);
   const token=cookieToken(request);if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=? AND user_id=?').bind(await adminTokenDigest(token,env),user.id).run();
   await auditStatement(env,user,'Yönetim oturumu kilitlendi','Yönetici paneli').run();
   return json({ok:true},200,{'Set-Cookie':clearAdminCookie});
 }
 const guardId='login-'+await sha(request.headers.get('CF-Connecting-IP')||'anonymous');
 const now=Math.floor(Date.now()/1000),guard=await env.DB.prepare('SELECT failures,reset_at FROM login_guard WHERE user_id=?').bind(guardId).first();
 if(guard&&guard.reset_at>now&&guard.failures>=5)return json({error:'Çok fazla hatalı giriş. 15 dakikalık bekleme süresi dolunca yeniden deneyin.'},429,{'Retry-After':String(guard.reset_at-now)});
 if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'İstek çok büyük'},413);
 const raw=await request.text();if(raw.length>4096)return json({error:'İstek çok büyük'},413);
 let body;try{body=JSON.parse(raw)}catch{return json({error:'Geçersiz istek'},400)}
 const name=typeof body.username==='string'?body.username.normalize('NFC'):'';
 const pass=typeof body.password==='string'?body.password:'';
 const validName=await equalSecret(name,env.OSINT_ADMIN_USERNAME.normalize('NFC')),validPass=await equalSecret(pass,env.OSINT_ADMIN_PASSWORD);
 if(!validName||!validPass){
   const current=guard&&guard.reset_at>now?guard:{failures:0,reset_at:now+900};
   await env.DB.batch([env.DB.prepare('INSERT INTO login_guard(user_id,failures,reset_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET failures=CASE WHEN login_guard.reset_at<excluded.reset_at THEN 1 ELSE login_guard.failures+1 END,reset_at=excluded.reset_at').bind(guardId,current.failures+1,current.reset_at),auditStatement(env,user,'Hatalı yönetici girişi','Yönetici paneli')]);
   return json({error:'Kullanıcı adı veya şifre hatalı.'},401);
 }
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE user_id=? OR expires_at<=?').bind(user.id,now),env.DB.prepare('INSERT INTO admin_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await adminTokenDigest(token,env),user.id,now+1800),env.DB.prepare('DELETE FROM login_guard WHERE user_id=?').bind(guardId),auditStatement(env,user,'Yönetim oturumu açıldı','Yönetici paneli')]);
 return json({ok:true},200,{'Set-Cookie':'__Host-osint_admin='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict'});
}
export function activeData(data){
 const ids=new Set(SOURCES.map(s=>s.id));
 return {...data,results:(data?.results||[]).filter(h=>ids.has(h.id)),events:(data?.events||[]).flatMap(e=>{const sources=(e.sources||[]).filter(s=>ids.has(s.sourceId));if(!sources.length)return [];return [{...e,...(!ids.has(e.sourceId)?sources[0]:{}),...classify(e.title,e.description),...sourceSignals(SOURCES.find(s=>s.id===e.sourceId)||{},e.title,e.description,e.url),id:e.id,sources}]})};
}
async function publishedData(env){
 await maintainRetention(env);
 if(!env?.DB)return publicBundle(activeData({...INITIAL_DATA,events:retainedEvents(INITIAL_DATA?.events)}),DEFAULT_SETTINGS);
 const rows=await env.DB.prepare('SELECT data FROM snapshots').all();
 const events=new Map((INITIAL_DATA?.events||[]).map(e=>[e.id,e])),health=new Map((INITIAL_DATA?.results||[]).map(h=>[h.id,h]));let syncedAt=INITIAL_DATA?.syncedAt;
 for(const row of rows.results||[]){const d=JSON.parse(row.data);for(const e of d.events||[])events.set(e.id,e);for(const h of d.results||[])if(!health.has(h.id)||h.checkedAt>health.get(h.id).checkedAt)health.set(h.id,h);if(!syncedAt||d.syncedAt>syncedAt)syncedAt=d.syncedAt;}
 const bundle=activeData({events:retainedEvents([...events.values()]),results:[...health.values()],syncedAt});
 if(typeof env.OSINT_LAB_EVENTS==='function')bundle.events.push(...retainedEvents(await env.OSINT_LAB_EVENTS()));
 return publicBundle(bundle,await workspaceSettings(env));
}
async function publishBatch(env,data){data={...data,events:retainedEvents(data.events)};if(!env?.DB)throw Error('Ortak veritabanı bağlı değil');const row=await env.DB.prepare('SELECT data FROM snapshots WHERE id=?').bind('batch-'+data.batch).first();if(row){const previous=JSON.parse(row.data);const map=new Map((previous.events||[]).map(e=>[e.id,e]));for(const e of data.events)map.set(e.id,e);data={...data,events:publicationRecords(retainedEvents([...map.values()])).sort(publicationOrder).slice(0,500)}}await env.DB.prepare('INSERT INTO snapshots (id,data,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('batch-'+data.batch,JSON.stringify(data),data.syncedAt).run();}
function auditStatement(env,user,action,target){return env.DB.prepare('INSERT INTO audit (id,actor,action,target,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user.id,action,target,new Date().toISOString());}
async function adminAPI(request,env,user,url){
 if(!user.admin)return json({error:user.id?'Yönetici yetkisi gerekli':'Giriş gerekli'},user.id?403:401);
 if(!env?.DB)return json({error:'Ortak veritabanı henüz bağlı değil'},503);
 if(!await adminSession(request,env,user))return json({error:'Yönetici kullanıcı adı ve şifresiyle giriş gerekli'},401);
 if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('Origin')!==url.origin))return json({error:'İstek kaynağı veya yöntemi reddedildi'},403);
 if(['/api/admin/workspace-settings','/api/admin/accounts','/api/admin/grouping'].includes(url.pathname))return adminWorkspaceAPI(request,env,user,url);
 if(url.pathname==='/api/admin/config'&&request.method==='GET')return json({sources:SOURCES,sourceCandidates:SOURCE_CANDIDATES,settings:await workspaceSettings(env),keywordGroups:profileFor(await workspaceSettings(env)),nationalKeywordGroups:NATIONAL_KEYWORD_GROUPS,batchSize:5,schedule:env.OSINT_AUTO_UPDATE_ENABLED==='true',refreshIntervalMs:600000,initialData:await publishedData(env)});
 if(url.pathname==='/api/admin/audit'&&request.method==='GET')return json({entries:(await env.DB.prepare('SELECT action,target,created_at FROM audit ORDER BY created_at DESC LIMIT 100').all()).results});
 if(url.pathname!=='/api/admin/members')return json({error:'Bulunamadı'},404);
 if(request.method==='GET')return json({members:(await env.DB.prepare('SELECT email,name,user_id,active,created_at FROM members ORDER BY created_at DESC').all()).results});
 if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'İstek çok büyük'},413);
 const raw=await request.text();if(raw.length>4096)return json({error:'İstek çok büyük'},413);
 let body;try{body=JSON.parse(raw)}catch{return json({error:'Geçersiz istek'},400)}
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||!email||![0,1].includes(body.active))return json({error:'Geçerli e-posta ve üyelik durumu gerekli'},400);
 if(email===env.OSINT_ADMIN_EMAIL?.trim().toLowerCase())return json({error:'Site sahibinin yetkisi ekip listesinden değiştirilemez'},403);
 const old=await env.DB.prepare('SELECT email FROM members WHERE email=?').bind(email).first();
 const name=typeof body.name==='string'?body.name.trim().slice(0,120):'';
 if(!old&&!name)return json({error:'Ad soyad gerekli'},400);
 const statement=old?env.DB.prepare('UPDATE members SET active=? WHERE email=?').bind(body.active,email):env.DB.prepare('INSERT INTO members(email,name,active,created_at) VALUES(?,?,?,?)').bind(email,name,body.active,new Date().toISOString());
 await env.DB.batch([statement,auditStatement(env,user,body.active?'Üyelik etkinleştirildi':'Üyelik kapatıldı',email)]);
 return json({ok:true});
}

async function syncBatch(batch,env,ctx,origin,user,automatic=false){
      await maintainRetention(env);
      const settings=await workspaceSettings(env),registry=activeSources(settings),profile=profileFor(settings),revision='national-v1-'+stableId(JSON.stringify(settings));
      const batchSize=5,totalBatches=Math.ceil(registry.length/batchSize);
      if(totalBatches===0)return {batch:0,totalBatches:0,events:[],results:[],cached:true,syncedAt:null};
      if(!Number.isInteger(batch)||batch<0||batch>=totalBatches)throw new RangeError('Geçersiz kaynak grubu');
      const previous=await env.DB.prepare('SELECT data FROM snapshots WHERE id=?').bind('batch-'+batch).first();
      if(previous){const saved=JSON.parse(previous.data);const expected=registry.slice(batch*batchSize,(batch+1)*batchSize).map(s=>s.id).join(',');if(saved.collectorRevision===revision&&(saved.results||[]).map(h=>h.id).join(',')===expected&&Date.now()-Date.parse(saved.checkedAt||saved.syncedAt)<540000)return {...saved,batch,totalBatches,cached:true};}
      const selected=registry.slice(batch*batchSize,(batch+1)*batchSize);
      const lease=crypto.randomUUID(),now=Date.now();
      const acquired=await env.DB.prepare('INSERT INTO refresh_locks(id,token,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE refresh_locks.expires_at<=? RETURNING token').bind('batch-'+batch,lease,now+60000,now).first();
      if(!acquired)return {batch,totalBatches,busy:true,events:[],results:[]};
      try{
      const results=await Promise.all(selected.map(source=>collectSource({...source,profile},{enrich:false})));
      const checkedAt=new Date().toISOString(),succeeded=results.some(r=>['healthy','no_match','empty'].includes(r.status));
      const data={collectorRevision:revision,checkedAt,syncedAt:succeeded?checkedAt:(previous?JSON.parse(previous.data).syncedAt:null),succeeded,results:results.map(({items,...r})=>r),events:retainedEvents(clusterItems(results.flatMap(r=>r.items))),batch,totalBatches,cached:false};
      await publishBatch(env,data);if(batch===totalBatches-1)await afterSourceRefresh(env);await auditStatement(env,user,automatic?'Otomatik kaynak kontrolü':'Kaynak kontrolü','Grup '+(batch+1)).run();

      return data;
      }finally{await env.DB.prepare('DELETE FROM refresh_locks WHERE id=? AND token=?').bind('batch-'+batch,lease).run()}
}
async function publicRefresh(request,env,ctx,url){
 if(request.method!=='POST')return json({error:'POST gerekli'},405);
 if(request.headers.get('Origin')!==url.origin)return json({error:'İstek kaynağı reddedildi'},403);
 if(!env.DB)return json({error:'Ortak veritabanı bağlı değil'},503);
 const raw=url.searchParams.get('batch'),batch=Number(raw),totalBatches=Math.ceil(activeSources(await workspaceSettings(env)).length/5);
 if(totalBatches===0)return json({batch:0,totalBatches:0,cached:true,checked:0,reachable:0,disabled:true});
 if(raw===null||!Number.isInteger(batch)||batch<0||batch>=totalBatches)return json({error:'Geçersiz grup'},400);
 try{const data=await syncBatch(batch,env,ctx,url.origin,{id:'public-refresh'},true);return json({batch,totalBatches,busy:!!data.busy,cached:!!data.cached,succeeded:data.succeeded??true,syncedAt:data.syncedAt,checkedAt:data.checkedAt,checked:(data.results||[]).length,reachable:(data.results||[]).filter(r=>['healthy','no_match','empty'].includes(r.status)).length})}
 catch{return json({error:'Tarama tamamlanamadı; önceki haberler korundu.'},503)}
}
async function serviceUpdate(request,env,ctx,url){
 if(request.method!=='POST')return json({error:'POST gerekli'},405,{'Allow':'POST'});
 const token=request.headers.get('X-OSINT-Service-Key')||'';
 if(!env.OSINT_AUTOMATION_KEY_SHA256||!token||!await equalSecret(await sha(token),env.OSINT_AUTOMATION_KEY_SHA256))return json({error:'Yetkili otomatik görev gerekli'},401);
 if(!env.DB)return json({error:'Ortak veritabanı bağlı değil'},503);
 const batch=Number(url.searchParams.get('batch'));
 if(!url.searchParams.has('batch')||!Number.isInteger(batch)||batch<0||batch>=Math.ceil(activeSources(await workspaceSettings(env)).length/5))return json({error:'Geçersiz kaynak grubu'},400);
 try{const data=await syncBatch(batch,env,ctx,url.origin,{id:'scheduled-service'},true);return json({batch,totalBatches:data.totalBatches,syncedAt:data.syncedAt,checkedAt:data.checkedAt,busy:!!data.busy,cached:data.cached,events:data.events.length,results:data.results})}catch(e){console.error('Automatic source refresh failed: '+String(e.message).slice(0,180));return json({error:'Kaynak grubu yenilenemedi; önceki kayıtlar korundu.',detail:String(e.message).slice(0,180)},503)}
}
async function mcp(request,env,ctx,user,url){
 if(request.method!=='POST')return json({error:'POST gerekli'},405,{'Allow':'POST'});
 if(Number(request.headers.get('Content-Length')||0)>8192)return json({error:'İstek çok büyük'},413);
 let input;try{const text=await request.text();if(text.length>8192)return json({error:'İstek çok büyük'},413);input=JSON.parse(text)}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},400)}
 const respond=result=>json({jsonrpc:'2.0',id:input.id??null,result});
 if(input.method==='server/discover')return respond({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(input.method==='initialize')return respond({protocolVersion:'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'umraniye-osint',version:'1.0'}});
 if(input.method==='notifications/initialized')return new Response(null,{status:204});
 if(input.method==='tools/list')return respond({tools:[{name:'osint_refresh_sources',description:'Site sahibine özel otomatik gündem yenilemesi. Kaynak gruplarını 0’dan son gruba kadar sırayla çağırın. Sabit açık kaynakları tarar ve ortak gündeme kaydeder. Üye ve yönetim ayarlarını değiştirmez.',inputSchema:{type:'object',properties:{batch:{type:'integer',minimum:0,maximum:Math.ceil(SOURCES.length/5)-1,description:'Yenilenecek kaynak grubunun sıfırdan başlayan numarası'}},required:['batch'],additionalProperties:false}},{name:'osint_update_status',description:'Otomatik güncelleme kapsamını, grup sayısını ve son kaynak kontrolünü okuyun.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
 if(input.method!=='tools/call')return json({jsonrpc:'2.0',id:input.id??null,error:{code:-32601,message:'Method not found'}});
 const result=(data,isError=false)=>respond({content:[{type:'text',text:JSON.stringify(data)}],isError});
 if(!user.admin)return result({error:'Yalnız doğrulanmış site sahibi bu aracı kullanabilir.'},true);
 if(!env.DB)return result({error:'Ortak veritabanı bağlı değil'},true);
 if(input.params?.name==='osint_update_status'){const data=await publishedData(env);return result({sourceCount:SOURCES.length,totalBatches:Math.ceil(SOURCES.length/5),intervalMinutes:10,enabled:env.OSINT_AUTO_UPDATE_ENABLED==='true',syncedAt:data.syncedAt,events:data.events.length,results:data.results})}
 if(input.params?.name!=='osint_refresh_sources')return result({error:'Bilinmeyen araç'},true);
 const batch=input.params?.arguments?.batch;
 if(!Number.isInteger(batch)||batch<0||batch>=Math.ceil(SOURCES.length/5))return result({error:'Geçersiz kaynak grubu'},true);
 try{const data=await syncBatch(batch,env,ctx,url.origin,user,true);return result({batch,totalBatches:data.totalBatches,syncedAt:data.syncedAt,checkedAt:data.checkedAt,busy:!!data.busy,cached:data.cached,events:data.events.length,results:data.results})}catch{return result({error:'Kaynak grubu yenilenemedi; önceki kayıtlar korundu.'},true)}
}
__WORKSPACE_CODE__
const application = {
  async fetch(request,env={},ctx){
    const url=new URL(request.url);let user=identity(request,env);
    if(cookieToken(request)&&await adminSession(request,env,user))user={id:ADMIN_PRINCIPAL,email:env.OSINT_ADMIN_EMAIL||null,admin:true};
    if(url.pathname==='/api/login')return unifiedLogin(request,env,url);
    if(url.pathname==='/api/logout')return unifiedLogout(request,env,url);
    if(url.pathname.startsWith('/api/team/')){try{return await teamLogin(request,env,url)}catch{return json({error:'Giriş isteği tamamlanamadı'},400)}}
    if(url.pathname.startsWith('/api/account')){try{return await accountAPI(request,env,user,url)}catch{return json({error:'Hesap işlemi tamamlanamadı. Yeniden deneyin.'},400)}}
    if(url.pathname==='/giris')return await accountActor(request,env,user)?Response.redirect(url.origin+'/?view=account',302):htmlResponse(TEAM_LOGIN_HTML);
    if(url.pathname==='/ekip')return htmlResponse(await workspaceActor(request,env,user)?WORKSPACE_HTML:TEAM_LOGIN_HTML);
    if(url.pathname.startsWith('/api/workspace')){try{return await workspaceAPI(request,env,user,url)}catch(e){return json({error:'İşlem tamamlanamadı. Alanları kontrol edip yeniden deneyin.'},400)}}
    const privateRoute=['/','/index.html','/yeni-tasarim','/api/config','/api/refresh'].includes(url.pathname)||url.pathname.startsWith('/api/public/')||url.pathname.startsWith('/assets/briefing')||url.pathname.startsWith('/assets/jspdf');
    if(privateRoute&&!await workspaceActor(request,env,user)&&!(url.pathname==='/api/config'&&await serviceCanRead(request,env)))return url.pathname.startsWith('/api/')||url.pathname.startsWith('/assets/')?json({error:'Kullanıcı girişi gerekli'},401):Response.redirect(url.origin+'/giris',302);
    if(url.pathname==='/assets/briefing-pdf.js')return new Response(BRIEFING_JS,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'private,max-age=86400','X-Content-Type-Options':'nosniff'}});
    if(url.pathname==='/api/public/export'){const data=await publishedData(env);return new Response(eventsCSV(reportEvents(data.events,url)),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=Umraniye_OSINT.csv'}})}
    if(url.pathname==='/api/public/map')return json(MAP_DATA);
    if(url.pathname==='/api/refresh')return publicRefresh(request,env,ctx,url);
    if(url.pathname==='/mcp')return mcp(request,env,ctx,user,url);
    if(url.pathname==='/api/automation/refresh')return serviceUpdate(request,env,ctx,url);
    if(url.pathname==='/api/automation/instructions')return json({revision:'auto-refresh-v1',intervalMinutes:10,totalBatches:Math.ceil(activeSources(await workspaceSettings(env)).length/5),instructions:'Bu Site için get_site ile güncel siwc_bypass_bearer_token değerini alın. Yalnız bu Siteye OAI-Sites-Authorization: Bearer ve X-OSINT-Service-Key başlıklarında gönderin; günlük, mesaj, dosya veya görev metnine yazmayın. 0 ile totalBatches-1 arasındaki her grup için POST /api/automation/refresh?batch=N isteğini sırayla çalıştırın. Her grup sonucunu kontrol edin. Geçici hatada en fazla bir kez yeniden deneyin. Sonunda GET /api/config ile kalıcı syncedAt ve kaynak sonuçlarını doğrulayın. Yeniden yayınlama veya yönetici giriş bilgileri gerekmez.'});
    if(url.pathname==='/yonetim'||url.pathname==='/yonetim/ekip')return await adminSession(request,env,user)?htmlResponse(ADMIN_HTML):loginPage(user);
    if(['/api/admin/login','/api/admin/logout'].includes(url.pathname)){try{return await passwordAction(request,env,user,url)}catch{return json({error:'Giriş işlemi tamamlanamadı. Yeniden deneyin.'},503)}}
    if(url.pathname==='/api/admin/migration-export')return migrationExport(request,env,user,url);
    if(url.pathname.startsWith('/api/admin/')){try{return await adminAPI(request,env,user,url)}catch{return json({error:'Yönetim verisi okunamadı. Yeniden deneyin.'},503)}}
    if(url.pathname==='/api/session'){
      let member=false;
      if(user.id&&user.email&&env.DB){const m=await env.DB.prepare('SELECT active,user_id FROM members WHERE email=?').bind(user.email).first();member=!!(m?.active&&(!m.user_id||m.user_id===user.id));if(member&&!m.user_id)await env.DB.prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL').bind(user.id,user.email).run();}
      const session=await adminSession(request,env,user);
      return json({email:user.email,admin:user.admin,member,adminUnlocked:!!session,adminExpiresAt:session?.expires_at||null});
    }
    if(url.pathname==='/assets/umraniye-kaymakamligi-logo.png'||url.pathname==='/favicon.png')return new Response(Uint8Array.from(atob(LOGO_BASE64),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
    if(url.pathname==='/api/config'){const data=await publishedData(env);return json({neighborhoods:NEIGHBORHOODS,version:'1.0',nationalCategories:NATIONAL_KEYWORD_GROUPS.map(g=>g.name.replace('Ulusal · ','')),retention:{months:2,cutoff:retentionCutoff()},schedule:env.OSINT_AUTO_UPDATE_ENABLED==='true',refreshIntervalMs:600000,totalBatches:Math.ceil(activeSources(await workspaceSettings(env)).length/5),initialData:{events:data.events,syncedAt:data.syncedAt}});}
    if(url.pathname==='/api/sync'){
      if(request.method!=='POST')return json({error:'POST gerekli'},405,{'Allow':'POST'});
      if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'İstek kaynağı reddedildi'},403);
      if(!user.admin)return json({error:'Yalnız yönetici kaynak yenileyebilir'},user.id?403:401);
      if(request.headers.get('Origin')!==url.origin)return json({error:'İstek kaynağı gerekli'},403);
      if(!env.DB)return json({error:'Ortak veritabanı bağlı değil'},503);
      if(!await adminSession(request,env,user))return json({error:'Yönetici şifresiyle giriş gerekli'},401);
      const batch=Number(url.searchParams.get('batch')||0);if(!Number.isInteger(batch)||batch<0||batch>=Math.ceil(SOURCES.length/5))return json({error:'Geçersiz kaynak grubu'},400);
      return json(await syncBatch(batch,env,ctx,url.origin,user));
    }
    if(url.pathname==='/health')return json({ok:true,service:'umraniye-osint',version:'0.1'});
    if(url.pathname.startsWith('/api/'))return json({error:'Bulunamadı'},404);
    if(url.pathname==='/yeni-tasarim')return Response.redirect(url.origin+'/',308);
    if(!['/','/index.html'].includes(url.pathname))return new Response('Bulunamadı',{status:404});
    return new Response(APP_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"}});
  }
};

export default {async fetch(request,env={},ctx){
 const url=new URL(request.url);
 if(!['GET','HEAD','POST'].includes(request.method))return json({error:'Yöntem desteklenmiyor'},405,{'Allow':'GET, HEAD, POST'});
 if(request.method==='POST'&&request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'İstek kaynağı reddedildi'},403);
 const response=await application.fetch(request,env,ctx),headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(url.protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
 return new Response(response.body,{status:response.status,headers});
}};
