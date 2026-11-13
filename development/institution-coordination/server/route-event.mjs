/** Conservative, deterministic projection from the existing event feed. */
const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/İ/g, 'i').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim();
const unsafe = new Set(['homicide_or_assault','weapon_or_shooting','missing_person','child_or_student_identity',
  'victim_or_witness_identity','medical_or_disability_details','domestic_violence','crime_allegation',
  'police_investigation','social_assistance_case_details','private_address','unverified_location',
  'unclear_or_multiple_authorities']);
import { randomUUID } from 'node:crypto';
const id = () => randomUUID();
const now = () => new Date().toISOString();
const displayTitles = Object.freeze({
  water_leak: 'Su kaçağı bildirimi', water_outage: 'Su kesintisi bildirimi', sewer_overflow: 'Atık su altyapısı bildirimi',
  power_outage: 'Elektrik kesintisi bildirimi', waste_container: 'Atık konteyneri bildirimi',
  street_cleanliness: 'Temizlik hizmeti bildirimi', municipal_roadside_asset: 'Yol ve kaldırım bildirimi',
  parks_public_space: 'Park ve ortak alan bildirimi', school_facility: 'Okul binası bakım bildirimi',
  bus_stop_infrastructure: 'Toplu taşıma durağı bildirimi'
});
const sensitiveText = [
  /\b(?:tc|t\.c\.|kimlik|pasaport)\s*(?:no|numarası|numarasi)?\s*[:#-]?\s*\d{5,}/iu,
  /\b\+?\d[\d ()-]{8,}\d\b/u,
  /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:daire|kapı|kapi|bina)\s*(?:no|numarası|numarasi)?\s*[:#-]?\s*\d+/iu,
  /\b(?:plaka|araç plakası|arac plakasi)\s*[:#-]?\s*[0-9]{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4}\b/iu
];

function hasUnsafeContext(event) {
  const flags = event?.sensitivityFlags ?? {};
  if (Object.values(flags).some(Boolean)) return true;
  const category = String(event?.riskCategory ?? '');
  return unsafe.has(category) || ['restricted','high','special'].includes(String(event?.sensitivity ?? '').toLowerCase());
}
function hasSensitiveText(event) {
  const text = [event?.title, event?.summary, event?.description].filter(Boolean).join(' ');
  return sensitiveText.some(pattern => pattern.test(text));
}

/** Return candidates only; never trusts source-name or street-name as location proof. */
export function classifyForInstitution(event, rules) {
  if (!event || !rules || rules.state !== 'approved') return { decision: 'held', reason: 'rules_not_approved' };
  if (hasUnsafeContext(event)) return { decision: 'held', reason: 'sensitive_or_restricted' };
  if (hasSensitiveText(event)) return { decision: 'held', reason: 'possible_personal_data' };
  const place = event.locality;
  if (place?.district !== 'Ümraniye' || place?.verified !== true || !['district','neighborhood'].includes(place?.precision)) {
    return { decision: 'held', reason: 'verified_umraniye_locality_required' };
  }
  const text = normalize([event.title, event.summary, event.description].filter(Boolean).join(' '));
  const candidates = [];
  for (const rule of rules.rules ?? []) {
    if (rule.approvalStatus !== 'approved' || !rule.approvalReference || rule.sensitivity !== 'ordinary') continue;
    const terms = (rule.terms ?? []).map(normalize).filter(Boolean);
    const hits = terms.filter(term => ` ${text} `.includes(` ${term} `));
    if (hits.length) candidates.push({ topic: rule.topic, institution: rule.institution, hits: hits.length, sensitivity: rule.sensitivity });
  }
  // Multiple plausible routes stay internal; never fan out on ambiguity.
  if (candidates.length !== 1) return { decision: 'held', reason: candidates.length ? 'ambiguous_authority' : 'no_narrow_topic_match' };
  const candidate = candidates[0];
  if (candidate.sensitivity !== 'ordinary') return { decision: 'held', reason: 'topic_requires_manual_policy', candidate };
  if (!displayTitles[candidate.topic]) return { decision: 'held', reason: 'topic_has_no_safe_projection_title', candidate };
  const confidence = Math.min(0.97, 0.86 + candidate.hits * 0.04 + (place.precision === 'neighborhood' ? 0.04 : 0));
  if (confidence < Number(rules.minimumConfidence ?? 1)) return { decision: 'held', reason: 'confidence_below_threshold', candidate, confidence };
  return { decision: 'candidate', ...candidate, confidence, locality: { district: 'Ümraniye', neighborhood: place.neighborhood || null, precision: place.precision } };
}

function validDateOrNull(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
function safeProjection(event, decision) {
  // Do not copy free-form text: names and contextual details are hard to detect
  // reliably. The tenant receives a category-level summary and locality only.
  const title = displayTitles[decision.topic];
  const publishedAt = validDateOrNull(event.publishedAt);
  const seenAt = validDateOrNull(event.firstSeenAt || now());
  if (publishedAt === undefined || seenAt === undefined) return null;
  return { title, summary: `${decision.locality.neighborhood ? `${decision.locality.neighborhood} Mahallesi, ` : ''}Ümraniye'de ${title.toLocaleLowerCase('tr-TR')} kaydı oluşturuldu.`,
    neighborhood: decision.locality.neighborhood, firstPublishedAt: publishedAt, firstSeenAt: seenAt,
    locationPrecision: decision.locality.precision, confidence: decision.confidence };
}

/**
 * Insert one tenant projection only after institution/topic/rule approval and
 * explicit grant. A single DB batch gates outbox rows on the newly-generated
 * case id, so reprocessing an existing event cannot send a second notice.
 */
export async function projectEligibleEvent({ db, event, rules }) {
  if (!db?.prepare || typeof db.batch !== 'function') throw new Error('Prepared statement and atomic batch adapters required');
  const decision = classifyForInstitution(event, rules);
  if (decision.decision !== 'candidate') return decision;
  const approved = await db.prepare(`SELECT i.id institution_id,t.id topic_id
    FROM coord_institutions i JOIN coord_topics t ON t.code=? AND t.enabled=1 AND t.approval_status='approved' AND t.sensitivity='ordinary'
    JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.topic_id=t.id AND g.granted=1
    WHERE i.code=? AND i.enabled=1 AND i.approval_status='approved'`).bind(decision.topic, decision.institution).first();
  if (!approved) return { decision: 'held', reason: 'institution_topic_not_approved' };
  const projection = safeProjection(event, decision);
  if (!projection || typeof event.id !== 'string' || !event.id) return { decision: 'held', reason: 'insufficient_safe_projection' };
  const caseId = id();
  const createdAt = now();
  const insertCase = db.prepare(`INSERT INTO coord_cases(id,institution_id,topic_id,source_event_id,source_revision,idempotency_key,title,summary_redacted,neighborhood,
    location_precision,first_published_at,first_seen_at,confidence,status,priority,sensitivity,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'new','normal','ordinary',?,?)
    ON CONFLICT(institution_id,source_event_id,topic_id) DO NOTHING`)
    .bind(caseId, approved.institution_id, approved.topic_id, event.id, String(event.revision ?? ''), JSON.stringify([approved.institution_id,event.id,approved.topic_id]), projection.title, projection.summary,
      projection.neighborhood, projection.locationPrecision, projection.firstPublishedAt, projection.firstSeenAt, projection.confidence, createdAt, createdAt);
  const auditInsert = db.prepare(`INSERT INTO coord_audit(id,actor_account_id,actor_kind,institution_id,action,target_type,target_id,request_id,created_at)
    SELECT ?,NULL,'system',?,'event_projection','case',id,NULL,? FROM coord_cases WHERE id=?`)
    .bind(id(), approved.institution_id, createdAt, caseId);
  const outboxInsert = db.prepare(`INSERT INTO coord_mail_outbox(id,coord_case_id,institution_id,recipient_id,recipient_hash,template_code,dedupe_key,state,attempts,next_attempt_at,created_at,provider_idempotency_key)
    SELECT ? || ':' || r.id,c.id,c.institution_id,r.id,r.address_fingerprint,'initial-assignment',c.id || ':' || r.id,'queued',0,?,?,c.id || ':' || r.id
    FROM coord_cases c
    JOIN coord_institutions i ON i.id=c.institution_id AND i.enabled=1 AND i.approval_status='approved' AND i.email_enabled=1
    JOIN coord_mail_recipients r ON r.institution_id=i.id AND r.active=1 AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL
    WHERE c.id=? AND ?=1
    ON CONFLICT(dedupe_key) DO NOTHING`)
    .bind(id(), createdAt, createdAt, caseId, event.historical !== true && projection.firstPublishedAt && Date.parse(projection.firstPublishedAt)>=Date.now()-3600000 && Date.parse(projection.firstPublishedAt)<=Date.now()+300000 ? 1 : 0);
  const results = await db.batch([insertCase, auditInsert, outboxInsert]);
  const inserted = results?.[0]?.results?.[0]?.id === caseId || results?.[0]?.meta?.changes > 0 || results?.[0]?.changes > 0;
  if (!inserted) return { decision: 'held', reason: 'duplicate_or_projection_not_inserted' };
  const emailQueued = Number(results?.[2]?.meta?.changes ?? results?.[2]?.changes ?? 0) > 0;
  return { decision: 'projected', institution: decision.institution, topic: decision.topic, confidence: decision.confidence,
    caseId, emailQueued };
}


/** Multiple duties can coexist; competing owners of the same duty are not fan-out. */
export function classifyForInstitutions(event,rules){
  if(!event||rules?.state!=='approved')return {decision:'held',reason:'rules_not_approved',routes:[]};
  const matches=[];
  for(const rule of rules.rules??[]){
    const result=classifyForInstitution(event,{...rules,rules:[rule]});
    if(result.decision==='candidate')matches.push({...result,role:rule.role==='lead'?'lead':'support',coRouteGroup:rule.coRouteGroup||null,rule});
  }
  const distinct=[...new Map(matches.map(m=>[m.institution+'|'+m.topic,m])).values()];
  const routes=[],conflicts=[];
  for(const topic of new Set(distinct.map(m=>m.topic))){
    const owners=distinct.filter(m=>m.topic===topic);
    const explicitJoint=owners.length>1&&owners[0].coRouteGroup&&owners.every(m=>m.coRouteGroup===owners[0].coRouteGroup);
    if(new Set(owners.map(m=>m.institution)).size>1&&!explicitJoint){conflicts.push({topic,reason:'competing_authority'});continue;}
    routes.push(...owners);
  }
  return {decision:routes.length?'candidates':'held',reason:routes.length?'independent_duties':conflicts.length?'competing_authority':'no_eligible_route',routes,conflicts};
}

/** Each approved tenant gets its own minimized case; no other tenant's history is exposed. */
export async function projectMultiInstitutionEvent({db,event,rules}){
  const plan=classifyForInstitutions(event,rules);
  if(plan.decision!=='candidates')return plan;
  const results=[];
  for(const route of plan.routes){
    const result=await projectEligibleEvent({db,event,rules:{...rules,rules:[route.rule]}});
    results.push({...result,institution:route.institution,topic:route.topic,role:route.role});
  }
  return {decision:results.some(r=>r.decision==='projected')?'projected':'no_new_projection',routes:results,conflicts:plan.conflicts};
}
