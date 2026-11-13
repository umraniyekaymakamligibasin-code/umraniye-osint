export const transferTables=['workspace_settings','team_accounts','members','snapshots','case_records','case_history','alert_log','alert_reads','briefings','personal_records','personal_activity','audit'];
export async function importTransfer(DB,data){
 if(data?.format!=='umraniye-osint-transfer-v1'||!data.tables||Object.keys(data.tables).sort().join()!==[...transferTables].sort().join())throw Error('Geçersiz aktarım dosyası.');
 const statements=[];let count=0;
 for(const table of transferTables){
  if((await DB.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n)throw Error('Aktarım yalnız boş veritabanına yapılır.');
  const columns=new Set((await DB.prepare('PRAGMA table_info('+table+')').all()).results.map(c=>c.name));
  const rows=data.tables[table];if(!Array.isArray(rows))throw Error('Geçersiz tablo.');
  for(const row of rows){const keys=Object.keys(row);if(!keys.length||keys.some(k=>!columns.has(k))||Object.values(row).some(v=>v!==null&&!['number','string'].includes(typeof v)))throw Error('Geçersiz veri sütunu.');if(++count>100000)throw Error('Aktarım sınırı aşıldı.');statements.push(DB.prepare('INSERT INTO '+table+'('+keys.map(k=>'"'+k+'"').join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])))}
 }
 if(statements.length)await DB.batch(statements);return count;
}
