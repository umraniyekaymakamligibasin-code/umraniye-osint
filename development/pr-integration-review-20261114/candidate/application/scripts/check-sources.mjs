// Configuration validation only. This command never crawls external sources.
import {readFile} from 'node:fs/promises';
const file=process.env.OSINT_SOURCE_FILE;if(!file)throw Error('Set OSINT_SOURCE_FILE to a source-list JSON file; no live scan is performed.');
const data=JSON.parse(await readFile(file,'utf8'));const rows=Array.isArray(data)?data:data.accounts||data.sources;
if(!Array.isArray(rows))throw Error('Expected accounts or sources array');
const ids=new Set();for(const row of rows){const id=row.handle||row.source_id||row.id;if(typeof id!=='string'||!id.trim()||ids.has(id))throw Error('Missing or duplicate source identity');ids.add(id);if(row.enabled!==undefined&&!['boolean','number'].includes(typeof row.enabled))throw Error('Invalid enabled preference');}
console.log(JSON.stringify({result:'source_configuration_valid',sources:rows.length,networkRequests:0}));
