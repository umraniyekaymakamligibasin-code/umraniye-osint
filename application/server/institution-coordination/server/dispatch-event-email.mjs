

const isoNow = () => new Date().toISOString();
const affected = result => Number(result?.meta?.changes ?? result?.changes ?? 0);
const safeResult = (sent = 0, retried = 0, held = 0, dead = 0) => ({ sent, retried, held, dead });

const ELIGIBILITY = `SELECT o.id,o.coord_case_id,o.institution_id,o.recipient_id,o.attempts,o.provider_idempotency_key,
  c.title AS case_title,c.summary_redacted AS case_summary,c.neighborhood AS case_neighborhood,
  c.source_event_id,c.created_at AS case_created_at,
  i.display_name AS institution_name,
  t.display_name AS topic_name,t.code AS topic_code,
  r.address_ciphertext,r.key_version,r.address_fingerprint
  FROM coord_mail_outbox o
  JOIN coord_cases c ON c.id=o.coord_case_id AND c.institution_id=o.institution_id AND c.sensitivity<>'restricted'
  JOIN coord_institutions i ON i.id=o.institution_id AND i.enabled=1 AND i.approval_status='approved' AND i.email_enabled=1
  JOIN coord_topics t ON t.id=c.topic_id AND t.enabled=1 AND t.approval_status='approved' AND t.sensitivity<>'restricted'
  JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.topic_id=t.id AND g.granted=1 AND g.approval_reference IS NOT NULL
  JOIN coord_mail_recipients r ON r.id=o.recipient_id AND r.institution_id=i.id AND r.active=1
    AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL AND r.address_fingerprint=o.recipient_hash
  WHERE o.id=? AND o.institution_id=? AND o.coord_case_id=? AND o.state='sending'`;

/* ------------------------------------------------------------------ *
 * Mail icerigi: haberin TAMAMI + kaynak baglantilari + kurumun gorev
 * alani. Kisisel veri maskelenir; hassas kategoriler zaten kapida
 * tutuldugu icin buraya gelmez.
 * ------------------------------------------------------------------ */

const MAIL_METIN_SINIRI = 6000;

