#!/usr/bin/env node
/**
 * Kurum yonlendirme boru hatti — bagimsiz zamanlayici.
 *
 * NEDEN AYRI SUREC?
 * Calisan sunucuya (start.mjs, worker/index.js) dokunmadan ayni SQLite
 * veritabanina baglanir, periyodik calisir, sunucuyu hic etkilemez.
 *
 * ONEMLI: DB, panelin kendi openDatabase() sarmalayicisiyla acilir.
 * Cunku route-event.mjs ve policy.mjs D1 tarzi API bekler
 * (prepare().bind().first(), all()->{results}, batch()). Cig node:sqlite
 * verilirse kurallar HIC uretilemez (sessiz basarisizlik) — bu daha once
 * yakalandi ve bu sekilde duzeltildi.
 *
 * AKIS (tek tur):
 *   1) snapshots -> olaylar -> +locality +policyVersion
 *   2) coord_event_jobs'a kuyrukla           (createInstitutionEventJobs.enqueue)
 *   3) kuyrugu bosalt -> coord_cases/outbox  (drain -> projectMultiInstitutionEvent)
 *   4) istege bagli: vadesi gelen bildirimleri gonder (dispatchDueInstitutionNotices)
 *
 * 2. ve 3. adim arasindaki ayrim onemli: kuyruk satiri olayin TAM kopyasini
 * tasir, boylece surec yarida olurse ayni olay tekrar islenir ve projeksiyon
 * idempotent kalir (coord_cases uzerinde UNIQUE institution+event+topic).
 *
 * Kullanim:
 *   node kurum-zamanlayici.mjs --rapor
 *   node kurum-zamanlayici.mjs --kuru
 *   node kurum-zamanlayici.mjs --tek-sefer
 *   node kurum-zamanlayici.mjs --tek-sefer --gonder --portal-url https://...
 *   node kurum-zamanlayici.mjs --aralik 600
 *   node kurum-zamanlayici.mjs --kontrol        (sunucu izin listesi denetimi)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KOK = dirname(fileURLToPath(import.meta.url));

/** Baglam motoru acik mi? (systemd drop-in ile 1 yapilir; varsayilan kapali) */
const baglamModu = () => String(process.env.OSINT_ROUTING_CONTEXT || '') === '1';
/** Mail kuyrugu yalnizca acikca istenirse yazilir. */
const mailKuyrugu = () => String(process.env.OSINT_ROUTING_OUTBOX || '') === '1';

const YARDIM = `Kurum yonlendirme zamanlayicisi

  --rapor              durum raporu (kurum/konu/case/kuyruk sayilari)
  --kuru               DB'ye YAZMADAN dene
  --tek-sefer          bir tur calistir ve cik
  --aralik <sn>        surekli calis, varsayilan 600
  --limit <n>          tur basina en fazla olay, varsayilan 25
  --gonder             vadesi gelen kurum e-postalarini da gonder (GERI ALINAMAZ)
  --portal-url <adres> e-posta govdesindeki panel adresi (https zorunlu)
  --data-dir <yol>     SQLite + smtp anahtarlarinin klasoru (DATA_DIR yerine gecer)
  --veritabani <yol>   SQLite dosyasini dogrudan ver (OSINT_DB_PATH yerine gecer)
  --sunucu <yol>       panel kok klasoru
  --kontrol            route-event.mjs guvenli baslik listesini denetle

Ortam:
  OSINT_ROUTING_CONTEXT=1   baglam motorunu ac (tum kurumlar icin onerilen)
  OSINT_ROUTING_OUTBOX=1    vaka ile birlikte mail kuyrugu da yaz (varsayilan kapali)
`;

