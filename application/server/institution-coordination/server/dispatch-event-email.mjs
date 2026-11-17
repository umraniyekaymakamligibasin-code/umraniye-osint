

const isoNow = () => new Date().toISOString();
const affected = result => Number(result?.meta?.changes ?? result?.changes ?? 0);
const safeResult = (sent = 0, retried = 0, held = 0, dead = 0) => ({ sent, retried, held, dead });

const ELIGIBILITY = `SELECT o.id,o.coord_case_id,o.institution_id,o.recipient_id,o.attempts,o.provider_idempotency_key,
  r.address_ciphertext,r.key_version,r.address_fingerprint
  FROM coord_mail_outbox o
  JOIN coord_cases c ON c.id=o.coord_case_id AND c.institution_id=o.institution_id AND c.sensitivity<>'restricted'
  JOIN coord_institutions i ON i.id=o.institution_id AND i.enabled=1 AND i.approval_status='approved' AND i.email_enabled=1
  JOIN coord_topics t ON t.id=c.topic_id AND t.enabled=1 AND t.approval_status='approved' AND t.sensitivity<>'restricted'
  JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.topic_id=t.id AND g.granted=1 AND g.approval_reference IS NOT NULL
  JOIN coord_mail_recipients r ON r.id=o.recipient_id AND r.institution_id=i.id AND r.active=1
    AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL AND r.address_fingerprint=o.recipient_hash
  WHERE o.id=? AND o.institution_id=? AND o.coord_case_id=? AND o.state='sending'`;

/**
 * Event-only dispatcher. The host must supply encrypted-recipient decryption,
 * verified-address checks, an allow-listed HTTPS portal URL, and a mail adapter
 * that guarantees idempotency by key. Ambiguous send outcomes are never retried.
 */
export async function dispatchDueInstitutionNotices({ db, decryptAddress, sendWithIdempotency, portalUrl, limit = 10, onError }) {
  if (!db?.prepare || typeof decryptAddress !== 'function' || typeof sendWithIdempotency !== 'function') throw new Error('Required mail security adapters missing');
  if (sendWithIdempotency.supportsIdempotency !== true && sendWithIdempotency.durableClaimOnly !== true) throw new Error('Mail provider idempotency support required');
  const parsedPortal = new URL(portalUrl);
  if (parsedPortal.protocol !== 'https:' || parsedPortal.username || parsedPortal.password) throw new Error('A fixed HTTPS portal URL is required');
  // Recover abandoned claims with the same provider idempotency key.
  await db.prepare(`UPDATE coord_mail_outbox SET state=CASE WHEN ?=0 OR attempts>=5 THEN 'dead' ELSE 'queued' END,
    next_attempt_at=?,lease_until=NULL,last_error_code='expired_claim' WHERE state='sending' AND lease_until<=?`)
    .bind(sendWithIdempotency.supportsIdempotency===true?1:0,isoNow(),isoNow()).run();
  const count = Math.max(1, Math.min(10, Number.isInteger(limit) ? limit : 10));
  const due = await db.prepare(`SELECT id,coord_case_id,institution_id,recipient_id,attempts FROM coord_mail_outbox
    WHERE state IN ('queued') AND next_attempt_at<=? ORDER BY created_at,id LIMIT ?`).bind(isoNow(), count).all();
  const result = safeResult();

  for (const row of due?.results ?? []) {
    const claimAt = isoNow();
    const claimed = await db.prepare(`UPDATE coord_mail_outbox SET state='sending',attempts=attempts+1,lease_until=?
      WHERE id=? AND state IN ('queued') AND next_attempt_at<=? AND attempts<5`)
      .bind(new Date(Date.now()+300000).toISOString(), row.id, claimAt).run();
    if (affected(claimed) !== 1) continue;

    let eligible;
    try { eligible = await db.prepare(ELIGIBILITY).bind(row.id, row.institution_id, row.coord_case_id).first(); }
    catch (error) {
      onError?.({ code: 'notice_eligibility_check_failed' });
      await db.prepare(`UPDATE coord_mail_outbox SET state='dead',last_error_code='eligibility_check_failed' WHERE id=? AND state='sending'`).bind(row.id).run();
      result.dead++; continue;
    }
    if (!eligible) {
      await db.prepare(`UPDATE coord_mail_outbox SET state='cancelled',last_error_code='eligibility_revoked' WHERE id=? AND state='sending'`).bind(row.id).run();
      result.held++; continue;
    }

    try {
      // The decrypted address exists only in this scope and is never logged or returned.
      const address = await decryptAddress({ ciphertext: eligible.address_ciphertext, keyVersion: eligible.key_version });
      if (typeof address !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) throw Object.assign(new Error('recipient_invalid'), { definitelyNotSent: true });
      // Recheck grants, approval, recipient verification and email policy immediately before send.
      const stillEligible = await db.prepare(ELIGIBILITY).bind(row.id, row.institution_id, row.coord_case_id).first();
      if (!stillEligible) {
        await db.prepare(`UPDATE coord_mail_outbox SET state='cancelled',last_error_code='eligibility_revoked' WHERE id=? AND state='sending'`).bind(row.id).run();
        result.held++; continue;
      }
      const idem = stillEligible.provider_idempotency_key;
      await sendWithIdempotency({
        to: address,
        idempotencyKey: idem,
        subject: 'Ümraniye OSINT kurum panelinde yeni kayıt',
        text: `Yetkili olduğunuz kurum paneline yeni bir kayıt eklendi. Ayrıntıları güvenli panel oturumunuzdan inceleyin.\n\n${parsedPortal.origin}${parsedPortal.pathname}`
      });
      await db.prepare(`UPDATE coord_mail_outbox SET state='sent',sent_at=?,last_error_code=NULL WHERE id=? AND state='sending'`)
        .bind(isoNow(), row.id).run();
      result.sent++;
    } catch (error) {
      // A transport timeout may mean the provider accepted the message; do not retry an ambiguous send.
      const definitelyNotSent = error?.definitelyNotSent === true;
      const attempts = Number(row.attempts) + 1;
      if (!definitelyNotSent) {
        await db.prepare(`UPDATE coord_mail_outbox SET state='dead',last_error_code='delivery_outcome_unknown' WHERE id=? AND state='sending'`).bind(row.id).run();
        onError?.({ code: 'delivery_outcome_unknown' }); result.dead++; continue;
      }
      if (attempts >= 5) {
        await db.prepare(`UPDATE coord_mail_outbox SET state='dead',last_error_code='provider_rejected' WHERE id=? AND state='sending'`).bind(row.id).run();
        result.dead++;
      } else {
        const delay = Math.min(6 * 60 * 60, 60 * (2 ** (attempts - 1)));
        await db.prepare(`UPDATE coord_mail_outbox SET state='queued',next_attempt_at=?,last_error_code='provider_rejected' WHERE id=? AND state='sending'`)
          .bind(new Date(Date.now() + delay * 1000).toISOString(), row.id).run();
        result.retried++;
      }
      onError?.({ code: definitelyNotSent ? 'provider_rejected' : 'delivery_outcome_unknown' });
    }
  }
  return result;
}
