import { randomUUID } from 'node:crypto';

/** Idempotent additive seeder. It never updates existing approvals or grants. */
export async function seedCatalog(db, catalog) {
  if (!db?.prepare || typeof db.batch !== 'function') throw new Error('prepared_database_and_atomic_batch_required');
  if (!catalog || !Array.isArray(catalog.institutions) || !Array.isArray(catalog.topics)) throw new Error('invalid_candidate_catalog');
  const stamp = new Date().toISOString();
  const statements = [];
  for (const item of catalog.institutions) {
    if (!/^[A-Z0-9_]{2,80}$/.test(item.code) || !['district_admin','public_agency','municipality','utility','regional_agency','local_partner'].includes(item.group)) throw new Error('invalid_candidate_institution');
    statements.push(db.prepare(`INSERT INTO coord_institutions(id,code,display_name,institution_group,mandate_note,official_reference_url,approval_reference,approval_status,enabled,email_enabled,created_at,updated_at)
      VALUES(?,?,?,?,?,NULL,NULL,'draft',0,0,?,?) ON CONFLICT(code) DO NOTHING`)
      .bind(randomUUID(), item.code, item.name, item.group, 'Aday kayıt; kurumun görev alanı ve veri paylaşım yetkisi resmî kaynakla doğrulanmalıdır.', stamp, stamp));
  }
  for (const item of catalog.topics) {
    if (!/^[a-z0-9_]{2,100}$/.test(item.code) || !['ordinary','restricted','high'].includes(item.sensitivity)) throw new Error('invalid_candidate_topic');
    statements.push(db.prepare(`INSERT INTO coord_topics(id,code,display_name,sensitivity,approval_status,approval_reference,enabled,created_at,updated_at)
      VALUES(?,?,?,?,'draft',NULL,0,?,?) ON CONFLICT(code) DO NOTHING`)
      .bind(randomUUID(), item.code, item.name, item.sensitivity, stamp, stamp));
  }
  const results = await db.batch(statements);
  return { candidatesSubmitted: statements.length, statementsCompleted: results?.length ?? 0, enabledBySeeder: 0, approvalsChanged: 0, grantsCreated: 0 };
}