const PII = [
  [/\b\d{11}\b/gu, '[kimlik no gizlendi]'],
  [/\bTR\d{2}\s?(?:\d{4}\s?){5}\d{2}\b/giu, '[IBAN gizlendi]'],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, '[e-posta gizlendi]'],
  [/\b(?:\+90|0)?[\s(]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/gu, '[telefon gizlendi]'],
  [/\b(?:plaka|ara[çc] plakas[ıi])\s*[:#-]?\s*[0-9]{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4}\b/giu, '[plaka gizlendi]'],
  [/\b(?:daire|kap[ıi]|bina)\s*(?:no|numaras[ıi])?\s*[:#-]?\s*\d+[A-Za-z]?\b/giu, '[adres no gizlendi]'],
];

function piiMaskele(value) {
  let t = String(value ?? '');
  for (const [r, yer] of PII) t = t.replace(r, yer);
  return t;
}

function metinTemizle(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:[a-z]+|#\d+);/giu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Kaynak olayin tam metnini (lab_items veya snapshots) bulur. */
async function olayMetniBul(db, sourceEventId) {
  if (!sourceEventId) return null;
  const kimlik = String(sourceEventId);
  try {
    const r = await db.prepare('SELECT data FROM lab_items WHERE id=?').bind(kimlik).first();
    if (r?.data) {
      const v = JSON.parse(r.data);
      return {
        title: v.title ?? null,
        metin: [v.description, v.fullText, v.text].filter(Boolean).join('\n\n'),
        kaynakAdi: v.sourceName ?? null, platform: v.platform ?? null,
        url: v.url ?? null, publishedAt: v.publishedAt ?? null,
      };
    }
  } catch { /* snapshots'a gec */ }
  try {
    const sonuc = await db.prepare('SELECT data FROM snapshots').all();
    for (const satir of sonuc?.results ?? []) {
      let veri; try { veri = JSON.parse(satir.data); } catch { continue; }
      const e = (veri?.events || []).find(x => x && String(x.id) === kimlik);
      if (!e) continue;
      return {
        title: e.title ?? null,
        metin: [e.description, e.fullText, e.text].filter(Boolean).join('\n\n'),
        kaynakAdi: e.sourceName ?? null, platform: e.platform ?? null,
        url: e.url ?? null, publishedAt: e.publishedAt ?? null,
      };
    }
  } catch { /* yok */ }
  return null;
}

/** Vakanin kaynak baglantilari. */
async function kaynaklariBul(db, caseId) {
  try {
    const r = await db.prepare(`SELECT source_url,source_name,platform,published_at
      FROM coord_case_sources WHERE coord_case_id=? ORDER BY added_at LIMIT 20`).bind(caseId).all();
    return (r?.results ?? []).filter(x => x && /^https?:\/\//i.test(String(x.source_url || '')));
  } catch { return []; }
}

function tarihTR(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul',
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}

/** Konu satiri ve panel basligi icin kisa, okunur baslik (ilk cumle). */
function kisaBaslik(value, sinir = 140) {
  const t = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const ilk = t.split(/(?<=[.!?…])\s+/u)[0] || t;
  const sec = ilk.length >= 25 ? ilk : t;
  return sec.length > sinir ? sec.slice(0, sinir - 1).trimEnd() + '…' : sec;
}

/**
 * Kaynak kaziyicilar ayni cumleyi/paragrafi tekrar edebiliyor.
 * Haberin anlamini bozmadan birebir tekrar eden uzun cumleleri atar.
 */
function tekrarlariAt(metin) {
  const t = String(metin ?? '');
  if (!t) return '';
  const parcalar = t.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const gorulenParagraf = new Set();
  const gorulenCumle = new Set();   // tum metin boyunca (paragraflar arasi da)
  const cikti = [];
  for (const p of parcalar) {
    const np = p.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
    if (np.length >= 40 && gorulenParagraf.has(np)) continue;
    if (np.length >= 40) gorulenParagraf.add(np);
    const cumleler = p.split(/(?<=[.!?…])\s+/u);
    const temiz = [];
    for (const c of cumleler) {
      const nc = c.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
      if (nc.length >= 30) {
        if (gorulenCumle.has(nc)) continue;
        gorulenCumle.add(nc);
      }
      temiz.push(c);
    }
    const birlesik = temiz.join(' ').trim();
    if (birlesik) cikti.push(birlesik);
  }
  return cikti.join('\n\n');
}

/**
 * Event-only dispatcher. The host must supply encrypted-recipient decryption,
 * verified-address checks, an allow-listed HTTPS portal URL, and a mail adapte
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
      const tamBaslik = String(stillEligible.case_title || '').trim();
      const caseTitle = kisaBaslik(tamBaslik, 140);
      const caseSummary = String(stillEligible.case_summary || '');
      const caseWhere = String(stillEligible.case_neighborhood || '').slice(0, 80);
      const kurumAdi = String(stillEligible.institution_name || 'Kurumunuz').slice(0, 160);
      const konuAdi = String(stillEligible.topic_name || stillEligible.topic_code || '').slice(0, 160);
      const konuKodu = String(stillEligible.topic_code || '');
      const caseId = String(stillEligible.coord_case_id || '');
      const olay = await olayMetniBul(db, stillEligible.source_event_id);
      const kaynaklar = await kaynaklariBul(db, caseId);

      // Haberin TAMAMI: olay metni once, yoksa vaka ozeti.
      let hamMetin = metinTemizle(olay?.metin || '') || metinTemizle(caseSummary);
      // Metin baslikla basliyorsa tekrari at (baslik ayri satirda gosterilir).
      if (tamBaslik && hamMetin) {
        const norm = (s) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
        if (norm(hamMetin).startsWith(norm(tamBaslik))) {
          // Baslik kirpildiysa kalan metin kelime ortasindan baslar.
          hamMetin = hamMetin.slice(tamBaslik.length)
            .replace(/^\S*\s+/u, ' ')
            .replace(/^[\s:;,.·|\-–—]+/u, '');
        }
      }
      let govde = piiMaskele(tekrarlariAt(hamMetin));
      if (govde.length > MAIL_METIN_SINIRI) {
        govde = govde.slice(0, MAIL_METIN_SINIRI).replace(/\s+\S*$/u, '') + '\n\n[… haber metni kısaltıldı; tamamı panelde]';
      }

      const kaynakSatirlari = [];
      const gorulen = new Set();
      for (const k of kaynaklar) {
        const url = String(k.source_url);
        if (gorulen.has(url)) continue;
        gorulen.add(url);
        const ad = String(k.source_name || '').trim() || 'Kaynak';
        const plat = String(k.platform || '').trim();
        const tar = tarihTR(k.published_at);
        kaynakSatirlari.push(`- ${ad}${plat ? ` (${plat})` : ''}${tar ? ` · ${tar}` : ''}\n  ${url}`);
      }
      if (olay?.url && !gorulen.has(String(olay.url))) {
        const ad = String(olay.kaynakAdi || 'Kaynak').trim();
        kaynakSatirlari.push(`- ${ad}${olay.platform ? ` (${olay.platform})` : ''}\n  ${olay.url}`);
      }

      const panelAdresi = `${parsedPortal.origin}${parsedPortal.pathname}`;
      const satirlar = [
        `Sayın ${kurumAdi} yetkilisi,`,
        '',
        'Kurumunuzun görev alanına giren yeni bir kayıt kurum paneline eklendi.',
        '',
        '— GÖREV ALANI —',
        konuAdi ? `Konu: ${konuAdi}` : null,
        caseWhere ? `Konum: ${caseWhere}, Ümraniye` : 'Konum: Ümraniye',
        tarihTR(stillEligible.case_created_at) ? `Kayıt zamanı: ${tarihTR(stillEligible.case_created_at)}` : null,
        '',
        '— HABER —',
        caseTitle ? `Başlık: ${piiMaskele(caseTitle)}` : null,
        '',
        govde || null,
        '',
        '— KAYNAK —',
        kaynakSatirlari.length ? kaynakSatirlari.join('\n') : 'Kaynak bağlantısı panelde görüntülenebilir.',
        '',
        `Panelde görüntüle: ${panelAdresi}`,
        '',
        'Bu bildirim, kurumunuzun görev alanına giren kayıtlar için otomatik gönderilmiştir.',
      ].filter(x => x !== null);

      await sendWithIdempotency({
        to: address,
        idempotencyKey: idem,
        subject: (caseTitle ? `Ümraniye OSINT: ${kisaBaslik(caseTitle, 80)}` : 'Ümraniye OSINT kurum panelinde yeni kayıt').slice(0, 200),
        text: satirlar.join('\n'),
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
