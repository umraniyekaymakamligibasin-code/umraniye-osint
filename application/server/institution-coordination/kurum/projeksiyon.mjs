/**
 * BAGLAM KARARINI VERITABANINA YAZAN KATMAN.
 *
 * `baglam.mjs` yalnizca karar uretir; burasi o karari `coord_cases` +
 * `coord_audit` (+ istege bagli `coord_mail_outbox`) olarak atomik yazar.
 *
 * Neden ayri? Eski `route-event.mjs` yuksek hassasiyetli konulari ve
 * displayTitles'da olmayan 40 konuyu blokluyor. Emniyet'in asayis/trafik/
 * yangin gorevleri tam da bu kapida takiliyordu. Bu dosya ayni tablo
 * sozlesmesini kullanir ama kapiyi baglam motorunun karari belirler.
 *
 * Guvenlik kurallari (degismez):
 *   - Yazmadan ONCE kurum + konu + grant yeniden DB'den dogrulanir.
 *   - Baslik ve ozet yalnizca kategori duzeyinde uretilir; kaynak metin
 *     KOPYALANMAZ (kisisel veri tasinmaz).
 *   - Ayni (kurum, olay, konu) ikinci kez yazilmaz (UNIQUE + ON CONFLICT).
 *   - Mail kuyrugu VARSAYILAN KAPALI; acmak icin `kuyrukla:true` gerekir.
 */
import { randomUUID } from 'node:crypto';
import { guvenliBaslik, guvenliOzet } from './baglam.mjs';

const IZINLI_HASSASIYET = new Set(['ordinary', 'high']);
const IZINLI_KONUM = new Set(['district', 'neighborhood']);

function simdi() { return new Date().toISOString(); }

/**
 * @param {object} p
 * @param {object} p.db         panel openDatabase() sarmalayicisi
 * @param {object} p.event      locality alani doldurulmus olay
 * @param {object} p.route      baglamliDegerlendir -> routes[i]
 * @param {object} p.profiller  etkin profil (basliklar dahil)
 * @param {boolean}[p.kuyrukla] mail outbox satiri yazilsin mi (varsayilan false)
 */
