"""Offline fixtures, never ingested into OSINT or Telegram."""
import asyncio,datetime as dt,hashlib,importlib.metadata,inspect,json,os,sqlite3,subprocess,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import patch
import worker,prepare

def snapshot():
    words=[{'id':1,'term':'yangın','aliases':'[]','enabled':1},{'id':2,'term':'sporcu','aliases':'[]','enabled':1},{'id':3,'term':'pasif','aliases':'[]','enabled':1}]
    return {'at':worker.stamp(),'revision':5,'tables':{'facebook_keywords':words,'common_keyword_state':[{'id':1,'revision':5}],'common_keyword_groups':[{'id':'events','name':'Olay','kind':'olay','priority':'P2','enabled':True,'position':1}],'common_keyword_members':[{'keyword_id':1,'group_id':'events','provider':'x','enabled':1},{'keyword_id':2,'group_id':'events','provider':'x','enabled':1},{'keyword_id':3,'group_id':'events','provider':'x','enabled':0}],'workspace_settings':[]},'sources':[],'existingX':[]}
def record(text='Ümraniye ilçesinde çıkan yangın itfaiye ekiplerinin müdahalesiyle söndürüldü.',date=None):
    return {'id':'2118111006647840775','url':'https://x.com/fixture/status/2118111006647840775','title':text,'description':text,'fullText':text,'publishedAt':date or worker.stamp(),'collectedAt':worker.stamp(),'platform':'x','reader':'twscrape','author':'fixture','displayName':'Test fixture','sourceName':'Test fixture'}
