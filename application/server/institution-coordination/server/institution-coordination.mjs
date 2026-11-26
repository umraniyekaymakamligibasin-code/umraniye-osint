import { randomUUID } from 'node:crypto';
import {publicEventProjection,loadAuthorizedSourceData} from './authorized-event.mjs';

/**
 * Tenant-isolated institutional case API.
 * Host application must provide real session authentication, central-admin
 * authorization and CSRF verification. Missing adapters fail closed.
 */
const PREFIX = '/api/institution';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff', 'vary': 'cookie' };
const ROLE_WRITES = new Set(['institution_admin', 'case_worker']);
const STATUS = new Set(['new', 'received', 'assessing', 'actioning', 'resolved', 'dismissed']);
const STATUS_TRANSITIONS = {
  new: new Set(['received', 'assessing', 'dismissed']),
  received: new Set(['assessing', 'actioning', 'dismissed']),
  assessing: new Set(['actioning', 'resolved', 'dismissed']),
  actioning: new Set(['assessing', 'resolved', 'dismissed']),
  resolved: new Set(['assessing']),
  dismissed: new Set(['assessing'])
};
// Store/vault validation errors are expected input problems, not server faults.
// Without this map every one of them became a generic 500 'request_failed'.
const CLIENT_ERRORS = new Map([
  ['valid_email_required', 400], ['invalid_active_required', 400], ['recipient_confirmation_required', 400], ['password_16_to_128_required', 400],
  ['institution_not_found', 404], ['account_not_found', 404], ['recipient_not_found', 404], ['password_changed_outside_vault', 409]
]);
const id = () => randomUUID();
const now = () => new Date().toISOString();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

function requireAdapters(adapters) {
  for (const key of ['authenticate', 'isCentralAdmin', 'verifyCsrf', 'rateLimit']) {
    if (typeof adapters?.[key] !== 'function') throw new Error(`Missing required security adapter: ${key}`);
  }
  if (!adapters.db?.prepare) throw new Error('Missing prepared-statement database adapter');
}

async function first(db, sql, ...values) { return db.prepare(sql).bind(...values).first(); }
async function all(db, sql, ...values) {
  const r = await db.prepare(sql).bind(...values).all();
  return r?.results ?? r ?? [];
}
async function run(db, sql, ...values) { return db.prepare(sql).bind(...values).run(); }
function accountId(actor) {
  const value = actor?.accountId;
  if (typeof value !== 'string' || !value || value.length > 180) throw new Error('Unauthenticated');
  return value;
}
async function parseBody(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 12_000) throw new Error('Request too large');
  if (!request.body) throw new Error('Invalid JSON body');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 12_000) { await reader.cancel(); throw new Error('Request too large'); }
    chunks.push(value);
  }
  let body;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error('Invalid JSON body'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid JSON body');
  return body;
}
function text(v, max = 240) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function safeSource(row) {
  let sourceUrl = null;
  try {
    const u = new URL(row.source_url);
    if (u.protocol === 'https:' && !u.username && !u.password) {
      for(const key of [...u.searchParams.keys()])if(!['id','p','story_fbid','fbid','post','post_id','v'].includes(key))u.searchParams.delete(key);
      u.hash = '';
      sourceUrl = u.toString().slice(0, 1000);
    }
  } catch { /* invalid source URL omitted */ }
  return {
    source_url: sourceUrl,
    source_name: text(row.source_name, 120) || 'Kaynak belirtilmedi',
    platform: text(row.platform, 32) || 'web',
    published_at: typeof row.published_at === 'string' && Number.isFinite(Date.parse(row.published_at)) ? row.published_at : null
  };
}
function encodeCursor(row) {
  const value = JSON.stringify({ v: 2, t: row.sort_at, id: row.id });
  return Buffer.from(value, 'utf8').toString('base64url');
}
function decodeCursor(value) {
  if (!value) return null;
  if (value.length > 240) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || parsed.v !== 2 || typeof parsed.t !== 'number' || !Number.isFinite(parsed.t) || typeof parsed.id !== 'string' || !parsed.id || parsed.id.length > 120) return undefined;
    return { t: parsed.t, id: parsed.id };
  } catch { return undefined; }
}

