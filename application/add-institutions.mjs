import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createInstitutionCredentials} from '/opt/umraniye-osint-deneme/server/institution-coordination/server/institution-credentials.mjs';
const raw=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite');raw.exec('PRAGMA busy_timeout=10000');
const db={prepare(sql){let args=[];const s=raw.prepare(sql);const wrapper={bind(...v){args=v;return wrapper},async first(){return s.get(...args)},async all(){return {results:s.all(...args)}},async run(){return s.run(...args)}};return wrapper},async batch(statements){raw.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements)out.push(await s.run());raw.exec('COMMIT');return out}catch(e){raw.exec('ROLLBACK');throw e}}};
const at=new Date().toISOString(),reference='Yönetici talebi: üç kurum panelinin açılması';
const entries=[['UMR_ILCE_NUFUS','Ümraniye İlçe Nüfus Müdürlüğü','civil_registry_service_access','Nüfus hizmetine erişim','https://www.umraniye.gov.tr/kamu-hizmet-standartlari'],['UMR_ILCE_MUFTULUK','Ümraniye İlçe Müftülüğü','religious_service_access','Cami, Kur’an kursu ve din hizmetlerine erişim','https://www.umraniye.gov.tr/ilce-muftulugu-kamu-hizmet-standartlari-tablosu'],['UMR_ILCE_GENCLIK_SPOR','Ümraniye İlçe Gençlik ve Spor Müdürlüğü','youth_sports_service_access','İlçe gençlik ve spor hizmetlerine erişim','https://gonulluyuzbiz.gov.tr/Foundation/Detail?foundationId=14184']];
raw.exec('BEGIN IMMEDIATE');try{for(const [code,name,topic,label,url] of entries){
 raw.prepare("INSERT INTO coord_institutions(id,code,display_name,institution_group,mandate_note,official_reference_url,approval_status,approval_reference,enabled,email_enabled,created_at,updated_at) VALUES(?,?,?,'public_agency',?,?,'approved',?,1,0,?,?) ON CONFLICT(code) DO NOTHING").run(randomUUID(),code,name,label,url,reference,at,at);
 raw.prepare("INSERT INTO coord_topics(id,code,display_name,sensitivity,approval_status,approval_reference,enabled,created_at,updated_at) VALUES(?,?,?,'ordinary','approved',?,1,?,?) ON CONFLICT(code) DO NOTHING").run(randomUUID(),topic,label,reference,at,at);
 const i=raw.prepare('SELECT id FROM coord_institutions WHERE code=?').get(code),t=raw.prepare('SELECT id FROM coord_topics WHERE code=?').get(topic);
 raw.prepare('INSERT INTO coord_institution_topic_grants(institution_id,topic_id,granted,approval_reference,updated_by,updated_at) VALUES(?,?,1,?,?,?) ON CONFLICT(institution_id,topic_id) DO NOTHING').run(i.id,t.id,reference,'system-authorized-maintenance',at);
}raw.exec('COMMIT')}catch(e){raw.exec('ROLLBACK');throw e}
const vault=createInstitutionCredentials({db,key:readFileSync('/var/lib/umraniye-osint-deneme/institution-credentials.key')});await vault.provision('system-authorized-maintenance');
for(const [code] of entries)console.log(JSON.stringify(raw.prepare('SELECT i.code,i.enabled,EXISTS(SELECT 1 FROM coord_memberships m WHERE m.institution_id=i.id AND m.active=1) accountReady FROM coord_institutions i WHERE code=?').get(code)));
raw.close();
