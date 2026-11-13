import asyncio,datetime as dt,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace as O
import worker,coverage

class FakeAPI:
    def __init__(self,batches):self.batches=list(batches);self.queries=[];self.closed=0
    async def search(self,q,**kwargs):
        self.queries.append(q);batch=self.batches.pop(0)
        try:
            for i in batch:
                if isinstance(i,Exception):raise i
                yield i
        finally:self.closed+=1

def normalize(i,q):
    return {'id':str(i),'query':q,'publishedAt':worker.stamp(),'collectedAt':worker.stamp(),'fullText':'Ümraniye yangın'}

def db(p):
    c=worker.store(p);coverage.setup(c);return c

class CoverageTests(unittest.TestCase):
    def test_rotates_every_enabled_account_without_duplicates(self):
        sources=[{'handle':'account'+str(i),'enabled':True} for i in range(23)]+[{'handle':'disabled','enabled':False}]
        rounds=[coverage.plans([],sources,i,worker.utcnow()) for i in range(3)]
        allq=' '.join(p['base'] for ps in rounds for p in ps)
        for i in range(23):self.assertIn('from:account'+str(i),allq)
        self.assertNotIn('disabled',allq)
        for ps in rounds:self.assertEqual(len({p['key'] for p in ps}),len(ps))
    def test_no_query_operator_injection_from_dictionary(self):
        ps=coverage.plans([{'kind':'olay','terms':['x" OR from:evil']}],[],0,worker.utcnow())
        self.assertNotIn('from:evil',ps[0]['query']);self.assertEqual(ps[-1]['kind'],'locality')
    def test_partial_failure_retained_without_cursor_ack(self):
        with tempfile.TemporaryDirectory() as d:
            c=db(Path(d)/'s.db');api=FakeAPI([[100,RuntimeError('network')]]);p=coverage.plans([],[],0,worker.utcnow())
            with self.assertRaises(RuntimeError):asyncio.run(coverage.read_queries(api,p,[],40,c,normalize))
            self.assertEqual(c.execute('SELECT count(*) FROM coverage_candidates').fetchone()[0],1)
            self.assertEqual(c.execute('SELECT count(*) FROM coverage_queries').fetchone()[0],0);c.close()
    def test_restart_and_backlog_preserve_gap_and_start_with_latest(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'s.db';c=db(path);p=coverage.plans([],[],0,worker.utcnow());api=FakeAPI([[105,104],[103,102]])
            asyncio.run(coverage.read_queries(api,p,[],2,c,normalize));c.close();c=db(path)
            api=FakeAPI([[106],[101]])
            asyncio.run(coverage.read_queries(api,p,[],2,c,normalize))
            self.assertIn('since_id:105',api.queries[0]);self.assertIn('max_id:101',api.queries[1])
            self.assertEqual(c.execute('SELECT count(*) FROM coverage_candidates').fetchone()[0],6)
            self.assertIsNone(c.execute('SELECT backlog FROM coverage_queries').fetchone()[0]);c.close()
    def test_hard_result_cap_closes_generator(self):
        api=FakeAPI([[1,2,3,4]]);out=[]
        batch=asyncio.run(coverage.fetch(api,'q',2,out,normalize))
        self.assertEqual(len(batch),2);self.assertEqual(api.closed,1)
    def test_first_discovery_and_duplicate_id_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            c=db(Path(d)/'s.db');e=normalize(1,'q');coverage.retain(c,e)
            coverage.retain(c,{**e,'collectedAt':(worker.utcnow()+dt.timedelta(minutes=2)).isoformat()})
            saved=json.loads(c.execute('SELECT data FROM coverage_candidates').fetchone()[0])
            self.assertEqual(saved['firstSeenAt'],e['collectedAt']);self.assertEqual(c.execute('SELECT count(*) FROM coverage_candidates').fetchone()[0],1);c.close()
    def test_invalid_and_outside_window_not_retained(self):
        with tempfile.TemporaryDirectory() as d:
            c=db(Path(d)/'s.db')
            for value in ['', 'invalid', '2020-01-01T00:00:00Z', '2026-11-12T12:00:00']:
                self.assertFalse(coverage.retain(c,{**normalize(1,'q'),'publishedAt':value}))
            c.close()
    def test_shared_adapter_keeps_freshness_and_location_guards(self):
        import coverage_fixtures as test_shadow
        e=test_shadow.record();e['publishedAt']=(worker.utcnow()-dt.timedelta(hours=2)).isoformat()
        self.assertEqual(worker.adapter(test_shadow.snapshot(),[e])['result'][0]['reason'],'outside_fresh_window')
        e=test_shadow.record('Sakarya Karasu ilçesinde Ümraniye Caddesi üzerinde yangın çıktı ve ekipler söndürdü.')
        self.assertEqual(worker.adapter(test_shadow.snapshot(),[e])['result'][0]['decision'],'rejected')

if __name__=='__main__':unittest.main(verbosity=2)