/** Sunucudaki route-event.mjs'in gomulu guvenli baslik listesi (L11). */
function sunucuGuvenliKonular(routeDosyasi) {
  try {
    const kaynak = readFileSync(routeDosyasi, 'utf8');
    const blok = kaynak.match(/const\s+displayTitles\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/);
    if (!blok) return null;
    const anahtarlar = [...blok[1].matchAll(/(?:^|[,{\s])([a-z][a-z0-9_]*)\s*:/g)].map(m => m[1]);
    return [...new Set(anahtarlar)];
  } catch {
    return null;
  }
}

function argumanlar(argv) {
  const a = { tekSefer: false, kuru: false, aralik: 600, rapor: false, kontrol: false,
              dataDir: process.env.DATA_DIR || null, sunucu: null, limit: 25,
              gonder: false, portalUrl: process.env.OSINT_PORTAL_URL || null,
              veritabani: process.env.OSINT_DB_PATH || null, yardim: false };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--tek-sefer') a.tekSefer = true;
    else if (s === '--kuru') a.kuru = true;
    else if (s === '--rapor') a.rapor = true;
    else if (s === '--kontrol') a.kontrol = true;
    else if (s === '--gonder') a.gonder = true;
    else if (s === '--aralik') a.aralik = Number(argv[++i]) || 600;
    else if (s === '--limit') a.limit = Number(argv[++i]) || 25;
    else if (s === '--data-dir') a.dataDir = argv[++i];
    else if (s === '--veritabani') a.veritabani = argv[++i];
    else if (s === '--portal-url') a.portalUrl = argv[++i];
    else if (s === '--sunucu') a.sunucu = argv[++i];
    else if (s === '--help' || s === '-h') a.yardim = true;
  }
  return a;
}

/**
 * Panel kokunu bulur. Iki yerlesim desteklenir:
 *   repo yerlesimi : <kok>/application/server/institution-coordination/...
 *   sunucu yerlesi : <kok>/server/institution-coordination/...
 * (KOK = .../institution-coordination/kurum oldugundan repo koku 4, sunucu
 * koku 3 seviye yukaridadir.)
 */
function panelBul(a) {
  const adaylar = [a.sunucu, process.env.OSINT_PROJE, process.cwd(),
                   join(KOK, '..', '..', '..'),
                   join(KOK, '..', '..', '..', '..')].filter(Boolean);
  for (const aday of adaylar) {
    const p = resolve(aday);
    for (const uygulama of [join(p, 'application'), p]) {
      if (existsSync(join(uygulama, 'server', 'institution-coordination',
                          'server', 'route-event.mjs'))) {
        return { panel: p, uygulama };
      }
    }
  }
  return null;
}

/** SQLite yolu: acik yol > OSINT_DB_PATH > DATA_DIR > ./data. */
function veritabaniYolu(a) {
  if (a.veritabani) return existsSync(a.veritabani) ? resolve(a.veritabani) : null;
  const kok = a.dataDir || process.env.DATA_DIR || join(process.cwd(), 'data');
  for (const ad of ['osint.sqlite', 'deneme.sqlite']) {
    const y = join(kok, ad);
    if (existsSync(y)) return y;
  }
  return null;
}

const gecerliTarih = (deger) => {
  if (typeof deger !== 'string' || !Number.isFinite(Date.parse(deger))) return null;
  try { return new Date(deger).toISOString(); } catch { return null; }
};

/** Metni kirpar: 64 KB kuyruk sinirina ve gereksiz kisisel veri tasimasina karsi. */
const METIN_SINIRI = 8000;

/**
 * Snapshot olayini yonlendirme motorunun bekledigi sozlesmeye cevirir.
 * Sozlesme (server/route-event.mjs):
 *   id, revision, title, summary, description, publishedAt, firstSeenAt,
 *   historical, locality, riskCategory, sensitivity, sensitivityFlags
 * Buna ek olarak `policyVersion` konur; `enqueue` bunu ZORUNLU tutar ve
 * kod tabaninda bu alani hicbir uretici yazmiyordu (gizli kusur).
 */
/** Olayin yayinci/kaynak metaverisi (KURUMSAL bilgi; kisiye ozel degil).
 *  Baslik/metin KOPYALANMAZ politikasi bozulmadan panelde kaynak gosterimi
 *  icin gereken url + yayinci adi + platform + tarih listesini uretir. */
