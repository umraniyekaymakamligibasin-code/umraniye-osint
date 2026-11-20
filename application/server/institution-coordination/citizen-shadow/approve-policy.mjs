import{catalog}from'./catalog.mjs';
export function approveOrdinaryPolicy(db,{allowWrites=false,reference}={}){
 if(!allowWrites||typeof reference!=='string'||reference.length<12)throw Error('explicit_owner_policy_approval_required');
 const report={topicsEnabled:0,grantsEnabled:0,sensitiveExcluded:0,unmappedExcluded:0,unapprovedInstitutions:0};
 db.exec('BEGIN IMMEDIATE');
 try{for(const r of catalog){
  if(r.sensitivity!=='ordinary'){report.sensitiveExcluded++;continue;}
  if(!r.panelCandidates.length){report.unmappedExcluded++;continue;}
  const row=db.prepare("SELECT id FROM coord_topics WHERE code=? AND id=? AND sensitivity='ordinary'").get(r.code,'citizen-shadow:'+r.code);
  if(!row)continue;
  const recipients=r.panelCandidates.map(code=>db.prepare("SELECT id FROM coord_institutions WHERE code=? AND enabled=1 AND approval_status='approved' AND length(trim(approval_reference))>0").get(code)).filter(Boolean);
  report.unapprovedInstitutions+=r.panelCandidates.length-recipients.length;
  if(!recipients.length)continue;
  const at=new Date().toISOString();
  report.topicsEnabled+=db.prepare("UPDATE coord_topics SET enabled=1,approval_status='approved',approval_reference=?,updated_at=? WHERE id=?").run(reference,at,row.id).changes;
  for(const i of recipients)report.grantsEnabled+=db.prepare("INSERT INTO coord_institution_topic_grants(institution_id,topic_id,granted,approval_reference,updated_by,updated_at) VALUES(?,?,1,?,'owner-policy',?) ON CONFLICT(institution_id,topic_id) DO UPDATE SET granted=1,approval_reference=excluded.approval_reference,updated_by=excluded.updated_by,updated_at=excluded.updated_at").run(i.id,row.id,reference,at).changes;
 }db.exec('COMMIT');return report;}catch(e){db.exec('ROLLBACK');throw e;}
}
