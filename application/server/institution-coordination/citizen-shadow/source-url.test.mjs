import test from'node:test';import assert from'node:assert/strict';import{canonicalSource,validPublication}from'./source-url.mjs';
test('Facebook story identity retained while tracking and credentials removed',()=>assert.equal(canonicalSource('https://www.facebook.com/story.php?story_fbid=123&id=456&access_token=secret&fbclid=track#fragment'),'https://www.facebook.com/story.php?story_fbid=123&id=456'));
test('news query identifiers preserved',()=>assert.equal(canonicalSource('https://example.invalid/news?id=4&utm_source=x'),'https://example.invalid/news?id=4'));
test('invalid source schemes and embedded credentials rejected',()=>{for(const v of ['javascript:alert(1)','http://example.invalid/','https://user:pass@example.invalid/','broken'])assert.equal(canonicalSource(v),null);});
test('publication dates normalized; invalid values never invented',()=>{assert.equal(validPublication('bad'),undefined);assert.equal(validPublication(null),null);assert.equal(validPublication('2026-11-20T12:00:00+03:00'),'2026-11-20T09:00:00.000Z');});

test('date-only publication preserves its known day without inventing a time',()=>{assert.equal(validPublication('2026-10-14'),'2026-10-14');assert.equal(validPublication('2026-02-30'),undefined);});