function kaynaklariTopla(e) {
  const cikti = [];
  const gorulen = new Set();
  const ekle = (url, name, platform, publishedAt) => {
    const u = typeof url === 'string' ? url.trim() : '';
    if (!/^https?:\/\//i.test(u) || u.length > 500) return;
    if (gorulen.has(u)) return;
    gorulen.add(u);
    cikti.push({
      url: u,
      name: String(name || 'Yayıncı belirtilmemiş').slice(0, 120),
      platform: String(platform || 'news').slice(0, 20),
      publishedAt: gecerliTarih(publishedAt) || null,
    });
  };
  for (const s of Array.isArray(e?.sources) ? e.sources.slice(0, 20) : []) {
    if (!s || typeof s !== 'object') continue;
    ekle(s.url, s.sourceName ?? s.source, s.platform, s.publishedAt);
  }
  ekle(e?.url, e?.sourceName ?? e?.accountName, e?.platform, e?.publishedAt);
  return cikti.slice(0, 20);
}

function olayCevir(e, kural, yerelLocality, snapshotAt) {
  const metin = [e.description, e.text, e.fullText].filter(Boolean).join('\n').slice(0, METIN_SINIRI);
  const publishedAt = gecerliTarih(e.publishedAt) || null;
  const firstSeenAt = gecerliTarih(e.firstSeenAt) || publishedAt
    || gecerliTarih(snapshotAt) || new Date(0).toISOString();
  return {
    id: e.id,
    revision: String(e.revision ?? ''),
    title: String(e.title ?? ''),
    summary: String(e.summary ?? ''),
    description: metin,
    publishedAt,
    firstSeenAt,
    historical: e.historical === true,
    locality: yerelLocality.localityCikar({ ...e, description: metin }),
    kaynaklar: kaynaklariTopla(e),
    riskCategory: String(e.riskCategory ?? e.category ?? ''),
    sensitivity: String(e.sensitivity ?? 'ordinary'),
    sensitivityFlags: e.sensitivityFlags && typeof e.sensitivityFlags === 'object'
      ? e.sensitivityFlags : {},
    policyVersion: String(kural.version),
  };
}

/** snapshots tablosundaki tum olaylari tekillestirerek okur. */
async function olaylariOku(db) {
  const olaylar = new Map();
  let sonuc;
  try { sonuc = await db.prepare('SELECT data, updated_at FROM snapshots').all(); }
  catch { return []; }
  const satirlar = Array.isArray(sonuc) ? sonuc : (sonuc?.results ?? []);
  for (const satir of satirlar) {
    let veri;
    try { veri = JSON.parse(satir.data); } catch { continue; }
    for (const e of veri.events || []) {
      if (!e || typeof e.id !== 'string' || !e.id) continue;
      const eski = olaylar.get(e.id);
      const uzunluk = (x) => String(x.fullText || x.description || x.text || '').length;
      if (!eski || uzunluk(e) > uzunluk(eski)) {
        olaylar.set(e.id, { ...e, _snapshotAt: satir.updated_at ?? null });
      }
    }
  }
  return [...olaylar.values()];
}

async function sayilar(db) {
  const say = async (sql) => {
    try { return Number((await db.prepare(sql).first())?.n ?? 0); }
    catch { return -1; }
  };
  const [kurum, onayliKurum, konu, onayliKonu, grant, alici, caseSayisi,
         outbox, kuyruk, islenmiş, olu, gonderilen] = await Promise.all([
    say('SELECT COUNT(*) n FROM coord_institutions'),
    say("SELECT COUNT(*) n FROM coord_institutions WHERE enabled=1 AND approval_status='approved'"),
    say('SELECT COUNT(*) n FROM coord_topics'),
    say("SELECT COUNT(*) n FROM coord_topics WHERE enabled=1 AND approval_status='approved'"),
    say('SELECT COUNT(*) n FROM coord_institution_topic_grants WHERE granted=1'),
    say('SELECT COUNT(*) n FROM coord_mail_recipients WHERE active=1'),
    say('SELECT COUNT(*) n FROM coord_cases'),
    say("SELECT COUNT(*) n FROM coord_mail_outbox WHERE state='queued'"),
    say("SELECT COUNT(*) n FROM coord_event_jobs WHERE state='queued'"),
    say("SELECT COUNT(*) n FROM coord_event_jobs WHERE state='completed'"),
    say("SELECT COUNT(*) n FROM coord_event_jobs WHERE state='dead'"),
    say("SELECT COUNT(*) n FROM coord_mail_outbox WHERE state='sent'"),
  ]);
  return { kurum, onayliKurum, konu, onayliKonu, grant, alici, caseSayisi,
           outbox, kuyruk, islenmis: islenmiş, olu, gonderilen };
}

/** Modulleri yukler: panelin route-event + database.mjs, yerel policy + locality. */
async function moduller(bul) {
  const dosya = (p) => pathToFileURL(p).href;
  const ic = join(bul.uygulama, 'server', 'institution-coordination');
  const [route, policy, locality, database, isler, dagitim,
         baglam, projeksiyon, profilUret] = await Promise.all([
    import(dosya(join(ic, 'server', 'route-event.mjs'))),
    import(dosya(join(KOK, 'policy.mjs'))),
    import(dosya(join(KOK, 'locality.mjs'))),
    import(dosya(join(bul.uygulama, 'server', 'database.mjs'))),
    import(dosya(join(ic, 'server', 'institution-event-jobs.mjs'))),
    import(dosya(join(ic, 'server', 'dispatch-event-email.mjs'))),
    import(dosya(join(KOK, 'baglam.mjs'))),
    import(dosya(join(KOK, 'projeksiyon.mjs'))),
    import(dosya(join(KOK, 'profil-uret.mjs'))),
  ]);
  return {
    route, policy, locality, baglam, projeksiyon, profilUret,
    openDatabase: database.openDatabase,
    createInstitutionEventJobs: isler.createInstitutionEventJobs,
    dispatchDueInstitutionNotices: dagitim.dispatchDueInstitutionNotices,
    routeDosyasi: join(ic, 'server', 'route-event.mjs'),
    ic,
  };
}

/** Alici sifreleme anahtari — YOKSA OLUSTURMAZ (aksi halde eski sifreler acilamaz). */
async function aliciAnahtari(bul, a) {
  const klasor = a.dataDir || process.env.DATA_DIR || null;
  if (!klasor) return { anahtar: null, sebep: 'data_dir_yok' };
  const yol = join(klasor, 'institution-recipients.key');
  if (!existsSync(yol)) return { anahtar: null, sebep: 'institution_recipients_key_yok' };
  try {
    const { accountKey } = await import(pathToFileURL(join(bul.uygulama, 'server', 'accounts.mjs')).href);
    return { anahtar: await accountKey(yol), sebep: null };
  } catch (hata) {
    return { anahtar: null, sebep: `anahtar_okunamadi:${String(hata?.message || hata).slice(0, 80)}` };
  }
}

/**
 * E-posta gonderim adimi.
 *
 * Guvenlik adaptorleri:
 *   decryptAddress        -> institution-recipients.mjs (AES-256-GCM, key dosyadan)
 *   sendWithIdempotency   -> gmail-sender.mjs (supportsIdempotency=false,
 *                            durableClaimOnly=true; belirsiz sonuc TEKRAR DENENMEZ)
 *
 * Anahtar dosyasi veya SMTP yapilandirmasi yoksa adim sessizce atlanmaz;
 * gerekce dondurulur ve hicbir sey gonderilmez.
 */
async function gonderimAdimi(db, mods, bul, a, limit) {
  if (!a.portalUrl) return { atlandi: 'portal_url_yok' };
  let portal;
  try {
    portal = new URL(a.portalUrl);
    if (portal.protocol !== 'https:' || portal.username || portal.password) {
      return { atlandi: 'portal_url_https_olmali' };
    }
  } catch { return { atlandi: 'portal_url_gecersiz' }; }

  const { anahtar, sebep } = await aliciAnahtari(bul, a);
  if (!anahtar) return { atlandi: sebep };

  const hatalar = [];
  try {
    const { createInstitutionRecipients } = await import(
      pathToFileURL(join(mods.ic, 'server', 'institution-recipients.mjs')).href);
    const { createGmailSender } = await import(
      pathToFileURL(join(mods.ic, 'server', 'gmail-sender.mjs')).href);
    const alicilar = createInstitutionRecipients({ db, key: anahtar });
    const klasor = a.dataDir || process.env.DATA_DIR;
    const gonderici = createGmailSender({ directory: klasor });
    return await mods.dispatchDueInstitutionNotices({
      db,
      decryptAddress: alicilar.decrypt,
      sendWithIdempotency: gonderici.send,
      portalUrl: a.portalUrl,
      limit,
      onError: (h) => { if (hatalar.length < 5) hatalar.push(h.code); },
    });
  } catch (hata) {
    return { hata: String(hata?.message || hata).slice(0, 160), hatalar };
  }
}

/** Elle yazilan ince ayarlar (haric konular, baglam sartlari, oncelik). */
function elleProfiller() {
  try {
    return JSON.parse(readFileSync(join(KOK, 'profiller.json'), 'utf8'));
  } catch {
    return { kurumlar: {} };
  }
}

async function izinleriOku(db) {
  try {
    const r = await db.prepare(`SELECT i.code institution, t.code topic
      FROM coord_institution_topic_grants g
      JOIN coord_institutions i ON i.id=g.institution_id AND i.enabled=1 AND i.approval_status='approved'
      JOIN coord_topics t ON t.id=g.topic_id AND t.enabled=1 AND t.approval_status='approved'
      WHERE g.granted=1`).all();
    return Array.isArray(r) ? r : (r?.results ?? []);
  } catch {
    return [];
  }
}

/**
 * BAGLAM TURU: tum kurumlar icin gorev alani + olay/duyuru + konum + kisisel
 * veri denetiminden gecirir. Yazma `projeksiyon.mjs` uzerinden yapilir ve
 * (kurum, olay, konu) benzersizligi sayesinde tur tekrar edilebilir.
 */
async function baglamTuru(db, mods, bul, kural, a) {
  const limit = Math.max(1, Math.min(200, a.limit | 0 || 25));
  const tumOlaylar = (await olaylariOku(db))
    .map(e => olayCevir(e, kural, mods.locality, e._snapshotAt));
  const olaylar = a.kuru ? tumOlaylar.slice(0, limit) : tumOlaylar;

  const elle = elleProfiller();
  const otomatik = await mods.profilUret.profilleriUret(db, elle);
  const profiller = mods.profilUret.profilleriBirlestir(otomatik, elle);
  const terimler = JSON.parse(readFileSync(join(KOK, 'topic-terms.json'), 'utf8'));
  const katalog = mods.baglam.terimKatalogu(terimler.konular);
  const izinler = await izinleriOku(db);

  const s = {
    baglam: true, profilSurum: profiller.surum, kuralSurum: kural.version,
    olay: olaylar.length, denenen: 0, yonlendirilebilir: 0, tutuldu: 0,
    sebepler: {}, kurumlar: {}, konular: {}, rotalar: [],
    yazilan: 0, mukerrer: 0, birlesen: 0, yazmaHatasi: 0, kuyruga: 0, islenen: 0, basarisiz: 0,
    ornekler: [],
  };

  let yazilan = 0;
  const gorulenBaslik = new Set();
  for (const e of olaylar) {
    s.denenen++;
    const k = mods.baglam.baglamliDegerlendir(e, { katalog, profiller, izinler });
    if (k.decision !== 'candidates') {
      s.tutuldu++;
      const sebep = k.reason || 'bilinmiyor';
      s.sebepler[sebep] = (s.sebepler[sebep] || 0) + 1;
      continue;
    }
    s.yonlendirilebilir++;
    for (const r of k.routes) {
      s.konular[r.topic] = (s.konular[r.topic] || 0) + 1;
      if (s.rotalar.length < 15) {
        s.rotalar.push({ olay: e.id, kurum: r.institution, konu: r.topic, guven: r.confidence });
      }
      // Ayni basliktaki sendika/servis kopyalari ayni turda tek vakaya iner.
      const anahtar = `${r.institution}|${r.topic}|${mods.baglam.normalize(e.title || '')}`;
      if (gorulenBaslik.has(anahtar)) { s.mukerrer++; continue; }
      gorulenBaslik.add(anahtar);
      if (a.kuru) continue;
      if (yazilan >= limit) continue;              // kucuk paket: tur basina en fazla `limit` YENI vaka
      const p = await mods.projeksiyon.projectContextEvent({
        db, event: e, route: r, profiller, kuyrukla: mailKuyrugu(),
      });
      s.islenen++;
      if (p.decision === 'projected') {
        yazilan++; s.yazilan++;
        if (p.emailQueued) s.kuyruga++;
        s.kurumlar[r.institution] = (s.kurumlar[r.institution] || 0) + 1;
      } else if (p.decision === 'duplicate') {
        s.mukerrer++;
      } else if (p.decision === 'merged') {
        s.birlesen++;
      } else {
        s.yazmaHatasi++;
        if (s.ornekler.length < 5) s.ornekler.push({ id: e.id, sebep: p.reason });
      }
    }
  }
  if (a.gonder) {
    s.gonderim = await gonderimAdimi(db, mods, bul, a, Math.max(1, Math.min(10, a.limit | 0 || 10)));
  }
  return s;
}

/** Tek tur. */
async function tur(db, mods, bul, kural, a) {
  if (baglamModu()) return baglamTuru(db, mods, bul, kural, a);
  const limit = Math.max(1, Math.min(200, a.limit | 0 || 25));
  // Kuru deneme yalnizca orneklem alir. Gercek turde TUM olaylar taranir:
  // kuyruk enqueue idempotent oldugu icin (job_key = kural+payload) daha once
  // islenmis olaylar atlanir. Boylece her tur, ilk N olaya takilmadan
  // BIR SONRAKI islenmemis paketi kuyruga alir.
  const tumOlaylar = (await olaylariOku(db))
    .map(e => olayCevir(e, kural, mods.locality, e._snapshotAt));
  const olaylar = a.kuru ? tumOlaylar.slice(0, limit) : tumOlaylar;

  // --- kuru: yalnizca siniflandir, hicbir sey yazma ---
  if (a.kuru) {
    const s = { kuru: true, olay: olaylar.length, denenen: 0,
                yonlendirilebilir: 0, tutuldu: 0, sebepler: {}, rotalar: [] };
    for (const e of olaylar) {
      s.denenen++;
      const k = mods.route.classifyForInstitutions(e, kural);
      if (k.decision === 'candidates') {
        s.yonlendirilebilir++;
        for (const r of k.routes) {
          s.rotalar.push({ olay: e.id, kurum: r.institution, konu: r.topic,
                           rol: r.role, guven: r.confidence });
        }
      } else {
        s.tutuldu++;
        const sebep = k.reason || 'bilinmiyor';
        s.sebepler[sebep] = (s.sebepler[sebep] || 0) + 1;
      }
      if ((k.conflicts ?? []).length) {
        s.sebepler.cakisan_yetki = (s.sebepler.cakisan_yetki || 0) + k.conflicts.length;
      }
    }
    return s;
  }

  // --- gercek tur: kuyrukla, bosalt, (istege bagli) gonder ---
  const isler = mods.createInstitutionEventJobs({ db, rules: kural });
  const s = { olay: olaylar.length, kuyruga: 0, kuyrukHata: 0,
              islenen: 0, basarisiz: 0, ornekler: [] };

  for (const e of olaylar) {
    if (s.kuyruga >= limit) break;              // kucuk paket: tur basina en fazla `limit` YENI is
    try {
      const r = await isler.enqueue(e, { historical: e.historical });
      if (r.queued) s.kuyruga++;
    } catch (hata) {
      s.kuyrukHata++;
      if (s.ornekler.length < 5) {
        s.ornekler.push({ id: e.id, kuyruk: String(hata?.message || hata).slice(0, 120) });
      }
    }
  }

  const d = await isler.drain({ limit });
  s.islenen = d.processed;
  s.basarisiz = d.failed;

  if (a.gonder) s.gonderim = await gonderimAdimi(db, mods, bul, a, Math.max(1, Math.min(10, d.processed || 10)));
  return s;
}

async function main() {
  const a = argumanlar(process.argv.slice(2));
  if (a.yardim) { console.log(YARDIM); return 0; }

  const bul = panelBul(a);
  if (!bul) { console.error('HATA: panel kok klasoru bulunamadi (--sunucu ile ver).'); return 2; }
  const mods = await moduller(bul);

  // Sunucu izin listesi denetimi
  if (a.kontrol) {
    const guvenli = sunucuGuvenliKonular(mods.routeDosyasi);
    if (!guvenli) { console.error('HATA: route-event.mjs icindeki displayTitles okunamadi.'); return 2; }
    const db = mods.openDatabase(veritabaniYolu(a) || ':memory:');
    try {
      const kural = await mods.policy.kurallariUret(db, {});
      const konular = [...new Set(kural.rules.map(r => r.topic))].sort();
      const engelli = konular.filter(k => !guvenli.includes(k));
      console.log(JSON.stringify({
        sunucu_guvenli_konu: guvenli.length, politika_konu: konular.length,
        engellenecek: engelli,
        aciklama: 'Bu konular sunucudaki route-event.mjs baslik listesinde yok; ' +
                  'olaylar topic_has_no_safe_projection_title ile tutulur.',
      }, null, 2));
      return 0;
    } finally { db.close(); }
  }

  const dbYolu = veritabaniYolu(a);
  if (!dbYolu) { console.error('HATA: osint.sqlite bulunamadi (--data-dir/--veritabani ile ver).'); return 2; }
  const ac = () => mods.openDatabase(dbYolu);

  // Rapor
  if (a.rapor) {
    const db = ac();
    try {
      const kural = await mods.policy.kurallariUret(db, {});
      const guvenli = sunucuGuvenliKonular(mods.routeDosyasi);
      const konular = [...new Set(kural.rules.map(r => r.topic))];
      console.log(JSON.stringify({
        veritabani: dbYolu, panel: bul.panel,
        kurallar: mods.policy.kurallariOzetle(kural),
        sunucu_guvenli_konu: guvenli,
        basliksiz_konu: guvenli ? konular.filter(k => !guvenli.includes(k)) : null,
        sayilar: await sayilar(db),
      }, null, 2));
      return 0;
    } finally { db.close(); }
  }

  // Tek tur / kuru
  const calistir = async () => {
    const db = ac();
    try {
      const kural = await mods.policy.kurallariUret(db, {});
      if (kural.state !== 'approved') {
        return { atlandi: 'kurallar_onaysiz', sebep: kural.sebep,
                 sayilar: await sayilar(db),
                 kurallar: mods.policy.kurallariOzetle(kural) };
      }
      const onceki = Number((await db.prepare('SELECT COUNT(*) n FROM coord_cases').first())?.n ?? 0);
      const sonuc = await tur(db, mods, bul, kural, a);
      if (!a.kuru && typeof sonuc === 'object') {
        const simdi = Number((await db.prepare('SELECT COUNT(*) n FROM coord_cases').first())?.n ?? 0);
        sonuc.yeniCase = simdi - onceki;
        sonuc.toplamCase = simdi;
      }
      return sonuc;
    } finally { db.close(); }
  };

  if (a.tekSefer || a.kuru) {
    const sonuc = await calistir();
    console.log(JSON.stringify(sonuc, null, 2));
    return 0;
  }

  // Surekli
  console.log(JSON.stringify({ olay: 'zamanlayici_basladi', aralik_sn: Math.max(60, a.aralik),
                               gonderim: a.gonder === true }));
  const dongu = async () => {
    try {
      const s = await calistir();
      console.log(JSON.stringify({ olay: 'tur_bitti', zaman: new Date().toISOString(), ...s }));
    } catch (e) {
      console.error(JSON.stringify({ olay: 'tur_hatasi', hata: String(e?.message || e) }));
    }
  };
  await dongu();
  setInterval(dongu, Math.max(60, a.aralik) * 1000);
  return null;   // surec acik kalir
}

const kod = await main();
if (kod !== null) process.exit(kod);
