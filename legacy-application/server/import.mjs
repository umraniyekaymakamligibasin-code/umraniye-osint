import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openDatabase} from './database.mjs';
import {importTransfer} from './transfer.mjs';
if(!process.argv[2])throw Error('Kullanım: node server/import.mjs /guvenli/aktarim.json');
if((await stat(process.argv[2])).size>100*1024*1024)throw Error('Aktarım dosyası çok büyük.');
const DB=openDatabase(join(resolve(process.env.DATA_DIR||'./data'),'osint.sqlite'));
try{const count=await importTransfer(DB,JSON.parse(await readFile(process.argv[2],'utf8')));console.log(JSON.stringify({imported:count,sessionsImported:false}))}finally{DB.close()}
