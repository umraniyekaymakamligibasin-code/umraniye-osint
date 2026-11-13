import assert from 'node:assert/strict';
import {historicalRoutes} from './server/historical-routing.mjs';
assert.deepEqual(historicalRoutes({title:'Okulda yangın çıktı'}).map(x=>x.institution).sort(),['ISTANBUL_ITFAIYE','UMR_ILCE_MEM'].sort());
assert.equal(historicalRoutes({title:'Silahlı saldırıda şüpheli gözaltında'}).length,1);
assert.equal(historicalRoutes({title:'Öğrencimiz şampiyon oldu, tebrik ediyoruz'}).length,0);
assert.equal(historicalRoutes({title:'reklam: elektrik arızası'}).length,0);
assert.equal(historicalRoutes({title:'Polise mukavemet eden şüpheli'}).map(x=>x.institution).join(),'');
assert.equal(historicalRoutes({title:'Araca sokulan tabela'}).length,0);
console.log('PASS: historical routing examples; no notifications');