async function resolveMembership(db, actorId, requestedCode) {
  const memberships = await all(db, `SELECT m.institution_id, m.role, i.code, i.display_name
    FROM coord_memberships m JOIN coord_institutions i ON i.id=m.institution_id
    WHERE m.account_id=? AND m.active=1 AND i.enabled=1 AND i.approval_status='approved'
    ORDER BY i.display_name`, actorId);
  if (!memberships.length) return null;
  if (requestedCode) return memberships.find(m => m.code === requestedCode) ?? null;
  return memberships.length === 1 ? memberships[0] : null;
}

async function audit(db, actorId, institutionId, action, targetType, targetId, requestId, actorKind = 'institution_user') {
  await run(db, `INSERT INTO coord_audit(id,actor_account_id,actor_kind,institution_id,action,target_type,target_id,request_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`, id(), actorId, actorKind, institutionId, action, targetType, targetId ?? null, requestId ?? null, now());
}

const CASE_SORT = `COALESCE(julianday(c.first_published_at),julianday(c.first_seen_at),julianday(c.created_at))`;
const CASE_SELECT = `SELECT ${CASE_SORT} AS sort_at,c.id,c.source_event_id,c.title,c.summary_redacted,c.neighborhood,c.location_precision,
  c.first_published_at,c.first_seen_at,c.confidence,c.status,c.priority,c.sensitivity,c.created_at,c.updated_at,
  t.code AS topic_code,t.display_name AS topic_name
  FROM coord_cases c JOIN coord_topics t ON t.id=c.topic_id
  JOIN coord_institution_topic_grants g ON g.institution_id=c.institution_id AND g.topic_id=c.topic_id AND g.granted=1
  JOIN coord_institutions i ON i.id=c.institution_id AND i.enabled=1 AND i.approval_status='approved'
  WHERE c.institution_id=? AND t.enabled=1 AND t.approval_status='approved'`;

// Only call after CASE_SELECT has applied tenant membership and topic grants.
async function sourcePresentation(db,items,actorKey){
 const ids=[...new Set(items.map(c=>c.source_event_id).filter(Boolean))];if(!ids.length)return items;
 const sources=await loadAuthorizedSourceData(db,ids);
 const readRows=actorKey?await all(db,`SELECT coord_case_id,MAX(created_at) AS read_at FROM coord_case_history WHERE actor_account_id=? AND action='view' AND coord_case_id IN (${items.map(()=>'?').join(',')}) GROUP BY coord_case_id`,actorKey,...items.map(c=>c.id)):[];
 const reads=new Map(readRows.map(r=>[r.coord_case_id,r.read_at]));
 return items.map(value=>{const c={...value,is_read:reads.has(value.id),read_at:reads.get(value.id)||null};let event;try{event=JSON.parse(sources.get(c.source_event_id)||'null')}catch{return c}
  const original=publicEventProjection(c,event);if(!original)return c;
  const topic=c.topic_code==='CIT-POLICE-MINIMIZED-INCIDENT'?'Asayiş':c.topic_code==='CIT-FIRE-MINIMIZED-INCIDENT'?'Yangın ve kurtarma':c.topic_name;
  return{...c,title:original.title||c.title,summary_redacted:original.text?original.text.slice(0,6000)+(original.text.length>6000?'…':''):c.summary_redacted,topic_name:topic};
 });
}

