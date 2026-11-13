import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openDatabase} from './database.mjs';
const dir=resolve(process.env.DATA_DIR||'./data'),target=resolve(process.env.BACKUP_DIR||join(dir,'backups'));await mkdir(target,{recursive:true,mode:0o700});
const DB=openDatabase(join(dir,'osint.sqlite'));try{await DB.backupTo(join(target,'osint-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'));console.log('Tutarlı veritabanı yedeği oluşturuldu.')}finally{DB.close()}
