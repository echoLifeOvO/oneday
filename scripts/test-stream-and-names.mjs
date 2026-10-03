import test from 'node:test';
import assert from 'node:assert/strict';
import { nickname } from '../lib/nickname.ts';
import { uniqueStream, streamFlight } from '../lib/stream-layout.ts';

test('one diary owns exactly one stream item and overlapping pages do not duplicate IDs',()=>{
 const a={id:'a',place:{id:'p'}},b={id:'b',place:{id:'p'}};
 assert.deepEqual(uniqueStream([a]),[a]);
 assert.deepEqual(uniqueStream([a,b,a]),[a,b]);
 assert.deepEqual(uniqueStream([]),[]);
});
test('a stream flight begins completely right of the screen and ends completely left',()=>{
 for(const viewport of [320,390,1280])for(const width of [250,400,2400]){
  const flight=streamFlight(viewport,width);
  assert.ok(flight.start>viewport);
  assert.ok(flight.end+width<0);
  assert.equal((flight.start-flight.end)/(flight.duration/1000),38);
 }
});
test('resize preserves an item already in flight and does not create another copy',()=>{
 assert.equal(streamFlight(390,350,120).start,120);
 assert.equal(streamFlight(390,350,-120).start,-120);
 assert.equal(streamFlight(390,350,1200).start,410);
});
test('publication names preserve all UUID bits and are separate across publication types',()=>{
 const ids=['00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-bfff-ffffffffffff'];
 const names=new Set();
 for(const id of ids)for(const kind of ['diary','comment','local']){
  const name=nickname('zh',id,kind);
  assert.ok(!names.has(name));names.add(name);
  assert.equal(name,nickname('zh',id.toUpperCase(),kind));
  const token=name.split('-').at(-1);
  let decoded=0n;
  for(const char of token)decoded=decoded*36n+BigInt(parseInt(char,36));
  assert.equal(decoded,BigInt('0x'+id.replaceAll('-','')));
  assert.ok(name.length<=100);
 }
 assert.throws(()=>nickname('zh','not-a-uuid','diary'),/INVALID_NICKNAME_ID/);
});