/** Handle only /api/institution/*; return null for unrelated routes. */
export function createInstitutionCoordination(adapters) {
  requireAdapters(adapters);
  const { db } = adapters;

  async function route(request) {
    const url = new URL(request.url);
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return null;
    const requestId = id(); // server-generated; client x-request-id is not trusted for audit
    try {
      const actor = await adapters.authenticate(request);
      const actorKey = accountId(actor);
      if (!(await adapters.rateLimit(actor, request))) return json({ error: 'rate_limited' }, 429);
      const path = url.pathname.slice(PREFIX.length) || '/';

      if (path === '/me' && request.method === 'GET') {
        const memberships = await all(db, `SELECT i.code,i.display_name,m.role
          FROM coord_memberships m JOIN coord_institutions i ON i.id=m.institution_id
          WHERE m.account_id=? AND m.active=1 AND i.enabled=1 AND i.approval_status='approved'
          ORDER BY i.display_name`, actorKey);
        return json({ memberships });
      }

      if (path === '/cases' && request.method === 'GET') {
        const tenant = await resolveMembership(db, actorKey, text(url.searchParams.get('institution'), 80));
        if (!tenant) return json({ error: 'institution_access_not_found' }, 404);
        const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('limit') || '25', 10) || 25));
        const cursor = decodeCursor(text(url.searchParams.get('before'), 240));
        if (cursor === undefined) return json({ error: 'invalid_cursor' }, 400);
        const status = text(url.searchParams.get('status'), 32);
        const q = text(url.searchParams.get('q'), 100);
        const clauses = [CASE_SELECT];
        const params = [tenant.institution_id];
        if (cursor) { clauses.push(`AND (${CASE_SORT} < ? OR (${CASE_SORT} = ? AND c.id < ?))`); params.push(cursor.t, cursor.t, cursor.id); }
        if (STATUS.has(status)) { clauses.push('AND c.status = ?'); params.push(status); }
        else { clauses.push("AND c.status <> 'dismissed'"); }
        if (q) {
          const escaped = q.replace(/[!%_]/g, '!$&');
          clauses.push("AND (c.title LIKE ? ESCAPE '!' OR c.summary_redacted LIKE ? ESCAPE '!' OR EXISTS(SELECT 1 FROM lab_items l WHERE l.id=c.source_event_id AND json_extract(CASE WHEN json_valid(l.data) THEN l.data ELSE '{}' END,'$.title') LIKE ? ESCAPE '!'))");
          params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
        }
        clauses.push(`ORDER BY ${CASE_SORT} DESC,c.id DESC LIMIT ?`); params.push(limit + 1);
        const rows = await all(db, clauses.join('\n'), ...params);
        const hasMore = rows.length > limit;
        const page = await sourcePresentation(db,rows.slice(0, limit),actorKey);
        await audit(db, actorKey, tenant.institution_id, 'list', 'case', null, requestId);
        return json({ institution: tenant.code, cases: page, nextBefore: hasMore && page.length ? encodeCursor(page.at(-1)) : null });
      }

      const eventMatch=path.match(/^\/cases\/([A-Za-z0-9_-]{1,120})\/event$/);
      if(eventMatch&&request.method==='GET'){
        const tenant=await resolveMembership(db,actorKey,text(url.searchParams.get('institution'),80));
        if(!tenant)return json({error:'case_not_found'},404);
        const allowed=await first(db,`${CASE_SELECT} AND c.id=? LIMIT 1`,tenant.institution_id,eventMatch[1]);
        if(!allowed)return json({error:'case_not_found'},404);
        const c=await first(db,'SELECT c.source_event_id,c.sensitivity,c.title,t.code FROM coord_cases c JOIN coord_topics t ON t.id=c.topic_id WHERE c.id=? AND c.institution_id=?',eventMatch[1],tenant.institution_id);
        const sourceData=(await loadAuthorizedSourceData(db,[c.source_event_id])).get(c.source_event_id);
        if(!sourceData)return json({available:false,reason:'source_no_longer_available'});
        let event;try{event=JSON.parse(sourceData);}catch{return json({available:false,reason:'source_unavailable'});}
        const projection=publicEventProjection(c,event);
        await audit(db,actorKey,tenant.institution_id,'source_view','case',eventMatch[1],requestId);
        return json(projection||{available:false,reason:'limited_disclosure'});
      }
      const detailMatch = path.match(/^\/cases\/([A-Za-z0-9_-]{1,120})$/);
      if (detailMatch && request.method === 'GET') {
        const tenant = await resolveMembership(db, actorKey, text(url.searchParams.get('institution'), 80));
        if (!tenant) return json({ error: 'case_not_found' }, 404);
        const item = await first(db, `${CASE_SELECT} AND c.id=? LIMIT 1`, tenant.institution_id, detailMatch[1]);
        if (!item) return json({ error: 'case_not_found' }, 404);
        const sourceRows = await all(db, `SELECT source_url,source_name,platform,published_at FROM coord_case_sources
          WHERE coord_case_id=? ORDER BY published_at DESC LIMIT 20`, item.id);
        const sources = sourceRows.map(safeSource);
        await run(db, `INSERT INTO coord_case_history(id,coord_case_id,institution_id,actor_account_id,action,from_value,to_value,created_at)
          VALUES(?,?,?,?,'view',NULL,NULL,?)`, id(), item.id, tenant.institution_id, actorKey, now());
        await audit(db, actorKey, tenant.institution_id, 'view', 'case', item.id, requestId);
        const history=await all(db,`SELECT action,from_value,to_value,note_redacted,created_at FROM coord_case_history
          WHERE coord_case_id=? AND institution_id=? AND action!='view' ORDER BY created_at DESC,id DESC LIMIT 100`,item.id,tenant.institution_id);
        const referrals=await all(db,`SELECT r.mode,i.display_name target,r.created_at FROM coord_referrals r JOIN coord_institutions i ON i.id=r.target_institution_id WHERE r.source_case_id=? AND r.source_institution_id=? ORDER BY r.created_at DESC`,item.id,tenant.institution_id);
        const [presented]=await sourcePresentation(db,[item],actorKey);
        return json({ case: {...presented,role:tenant.role}, sources, history, referrals });
      }


      const referralMatch=path.match(/^\/cases\/([A-Za-z0-9_-]{1,120})\/(referral-targets|refer)$/);
      if(referralMatch){
        const body=request.method==='POST'?await parseBody(request):{};
        const tenant=await resolveMembership(db,actorKey,text(body.institution||url.searchParams.get('institution'),80));
        if(!tenant||!ROLE_WRITES.has(tenant.role))return json({error:'case_not_found'},404);
        const source=await first(db,`${CASE_SELECT} AND c.id=? LIMIT 1`,tenant.institution_id,referralMatch[1]);
        if(!source)return json({error:'case_not_found'},404);
        const targets=await all(db,`SELECT i.id,i.code,i.display_name,t.id topic_id,t.code topic,t.display_name topic_name
          FROM coord_institutions i JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.granted=1
          JOIN coord_topics t ON t.id=g.topic_id AND t.enabled=1 AND t.approval_status='approved'
          WHERE i.id!=? AND i.enabled=1 AND i.approval_status='approved' AND t.sensitivity=? ORDER BY i.display_name,t.display_name`,tenant.institution_id,source.sensitivity||'ordinary');
        if(referralMatch[2]==='referral-targets'&&request.method==='GET')return json({targets:targets.map(({id,topic_id,...r})=>r)});
        if(referralMatch[2]!=='refer'||request.method!=='POST')return json({error:'method_not_allowed'},405);
        if(!await adapters.verifyCsrf(request,actor))return json({error:'csrf_failed'},403);
        const target=targets.find(t=>t.code===body.targetInstitution&&t.topic===body.topic);
        if(!target||!['transfer','support'].includes(body.mode))return json({error:'target_scope_not_available'},409);
        const full=await first(db,'SELECT * FROM coord_cases WHERE id=? AND institution_id=?',source.id,tenant.institution_id);
        const known=await first(db,'SELECT id FROM coord_cases WHERE source_event_id=? AND institution_id=? AND topic_id=? ORDER BY created_at LIMIT 1',full.source_event_id,target.id,target.topic_id);
        const targetId=known?.id||id(),at=now(),referralId=id();
        const statements=[];
        if(!known)statements.push(db.prepare(`INSERT INTO coord_cases(id,institution_id,topic_id,source_event_id,source_revision,idempotency_key,title,summary_redacted,neighborhood,location_precision,first_published_at,first_seen_at,confidence,status,priority,sensitivity,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?)`).bind(targetId,target.id,target.topic_id,full.source_event_id,full.source_revision,JSON.stringify([target.id,full.source_event_id,target.topic_id]),full.title,full.summary_redacted,full.neighborhood,full.location_precision,full.first_published_at,full.first_seen_at,full.confidence,full.priority,full.sensitivity,at,at));
        statements.push(db.prepare(`INSERT INTO coord_referrals VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_case_id,target_institution_id) DO NOTHING`).bind(referralId,source.id,targetId,tenant.institution_id,target.id,actorKey,body.mode,at));
        if(!known)statements.push(db.prepare(`INSERT INTO coord_case_sources(id,coord_case_id,source_url,source_name,platform,published_at,added_at)
          SELECT ?||id,?,source_url,source_name,platform,published_at,? FROM coord_case_sources WHERE coord_case_id=?`).bind(referralId,targetId,at,source.id));
        statements.push(db.prepare(`INSERT INTO coord_case_history(id,coord_case_id,institution_id,actor_account_id,action,to_value,created_at)
          SELECT ?,?,?,?,'assignment_updated',?,? WHERE EXISTS(SELECT 1 FROM coord_referrals WHERE id=?)`).bind(id(),source.id,tenant.institution_id,actorKey,(body.mode==='transfer'?'Görev devri: ':'Destek kurumu: ')+target.display_name,at,referralId));
        await db.batch(statements);
        await audit(db,actorKey,tenant.institution_id,'case_referred','case',source.id,requestId);
        return json({ok:true,alreadyAssigned:!!known});
      }
      const noteMatch=path.match(/^\/cases\/([A-Za-z0-9_-]{1,120})\/notes$/);
      if(noteMatch&&request.method==='POST'){
        if(!await adapters.verifyCsrf(request,actor))return json({error:'csrf_failed'},403);
        const body=await parseBody(request),tenant=await resolveMembership(db,actorKey,text(body.institution,80));
        if(!tenant||!ROLE_WRITES.has(tenant.role))return json({error:'case_not_found'},404);
        const item=await first(db,`${CASE_SELECT} AND c.id=? LIMIT 1`,tenant.institution_id,noteMatch[1]);
        if(!item)return json({error:'case_not_found'},404);
        if(typeof body.note!=='string'||!body.note.trim()||body.note.length>2000)return json({error:'note_1_to_2000_required'},400);
        await run(db,`INSERT INTO coord_case_history(id,coord_case_id,institution_id,actor_account_id,action,note_redacted,created_at)
          VALUES(?,?,?,?,'note_added',?,?)`,id(),item.id,tenant.institution_id,actorKey,body.note.trim(),now());
        await audit(db,actorKey,tenant.institution_id,'note_added','case',item.id,requestId);
        return json({ok:true});
      }

      const statusMatch = path.match(/^\/cases\/([A-Za-z0-9_-]{1,120})\/status$/);
      if (statusMatch && request.method === 'POST') {
        if (!(await adapters.verifyCsrf(request, actor))) return json({ error: 'csrf_failed' }, 403);
        const body = await parseBody(request);
        const tenant = await resolveMembership(db, actorKey, text(body.institution, 80));
        if (!tenant || !ROLE_WRITES.has(tenant.role)) return json({ error: 'case_not_found' }, 404);
        const targetStatus = text(body.status, 32);
        if (!STATUS.has(targetStatus)) return json({ error: 'invalid_status' }, 400);
        const existing = await first(db, `SELECT c.id,c.status FROM coord_cases c
          JOIN coord_topics t ON t.id=c.topic_id AND t.enabled=1 AND t.approval_status='approved'
          JOIN coord_institution_topic_grants g ON g.institution_id=c.institution_id AND g.topic_id=c.topic_id AND g.granted=1
          WHERE c.id=? AND c.institution_id=?`, statusMatch[1], tenant.institution_id);
        if (!existing) return json({ error: 'case_not_found' }, 404);
        if (!STATUS_TRANSITIONS[existing.status]?.has(targetStatus)) return json({ error: 'invalid_status_transition' }, 409);
        if (typeof db.batch !== 'function') return json({ error: 'transaction_unavailable' }, 503);
        const changeId = id();
        const at = now();
        const changes = await db.batch([
          db.prepare(`INSERT INTO coord_case_history(id,coord_case_id,institution_id,actor_account_id,action,from_value,to_value,created_at)
            SELECT ?,id,institution_id,?,'status_change',status,?,? FROM coord_cases
            WHERE id=? AND institution_id=? AND status=?`)
            .bind(changeId,actorKey,targetStatus,at,existing.id,tenant.institution_id,existing.status),
          db.prepare(`UPDATE coord_cases SET status=?,updated_at=? WHERE id=? AND institution_id=? AND status=?
            AND EXISTS(SELECT 1 FROM coord_case_history WHERE id=?)`)
            .bind(targetStatus,at,existing.id,tenant.institution_id,existing.status,changeId)
        ]);
        if (Number(changes?.[1]?.meta?.changes ?? changes?.[1]?.changes ?? 0)!==1) return json({ error: 'case_changed_reload' },409);
        await audit(db, actorKey, tenant.institution_id, 'status_change', 'case', existing.id, requestId);
        return json({ ok: true, status: targetStatus });
      }

      if (path.startsWith('/admin/')) {
        if (!(await adapters.isCentralAdmin(actor))) return json({ error: 'not_found' }, 404);
        if (request.method !== 'GET' && !(await adapters.verifyCsrf(request, actor))) return json({ error: 'csrf_failed' }, 403);
        // await: a returned (un-awaited) promise would bypass this try/catch, so admin errors
        // escaped the error mapping below and surfaced as the outer server's generic 500.
        return await adminRoute(path, request, actorKey, requestId);
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      const message = String(error?.message || 'request_failed');
      if (message === 'Unauthenticated') return json({ error: 'authentication_required' }, 401);
      if (message === 'Request too large' || message === 'Invalid JSON body') return json({ error: 'invalid_request' }, 400);
      if (CLIENT_ERRORS.has(message)) return json({ error: message }, CLIENT_ERRORS.get(message));
      if (message.startsWith('username_collision_')) return json({ error: 'username_collision' }, 409);
      // Deliberately do not return/log SQL errors, body contents, tokens or emails.
      adapters.onError?.({ requestId, code: 'institution_api_error' });
      return json({ error: 'request_failed', requestId }, 500);
    }
  }

  async function adminRoute(path, request, actorKey, requestId) {
    if(path==='/admin/referrals' && request.method==='GET')return json({referrals:await all(db,`SELECT r.id,r.source_case_id,r.target_case_id,r.mode,r.created_at,s.display_name source_institution,t.display_name target_institution,c.title FROM coord_referrals r JOIN coord_institutions s ON s.id=r.source_institution_id JOIN coord_institutions t ON t.id=r.target_institution_id JOIN coord_cases c ON c.id=r.source_case_id ORDER BY r.created_at DESC,r.id DESC LIMIT 200`)});
    const recipientsMatch=path.match(/^\/admin\/institutions\/([A-Za-z0-9_-]{1,100})\/recipients(?:\/([A-Za-z0-9_-]{1,120})\/disable)?$/);
    if(recipientsMatch){
      if(typeof adapters.recipients!=='function')return json({error:'recipient_store_unavailable'},503);
      const store=await adapters.recipients();
      if(request.method==='GET'&&!recipientsMatch[2])return json({recipients:await store.list(recipientsMatch[1])});
      if(request.method==='POST')return json(recipientsMatch[2]?await store.deactivate(actorKey,recipientsMatch[1],recipientsMatch[2],requestId):await store.save(actorKey,recipientsMatch[1],await parseBody(request)));
      return json({error:'method_not_allowed'},405);
    }

    if(path.startsWith('/admin/credentials')) {
      if(typeof adapters.credentials!=='function')return json({error:'credential_vault_unavailable'},503);
      const vault=await adapters.credentials();
      if(path==='/admin/credentials'&&request.method==='GET')return json({accounts:await vault.list()});
      if(path==='/admin/credentials/provision'&&request.method==='POST')return json(await vault.provision(actorKey));
      const match=path.match(/^\/admin\/credentials\/([A-Za-z0-9_-]{1,120})\/(reveal|password)$/);
      if(match&&request.method==='POST') {
        if(match[2]==='reveal')return json(await vault.reveal(actorKey,match[1]));
        const body=await parseBody(request);return json(await vault.rotate(actorKey,match[1],body.password));
      }
      return json({error:'not_found'},404);
    }

    if (path === '/admin/cases' && request.method === 'GET') {
      const rows = await all(db, `SELECT c.id,c.title,c.summary_redacted,c.status,c.first_seen_at,i.code institution,t.display_name topic
        FROM coord_cases c JOIN coord_institutions i ON i.id=c.institution_id JOIN coord_topics t ON t.id=c.topic_id
        ORDER BY c.first_seen_at DESC,c.id DESC LIMIT 100`);
      return json({cases:rows});
    }
    const historyMatch=path.match(/^\/admin\/cases\/([A-Za-z0-9_-]{1,120})\/history$/);
    if(historyMatch && request.method==='GET') return json({history:await all(db,
      `SELECT action,actor_account_id,from_value,to_value,created_at FROM coord_case_history WHERE coord_case_id=? ORDER BY created_at DESC,id DESC LIMIT 100`,historyMatch[1])});
    if(path==='/admin/portal-viewers' && request.method==='POST') {
      const body=await parseBody(request),account=text(body.accountId,180);
      if(typeof body.active!=='boolean'||!account)return json({error:'invalid_request'},400);
      if(!await adapters.accountExists?.(account))return json({error:'account_not_found'},404);
      await run(db,`INSERT INTO coord_portal_viewers(account_id,active,approved_by,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(account_id) DO UPDATE SET active=excluded.active,approved_by=excluded.approved_by,updated_at=excluded.updated_at`,account,body.active?1:0,actorKey,now());
      await audit(db,actorKey,null,'portal_access_change','account',account,requestId,'central_admin');
      return json({ok:true});
    }

    if (path === '/admin/catalog' && request.method === 'GET') {
      const institutions = await all(db, `SELECT id,code,display_name,institution_group,mandate_note,official_reference_url,approval_reference,approval_status,enabled,email_enabled
        FROM coord_institutions ORDER BY display_name`);
      const topics = await all(db, `SELECT id,code,display_name,sensitivity,enabled,approval_status,approval_reference FROM coord_topics ORDER BY display_name`);
      const grants = await all(db, `SELECT i.code institution,t.code topic,g.granted,g.approval_reference
        FROM coord_institution_topic_grants g JOIN coord_institutions i ON i.id=g.institution_id JOIN coord_topics t ON t.id=g.topic_id
        ORDER BY i.display_name,t.display_name`);
      const members = await all(db, `SELECT i.code institution,m.account_id,m.role,m.active,m.approved_at
        FROM coord_memberships m JOIN coord_institutions i ON i.id=m.institution_id ORDER BY i.display_name,m.account_id`);
      const recipientCounts = await all(db, `SELECT i.code institution,COUNT(r.id) AS verified_active_recipients
        FROM coord_institutions i LEFT JOIN coord_mail_recipients r ON r.institution_id=i.id AND r.active=1 AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL
        GROUP BY i.id ORDER BY i.display_name`);
      const accounts=await all(db,'SELECT id,username,name,active FROM team_accounts ORDER BY username');
      return json({ institutions, topics, grants, members, recipientCounts, accounts });
    }
    const enableMatch = path.match(/^\/admin\/institutions\/([A-Za-z0-9_-]{1,100})\/approval$/);
    if (enableMatch && request.method === 'POST') {
      const body = await parseBody(request);
      const approved = body.approvalStatus === 'approved' ? 'approved' : body.approvalStatus === 'rejected' ? 'rejected' : 'pending';
      const enabled = body.enabled === true && approved === 'approved' ? 1 : 0;
      const ref = text(body.approvalReference, 180);
      const officialUrl = text(body.officialReferenceUrl, 500);
      let official;
      try { official = new URL(officialUrl); } catch { official = null; }
      const validOfficialUrl = official?.protocol === 'https:' && !official.username && !official.password;
      if (approved === 'approved' && (!ref || !validOfficialUrl)) return json({ error: 'approval_reference_and_https_official_reference_required' }, 400);
      const result = await run(db, `UPDATE coord_institutions SET email_enabled=0,approval_status=?,enabled=?,approval_reference=?,official_reference_url=?,updated_at=? WHERE code=?`, approved, enabled, approved === 'approved' ? ref : null, approved === 'approved' ? officialUrl : null, now(), enableMatch[1]);
      if (!result?.meta?.changes && !result?.changes) return json({ error: 'institution_not_found' }, 404);
      await audit(db, actorKey, null, 'institution_approval_change', 'institution', enableMatch[1], requestId, 'central_admin');
      return json({ ok: true, approvalStatus: approved, enabled: !!enabled });
    }
    const topicApprovalMatch = path.match(/^\/admin\/topics\/([A-Za-z0-9_-]{1,100})\/approval$/);
    if (topicApprovalMatch && request.method === 'POST') {
      const body = await parseBody(request);
      const approved = body.approvalStatus === 'approved' ? 'approved' : body.approvalStatus === 'rejected' ? 'rejected' : 'pending';
      const sensitivity = ['ordinary','restricted','high'].includes(body.sensitivity) ? body.sensitivity : 'high';
      const ref = text(body.approvalReference, 180);
      const enabled = body.enabled === true && approved === 'approved' && !!ref ? 1 : 0;
      if (approved === 'approved' && !ref) return json({ error: 'approval_reference_required' }, 400);
      const result = await run(db, `UPDATE coord_topics SET approval_status=?,approval_reference=?,sensitivity=?,enabled=?,updated_at=? WHERE code=?`, approved, approved === 'approved' ? ref : null, sensitivity, enabled, now(), topicApprovalMatch[1]);
      if (!result?.meta?.changes && !result?.changes) return json({ error: 'topic_not_found' }, 404);
      await audit(db, actorKey, null, 'topic_approval_change', 'topic', topicApprovalMatch[1], requestId, 'central_admin');
      return json({ ok: true, approvalStatus: approved, sensitivity, enabled: !!enabled });
    }
    const grantMatch = path.match(/^\/admin\/institutions\/([A-Za-z0-9_-]{1,100})\/topics\/([A-Za-z0-9_-]{1,100})$/);
    if (grantMatch && request.method === 'POST') {
      const body = await parseBody(request);
      const granted = body.granted === true ? 1 : 0;
      const ref = text(body.approvalReference, 180);
      if (granted && !ref) return json({ error: 'approval_reference_required' }, 400);
      const institution = await first(db, `SELECT id,enabled,approval_status FROM coord_institutions WHERE code=?`, grantMatch[1]);
      const topic = await first(db, `SELECT id,enabled,approval_status,sensitivity FROM coord_topics WHERE code=?`, grantMatch[2]);
      if (!institution || !topic) return json({ error: 'scope_not_available' }, 404);
      if (granted && (institution.enabled!==1 || institution.approval_status!=='approved' || topic.enabled!==1 || topic.approval_status!=='approved')) return json({error:'scope_not_approved'},409);
      await run(db, `INSERT INTO coord_institution_topic_grants(institution_id,topic_id,granted,approval_reference,updated_by,updated_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(institution_id,topic_id) DO UPDATE SET granted=excluded.granted,
        approval_reference=excluded.approval_reference,updated_by=excluded.updated_by,updated_at=excluded.updated_at`, institution.id, topic.id, granted, ref || null, actorKey, now());
      await audit(db, actorKey, institution.id, 'topic_grant_change', 'topic', topic.id, requestId, 'central_admin');
      return json({ ok: true, granted: !!granted });
    }
    const memberMatch = path.match(/^\/admin\/institutions\/([A-Za-z0-9_-]{1,100})\/members$/);
    if (memberMatch && request.method === 'POST') {
      const body = await parseBody(request);
      const account = text(body.accountId, 180);
      const role = text(body.role, 32);
      const active = body.active === true;
      if (!account || !['institution_admin','case_worker','viewer'].includes(role)) return json({ error: 'invalid_membership' }, 400);
      if (typeof adapters.accountExists !== 'function' || !(await adapters.accountExists(account))) return json({ error: 'account_not_found' }, 404);
      if (active && (typeof adapters.isAccountVerified !== 'function' || !(await adapters.isAccountVerified(account)))) return json({ error: 'verified_account_required' }, 409);
      const institution = await first(db, `SELECT id FROM coord_institutions WHERE code=? AND approval_status='approved' AND enabled=1`, memberMatch[1]);
      if (!institution) return json({ error: 'institution_not_found' }, 404);
      const memberId = id();
      await run(db, `INSERT INTO coord_memberships(id,institution_id,account_id,role,active,approved_by,approved_at,created_at,updated_at,approval_reference)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,account_id) DO UPDATE SET role=excluded.role,active=excluded.active,
        approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=excluded.updated_at,approval_reference=excluded.approval_reference`, memberId, institution.id, account, role, active ? 1 : 0,
        active ? actorKey : null, active ? now() : null, now(), now(), 'central-admin:' + actorKey);
      await audit(db, actorKey, institution.id, 'membership_change', 'membership', null, requestId, 'central_admin');
      return json({ ok: true });
    }
    const mailMatch = path.match(/^\/admin\/institutions\/([A-Za-z0-9_-]{1,100})\/email-policy$/);
    if (mailMatch && request.method === 'POST') {
      const body = await parseBody(request);
      if (typeof body.enabled !== 'boolean') return json({ error: 'invalid_email_policy' }, 400);
      const institution = await first(db, `SELECT id,enabled,approval_status FROM coord_institutions WHERE code=?`, mailMatch[1]);
      if (!institution) return json({ error: 'institution_not_found' }, 404);
      const recipientCount = await first(db, `SELECT COUNT(*) AS count FROM coord_mail_recipients
        WHERE institution_id=? AND active=1 AND verified_at IS NOT NULL AND verified_by IS NOT NULL`, institution.id);
      if (body.enabled && (institution.enabled !== 1 || institution.approval_status !== 'approved' || Number(recipientCount?.count ?? 0) < 1)) {
        return json({ error: 'approved_institution_and_verified_recipient_required' }, 409);
      }
      await run(db, `UPDATE coord_institutions SET email_enabled=?,updated_at=? WHERE id=?`, body.enabled ? 1 : 0, now(), institution.id);
      await audit(db, actorKey, institution.id, 'email_policy_change', 'institution', mailMatch[1], requestId, 'central_admin');
      return json({ ok: true, emailEnabled: body.enabled, verifiedActiveRecipients: Number(recipientCount?.count ?? 0) });
    }
    return json({ error: 'not_found' }, 404);
  }
  return { handle: route };
}

