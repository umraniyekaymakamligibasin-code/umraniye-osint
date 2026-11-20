import {analyze} from './engine.mjs';
// Read-only snapshots only. No live D1/SQLite adapter or dispatch callback.
export function approvalSnapshot({institutions=[],topics=[],grants=[]}={}){
 const approvedInstitutions=institutions.filter(i=>i.enabled===1&&i.approval_status==='approved'&&i.approval_reference).map(i=>i.code);
 const approvedTopics=topics.filter(t=>t.enabled===1&&t.approval_status==='approved'&&t.approval_reference).map(t=>t.code);
 const institutionById=new Map(institutions.map(i=>[i.id,i.code]));
 const topicById=new Map(topics.map(t=>[t.id,t.code]));
 return {approvedInstitutions,approvedTopics,grants:grants.filter(g=>g.granted===1&&g.approval_reference).map(g=>({institution:institutionById.get(g.institution_id),topic:topicById.get(g.topic_id),granted:true,approvalReference:g.approval_reference}))};
}
export function shadowBatch(events,snapshot,{seenKeys=[],neighborhoodNames=[]}={}){
 if(!Array.isArray(events)||events.length>100)throw Error('Maximum 100 events per shadow batch');
 const approvals=approvalSnapshot(snapshot),seen=new Set(seenKeys),results=[];
 for(const event of events){const result=analyze(event,{...approvals,seenKeys:[...seen],neighborhoodNames});for(const task of result.tasks)seen.add(task.key);results.push(result);}
 return {mode:'shadow',results,writeCount:0,messagesSent:0,ledger:[...seen]};
}
