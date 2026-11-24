import{queueNotices}from'./notice-queue.mjs';
/** Reconcile recipient additions independently of classification/source changes. */
export function reconcileMail(db,{now=Date.now(),limit=100}={}){
 const result={examined:0,queued:0,skipped:0};
 db.exec('BEGIN IMMEDIATE');
 try{
  const rows=db.prepare(`SELECT DISTINCT c.id,c.source_event_id,
    CASE WHEN json_valid(l.data) THEN l.data WHEN json_valid(k.data) THEN k.data ELSE NULL END AS data
   FROM coord_cases c
   JOIN coord_institutions i ON i.id=c.institution_id AND i.enabled=1 AND i.approval_status='approved' AND i.email_enabled=1
   JOIN coord_topics t ON t.id=c.topic_id AND t.enabled=1 AND t.approval_status='approved' AND t.sensitivity<>'restricted'
   JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.topic_id=t.id AND g.granted=1 AND length(trim(g.approval_reference))>0
   LEFT JOIN lab_items l ON l.id=c.source_event_id
   LEFT JOIN coord_source_content k ON k.event_id=c.source_event_id
   WHERE c.status<>'dismissed' AND c.sensitivity<>'restricted'
   AND EXISTS(SELECT 1 FROM coord_mail_recipients r WHERE r.institution_id=i.id AND r.active=1 AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM coord_mail_outbox o WHERE o.coord_case_id=c.id AND o.recipient_id=r.id AND o.recipient_hash=r.address_fingerprint))
   AND (json_valid(l.data) OR json_valid(k.data))
   ORDER BY c.created_at DESC,c.id LIMIT ?`).all(Math.max(1,Math.min(500,limit|0)));
  for(const row of rows){
   const event=JSON.parse(row.data);
   if(event?.id!==row.source_event_id){result.skipped++;continue;}
   result.examined++;
   const queued=queueNotices(db,{caseIds:[row.id],event,now});result.queued+=queued.queued;result.skipped+=queued.skipped;
  }
  db.exec('COMMIT');return result;
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}
