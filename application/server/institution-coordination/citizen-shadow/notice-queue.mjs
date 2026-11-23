/**
 * BILDIRIM KUYRUGU (unified boru hatti icin)
 *
 * Neden: `citizen-shadow` boru hatti vakalari `live-adapter` ile yaziyor;
 * eski `projeksiyon.mjs` mail outbox'ini o yaziyordu. Unified yola gecince
 * mail bildirimi tamamen durmustu. Bu modul, panel yazimindan SONRA ayni
 * islem icinde outbox satiri uretir (idempotent).
 *
 * Kapilar (hepsi zorunlu):
 *   - kurum onayli + email_enabled
 *   - konu onayli + ordinary
 *   - grant onayli
 *   - aktif + dogrulanmis alici
 *   - tazelik: yayin VEYA ilk gorulme son N saat icinde (varsayilan 24)
 *
 * Idempotent: id = "<caseId>:<recipientId>"; tekrar denemede satir degismez.
 */
import { randomUUID } from 'node:crypto';

const SAAT = 3600_000;
const TAZELIK_SAAT = Number(process.env.OSINT_MAIL_TAZE_SAAT ?? 24);

function tazeMi(event, simdi) {
  const sinir = simdi - TAZELIK_SAAT * SAAT;
  for (const alan of ['publishedAt', 'firstSeenAt', 'collectedAt']) {
    const t = Date.parse(event?.[alan] ?? '');
    if (Number.isFinite(t) && t >= sinir && t <= simdi + 300000) return true;
  }
  return false;
}

/**
 * @returns {{queued:number,skipped:number}}
 */
export function queueNotices(db, { caseIds, event, now = Date.now() }) {
  const rapor = { queued: 0, skipped: 0 };
  if (!Array.isArray(caseIds) || !caseIds.length) return rapor;
  if (!tazeMi(event, now)) { rapor.skipped += caseIds.length; return rapor; }
  const stamp = new Date(now).toISOString();
  const alicilar = db.prepare(`SELECT r.id, r.address_fingerprint
    FROM coord_mail_recipients r
    WHERE r.institution_id=? AND r.active=1
      AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL`);

  for (const caseId of caseIds) {
    const c = db.prepare(`SELECT c.id,c.institution_id,c.topic_id,c.sensitivity,c.status,
        i.email_enabled,i.enabled i_enabled,i.approval_status i_approval,
        t.enabled t_enabled,t.approval_status t_approval,t.sensitivity t_sensitivity,
        (SELECT 1 FROM coord_institution_topic_grants g
          WHERE g.institution_id=c.institution_id AND g.topic_id=c.topic_id
            AND g.granted=1 AND length(trim(g.approval_reference))>0) grant_ok
      FROM coord_cases c
      JOIN coord_institutions i ON i.id=c.institution_id
      JOIN coord_topics t ON t.id=c.topic_id
      WHERE c.id=?`).get(caseId);
    if (!c) { rapor.skipped++; continue; }
    const uygun = c.i_enabled === 1 && c.i_approval === 'approved' && c.email_enabled === 1
      && c.t_enabled === 1 && c.t_approval === 'approved'
      && c.status !== 'dismissed' && c.sensitivity !== 'restricted' && c.t_sensitivity !== 'restricted'
      && c.grant_ok === 1;
    if (!uygun) { rapor.skipped++; continue; }
    let eklendi = 0;
    for (const r of alicilar.all(c.institution_id)) {
      const id = `${caseId}:${r.id}`;
      {
        const sonuc = db.prepare(`INSERT OR IGNORE INTO coord_mail_outbox(
            id,coord_case_id,institution_id,recipient_id,recipient_hash,template_code,
            dedupe_key,state,attempts,next_attempt_at,lease_until,
            provider_idempotency_key,last_error_code,created_at,sent_at)
          VALUES(?,?,?,?,?,'initial-assignment',?,'queued',0,?,NULL,?,NULL,?,NULL)`
        ).run(id, caseId, c.institution_id, r.id, r.address_fingerprint,
          id, stamp, id, stamp);
        const n = Number(sonuc?.changes ?? sonuc?.meta?.changes ?? 0);
        if (n > 0) eklendi++;
      }
    }
    if (eklendi) rapor.queued += eklendi; else rapor.skipped++;
  }
  return rapor;
}

/** Bir olayin aktif vaka kimliklerini dondurur. */
export function eventCaseIds(db, eventId) {
  return db.prepare('SELECT case_id FROM cit_case_links WHERE event_id=? AND active=1')
    .all(eventId).map(r => r.case_id);
}

export { randomUUID };
