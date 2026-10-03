import assert from 'node:assert/strict';
import test from 'node:test';
import {randomId} from '../app/lib/random-id.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
test('works without randomUUID using secure browser randomness',()=>{
 const legacy={getRandomValues(array){assert.equal(this,legacy);return crypto.getRandomValues(array);}};
 const ids=Array.from({length:1000},()=>randomId(legacy));
 for(const id of ids)assert.match(id,uuid);
 assert.equal(new Set(ids).size,1000);
});
test('fallback sets UUID version and variant bits',()=>{
 assert.equal(randomId({getRandomValues:a=>a.fill(255)}),'ffffffff-ffff-4fff-bfff-ffffffffffff');
 assert.equal(randomId({getRandomValues:a=>a.fill(0)}),'00000000-0000-4000-8000-000000000000');
});
test('native API retains its Crypto receiver',()=>{
 const modern={randomUUID(){assert.equal(this,modern);return 'native-result';},getRandomValues(){throw Error('unexpected fallback');}};
 assert.equal(randomId(modern),'native-result');
});
test('never falls back to insecure random numbers',()=>{assert.throws(()=>randomId({}),/Safari or Chrome/);});
