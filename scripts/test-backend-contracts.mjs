import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publishSchema, serverDay, readLimit, decodeCursor, encodeCursor } from '../lib/server/contracts.ts';
import { apiError, readBody } from '../lib/server/http.ts';
import { dataMode } from '../lib/server/db.ts';
import { mergeStats } from '../lib/diary-stats.ts';
const [place] = JSON.parse(await readFile(new URL('../lib/places.json', import.meta.url)));
const input = { requestId: crypto.randomUUID(), place, body:' A day ', cost:28.5, currency:'CNY', score:50, locale:'en', timeZone:'Asia/Shanghai' };

test('publishing accepts no client date or identity; money, score, timezone and place are validated on the server',()=>{
  assert.equal(publishSchema.parse(input).body,'A day');
  for(const bad of [{date:'2000-01-01'},{nickname:'Chosen name'},{cost:'28'},{cost:1.001},{cost:-1},{score:101},{score:.5},{timeZone:'not/a-zone'}, {body:'   '}, {body:'x'.repeat(201)}, {place:{...place,center:[999,0]}}]) {
    assert.equal(publishSchema.safeParse({...input,...bad}).success,false,JSON.stringify(bad).slice(0,100));
  }
});
test('today is calculated from server time in the declared timezone across date boundaries',()=>{
  const instant = new Date('2026-10-03T00:30:00Z');
  assert.equal(serverDay('Asia/Shanghai',instant),'2026-10-03');
  assert.equal(serverDay('America/Los_Angeles',instant),'2026-10-02');
});
test('recommendations have bounded limits and cursor preserves microseconds',()=>{
  assert.equal(readLimit(null,5,10),5);
  for(const limit of ['0','11','-1','1.5','5x','']) assert.throws(()=>readLimit(limit,5,10));
  const cursor={at:'2026-10-03T01:02:03.123456Z',id:crypto.randomUUID()};
  assert.deepEqual(decodeCursor(encodeCursor(cursor)),cursor);
  assert.throws(()=>decodeCursor('not-a-cursor'));
});
test('JSON body is bounded and same-origin; errors do not reveal database connection strings',async()=>{
  const request=body=>new Request('https://one.test/api/diaries',{method:'POST',headers:{'Content-Type':'application/json'},body});
  assert.deepEqual(await readBody(request(JSON.stringify(input))),input);
  assert.deepEqual(await readBody(new Request('http://localhost:3108/api/diaries',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://one.test',host:'one.test','x-forwarded-proto':'https'},body:'{}'})),{});
  await assert.rejects(readBody(request('not json')),/INVALID_BODY/);
  await assert.rejects(readBody(request('x'.repeat(8193))),/BODY_TOO_LARGE/);
  await assert.rejects(readBody(new Request('https://one.test/api/diaries',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://elsewhere.test'},body:'{}'})),/CROSS_ORIGIN/);
  const response=apiError(new Error('postgres://secret-password@internal'));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'SERVICE_UNAVAILABLE'});
});
test('global hover statistics combine full backend totals without mixing currencies',()=>{
  assert.deepEqual(mergeStats([{count:150,minScore:20,maxScore:90,costs:[{currency:'CNY',min:0,max:200}]},
    {count:2,minScore:10,maxScore:50,costs:[{currency:'USD',min:1,max:3},{currency:'CNY',min:30,max:500}]}]),
  {count:152,minScore:10,maxScore:90,costs:[{currency:'CNY',min:0,max:500},{currency:'USD',min:1,max:3}]});
});
test('a missing production database never silently enables local publishing',()=>{
  const old={...process.env};
  try {
    delete process.env.DATABASE_URL; delete process.env.ONE_DAY_PREVIEW;
    process.env.NODE_ENV='production'; assert.throws(()=>dataMode(),/DATABASE_NOT_CONFIGURED/);
    process.env.NODE_ENV='development'; assert.equal(dataMode(),'preview');
    process.env.DATABASE_URL='postgres://unused'; assert.equal(dataMode(),'database');
  } finally {
    for(const key of ['DATABASE_URL','ONE_DAY_PREVIEW','NODE_ENV']) { if(old[key]===undefined)delete process.env[key]; else process.env[key]=old[key]; }
  }
});