class ShadowTests(unittest.TestCase):
    def filtered(self,e):return worker.adapter(snapshot(),[e])['result'][0]
    def test_existing_filter_excludes_football_but_not_other_municipal_sports(self):
        self.assertEqual(self.filtered(record('Ümraniyespor futbol maçında yangın paniği yaşandı, ekipler müdahale etti.'))['reason'],'excluded_umraniyespor')
        self.assertEqual(self.filtered(record('Ümraniye Belediyesi Spor Kulübü sporcu öğrencimiz olimpiyat şampiyonu oldu ve altın madalya kazandı.'))['decision'],'shadow_accepted')
    def test_other_city_and_road_alone_not_local(self):
        self.assertEqual(self.filtered(record('Sakarya Karasu ilçesinde Ümraniye Caddesi üzerinde yangın çıktı ve ekipler söndürdü.'))['decision'],'rejected')
    def test_quote_metadata_football_never_accepted(self):
        e=record();e['metadata']=[{'text':'Ümraniyespor maç sonucu açıklandı'}]
        self.assertEqual(self.filtered(e)['reason'],'excluded_umraniyespor')
    def test_legacy_busy_does_not_block_the_independent_account(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d);(state/'snapshot.json').write_text(json.dumps(snapshot()),encoding='utf-8');(state/'accounts.sqlite').touch()
            with patch.object(prepare,'states',return_value={}),patch.object(worker,'old_busy',return_value=True),patch.object(worker,'collect',return_value=None):r=worker.run(state,True)
            self.assertEqual(r['status'],'empty_results');self.assertTrue(r['liveAttempted'])
    def test_turkish_and_inactive_central_keywords(self):
        self.assertEqual(self.filtered(record())['decision'],'shadow_accepted')
        self.assertEqual(self.filtered(record('Ümraniye pasif konusu hakkında belediye toplantısı gerçekleştirildi.'))['reason'],'keyword_missing')
    def test_missing_naive_stale_future_dates(self):
        for raw in ('','2026-11-12T10:00:00','invalid','2026-02-30T10:00:00Z'):
            e=record();e['publishedAt']=raw
            self.assertEqual(self.filtered(e)['reason'],'publication_date_missing_or_invalid')
        self.assertEqual(self.filtered(record(date=(worker.utcnow()-dt.timedelta(hours=2)).isoformat()))['reason'],'outside_fresh_window')
        self.assertEqual(self.filtered(record(date=(worker.utcnow()+dt.timedelta(seconds=30)).isoformat()))['reason'],'future_publication')
    def test_id_precision_date_and_full_text_normalization(self):
        tweet=Obj(id_str='2118111006647840775',user=Obj(username='fixture',displayname='Fixture'),date=dt.datetime(2026,11,12,23,30,tzinfo=dt.timezone(dt.timedelta(hours=3))),rawContent='tam metin'*100)
        e=worker.normalize(tweet,'test');self.assertIsInstance(e['id'],str);self.assertEqual(e['publishedAt'],'2026-11-12T20:30:00+00:00');self.assertEqual(len(e['fullText']),900)
    def test_dedup_cross_query_and_restart_and_turkey_display(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'shadow.sqlite';e=record(date='2026-11-12T21:30:00Z');con=worker.store(p)
            self.assertTrue(worker.savepost(con,e,'q1'));self.assertFalse(worker.savepost(con,e,'q2'));con.commit();con.close();con=worker.store(p)
            self.assertFalse(worker.savepost(con,e,'q3'));row=con.execute('SELECT id,data,queries FROM posts').fetchone();self.assertEqual(row[0],e['id']);self.assertEqual(json.loads(row[2]),['q1','q2','q3']);self.assertIn('2026-11-13T00:30:00+03:00',json.loads(row[1])['publishedTurkey']);con.close()
    def test_simultaneous_round_lock(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'lock'
            with worker.locked(p):
                with self.assertRaisesRegex(RuntimeError,'shadow_busy'):
                    with worker.locked(p):pass
            with worker.locked(p):pass
    def test_dry_run_never_calls_network_or_old_collector(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d);(state/'snapshot.json').write_text(json.dumps(snapshot()),encoding='utf-8')
            with patch.object(worker,'collect',side_effect=AssertionError('no network')),patch.object(prepare,'states',return_value={}):
                r=worker.run(state)
            self.assertEqual(r['status'],'dry_run_plan_only');self.assertFalse(r['liveAttempted']);self.assertEqual(r['telegramWrites'],0);self.assertEqual(r['productionWrites'],0)
            self.assertFalse((state/'accounts.sqlite').exists())
    def test_missing_session_live_request_does_not_touch_network(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d);(state/'snapshot.json').write_text(json.dumps(snapshot()),encoding='utf-8')
            with patch.object(worker,'collect',side_effect=AssertionError('no network')),patch.object(prepare,'states',return_value={}):r=worker.run(state,True)
            self.assertEqual(r['status'],'session_missing');self.assertFalse(r['liveAttempted'])
    def test_rate_limit_and_access_and_empty_are_distinct(self):
        NoAccountError=type('NoAccountError',(Exception,),{});ApiError=type('ApiError',(Exception,),{})
        self.assertEqual(worker.status_error(NoAccountError()),'rate_limited_or_account_unavailable');self.assertEqual(worker.status_error(ApiError()),'access_error')
        for fail in (None,NoAccountError(),ApiError()):
            with tempfile.TemporaryDirectory() as d:
                state=Path(d);(state/'snapshot.json').write_text(json.dumps(snapshot()),encoding='utf-8');(state/'accounts.sqlite').touch()
                async def simulated(*args):
                    if fail:raise fail
                with patch.object(prepare,'states',return_value={}),patch.object(worker,'old_busy',return_value=False),patch.object(worker,'collect',side_effect=simulated):r=worker.run(state,True)
                self.assertEqual(r['status'],'empty_results' if fail is None else worker.status_error(fail))
                if fail:self.assertGreater(r['retryAt'],__import__('time').time())
    def test_query_rotation_from_enabled_sources_only(self):
        groups=[{'kind':'olay','terms':['yangın','kaza','polis','trafik','ambulans','deprem']}];sources=[{'handle':'tc_umraniye'}]
        a=worker.plan(groups,sources,0,worker.utcnow());b=worker.plan(groups,sources,1,worker.utcnow());self.assertEqual(a[0]['kind'],'accounts');self.assertIn('from:tc_umraniye',a[0]['query']);self.assertNotEqual(next(p['base'] for p in a if p['kind']=='keywords'),next(p['base'] for p in b if p['kind']=='keywords'));self.assertLessEqual(len(a),6)
    def test_pinned_real_library_signature(self):
        from twscrape import API
        self.assertEqual(importlib.metadata.version('twscrape'),'0.21.0')
        self.assertIn('wait_timeout',inspect.signature(API).parameters);self.assertIn('kv',inspect.signature(API.search).parameters)
        self.assertEqual(str(inspect.signature(API.search)),'(self, q: str, limit=-1, kv: dict | None = None)')
    def test_real_library_missing_account_exits_no_network(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(RuntimeError,'session_missing'):asyncio.run(worker.collect(Path(d)/'own.sqlite',[],[]))
    def test_readonly_snapshot_never_changes_source_db(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'source.sqlite';c=sqlite3.connect(p);s=snapshot()
            c.executescript('CREATE TABLE facebook_keywords(id,term,aliases,enabled);CREATE TABLE common_keyword_groups(id,name,kind,priority,enabled,position);CREATE TABLE common_keyword_members(keyword_id,group_id,provider,enabled);CREATE TABLE common_keyword_state(id,revision);CREATE TABLE workspace_settings(id,data);CREATE TABLE lab_items(data,published_at);CREATE TABLE lab_outbox(id,data);CREATE TABLE lab_config(id,data);')
            for table in prepare.TABLES:
                for row in s['tables'][table]:c.execute('INSERT INTO '+table+' ('+','.join(row)+') VALUES('+','.join('?' for _ in row)+')',list(row.values()))
            c.commit();c.close();before=p.read_bytes();out=prepare.read_snapshot(p,Path(__file__).parent,{})
            self.assertEqual(before,p.read_bytes());self.assertNotIn('lab_outbox',out['tables']);self.assertEqual(out['revision'],5)

if __name__=='__main__':unittest.main(verbosity=2)