export async function projectContextEvent({ db, event, route, profiller, kuyrukla = false }) {
  if (!db?.prepare || typeof db.batch !== 'function') {
    throw new Error('Prepared statement ve atomik batch adaptoru gerekli');
  }
  if (!event || typeof event.id !== 'string' || !event.id) {
    return { decision: 'held', reason: 'source_event_id_yok' };
  }
  const loc = event.locality;
  if (!loc || loc.district !== 'Ümraniye' || loc.verified !== true
      || !IZINLI_KONUM.has(loc.precision)) {
    return { decision: 'held', reason: 'verified_umraniye_locality_required' };
  }

  const baslik = guvenliBaslik(route.topic, profiller);
  const ozet = guvenliOzet(event, route, profiller);
  if (!baslik || !ozet) return { decision: 'held', reason: 'no_safe_projection_title' };

  // Yazmadan once gercek DB durumu: onayli kurum + onayli konu + aktif grant.
  let onayli;
  try {
    onayli = await db.prepare(`SELECT i.id institution_id, t.id topic_id, t.sensitivity
      FROM coord_institutions i
      JOIN coord_topics t ON t.code=?
      JOIN coord_institution_topic_grants g
        ON g.institution_id=i.id AND g.topic_id=t.id AND g.granted=1
      WHERE i.code=? AND i.enabled=1 AND i.approval_status='approved'
        AND t.enabled=1 AND t.approval_status='approved' LIMIT 1`)
      .bind(route.topic, route.institution).first();
  } catch (hata) {
    return { decision: 'held', reason: 'db_dogrulama_hatasi', hata: String(hata?.message || hata).slice(0, 140) };
  }
  if (!onayli) return { decision: 'held', reason: 'institution_topic_not_approved' };
  if (!IZINLI_HASSASIYET.has(String(onayli.sensitivity))) {
    return { decision: 'held', reason: `sensitivity_not_projectable:${onayli.sensitivity}` };
  }

  const caseId = randomUUID();
  const createdAt = simdi();
  const idempotency = JSON.stringify([onayli.institution_id, event.id, onayli.topic_id]);
  const guven = Number.isFinite(route.confidence) ? Math.max(0, Math.min(1, route.confidence)) : 0.9;
  const ilkYayin = event.publishedAt ?? null;
  const ilkGorulme = event.firstSeenAt ?? createdAt;

  const insertCase = db.prepare(`INSERT INTO coord_cases(
      id,institution_id,topic_id,source_event_id,source_revision,idempotency_key,
      title,summary_redacted,neighborhood,location_precision,first_published_at,
      first_seen_at,confidence,status,priority,sensitivity,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'new','normal',?,?,?)
    ON CONFLICT(institution_id,source_event_id,topic_id) DO NOTHING`)
    .bind(caseId, onayli.institution_id, onayli.topic_id, event.id,
      String(event.revision ?? ''), idempotency, baslik, ozet,
      loc.neighborhood ?? null, loc.precision, ilkYayin, ilkGorulme, guven,
      String(onayli.sensitivity), createdAt, createdAt);

  const auditInsert = db.prepare(`INSERT INTO coord_audit(
      id,actor_account_id,actor_kind,institution_id,action,target_type,target_id,request_id,created_at)
    SELECT ?,NULL,'system',?, 'event_projection_context','case',id,NULL,?
    FROM coord_cases WHERE id=?`)
    .bind(randomUUID(), onayli.institution_id, createdAt, caseId);

  // Mail kapaliyken yalnizca vaka + audit yazilir. Outbox'a satir ancak acikca
  // istenirse ve alici dogrulanmissa girer.
  const ifadeler = [insertCase, auditInsert];

  // Kaynak satirlari (coord_case_sources): panelin "Kaynaklar" bolumu icin.
  // Kurumsal metaveri (url, yayinci adi, platform, tarih) tasinir; metin KOPYALANMAZ.
  // coord_case_id, ayni batch icindeki INSERT/ON CONFLICT sonrasi gercek vaka
  // satirindan cozulur -> mukerrer turlarda mevcut vakanin kaynaklari da tamamlanir.
  const kaynaklar = Array.isArray(event?.kaynaklar) ? event.kaynaklar : [];
  for (const k of kaynaklar.slice(0, 20)) {
    if (!k || typeof k.url !== 'string' || !/^https?:\/\//i.test(k.url) || k.url.length > 500) continue;
    ifadeler.push(db.prepare(`INSERT INTO coord_case_sources(
        id,coord_case_id,source_url,source_name,platform,published_at,added_at)
      SELECT ?, c.id, ?, ?, ?, ?, ?
      FROM coord_cases c
      WHERE c.institution_id=? AND c.source_event_id=? AND c.topic_id=?
      ON CONFLICT(coord_case_id,source_url) DO NOTHING`)
      .bind(randomUUID(), k.url.slice(0, 500),
        String(k.name || 'Yayıncı belirtilmemiş').slice(0, 120),
        String(k.platform || 'news').slice(0, 20), k.publishedAt ?? null, createdAt,
        onayli.institution_id, event.id, onayli.topic_id));
  }

  let outboxInsert = null;
  let outboxIndex = -1;
  if (kuyrukla) {
    const taze = ilkYayin && Date.parse(ilkYayin) >= Date.now() - 3_600_000
      && Date.parse(ilkYayin) <= Date.now() + 300_000;
    outboxInsert = db.prepare(`INSERT INTO coord_mail_outbox(
        id,coord_case_id,institution_id,recipient_id,recipient_hash,template_code,
        dedupe_key,state,attempts,next_attempt_at,created_at,provider_idempotency_key)
      SELECT ? || ':' || r.id, c.id, c.institution_id, r.id, r.address_fingerprint,
             'initial-assignment', c.id || ':' || r.id, 'queued', 0, ?, ?, c.id || ':' || r.id
      FROM coord_cases c
      JOIN coord_institutions i ON i.id=c.institution_id
        AND i.enabled=1 AND i.approval_status='approved' AND i.email_enabled=1
      JOIN coord_mail_recipients r ON r.institution_id=i.id
        AND r.active=1 AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL
      WHERE c.id=? AND ?=1
      ON CONFLICT(dedupe_key) DO NOTHING`)
      .bind(randomUUID(), createdAt, createdAt, caseId, taze ? 1 : 0);
    ifadeler.push(outboxInsert);
    outboxIndex = ifadeler.length - 1;
  }

  let sonuc;
  try {
    sonuc = await db.batch(ifadeler);
  } catch (hata) {
    return { decision: 'held', reason: 'db_yazma_hatasi', hata: String(hata?.message || hata).slice(0, 140) };
  }

  const yazilan = Number(sonuc?.[0]?.meta?.changes ?? sonuc?.[0]?.changes ?? 0) > 0
    || sonuc?.[0]?.results?.[0]?.id === caseId;
  if (!yazilan) {
    return { decision: 'duplicate', reason: 'duplicate_or_not_inserted',
      institution: route.institution, topic: route.topic };
  }
  const mailKuyruga = outboxInsert && outboxIndex >= 0
    ? Number(sonuc?.[outboxIndex]?.meta?.changes ?? sonuc?.[outboxIndex]?.changes ?? 0) > 0
    : false;
  return {
    decision: 'projected', institution: route.institution, topic: route.topic,
    confidence: guven, caseId, emailQueued: mailKuyruga,
  };
}

/** Bir olayin tum rotalarini yazar. */
export async function projectContextRoutes({ db, event, routes, profiller, kuyrukla = false }) {
  const sonuclar = [];
  for (const route of routes ?? []) {
    try {
      sonuclar.push(await projectContextEvent({ db, event, route, profiller, kuyrukla }));
    } catch (hata) {
      sonuclar.push({ decision: 'held', reason: 'beklenmeyen_hata',
        institution: route?.institution, topic: route?.topic,
        hata: String(hata?.message || hata).slice(0, 140) });
    }
  }
  return sonuclar;
}
