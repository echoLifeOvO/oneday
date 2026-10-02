import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { bodySchema, costSchema } from '../lib/day-input.ts';
import { clipText, textLength } from '../lib/limits.ts';
import { placeSchema } from '../lib/place-schema.ts';
import { createLimiter, RateLimitError } from '../lib/server/rate-limit.ts';
import { limited } from '../lib/server/http.ts';
import { startPoller } from '../lib/poller.ts';

test('frontend and API agree on 200 Unicode characters, including emoji, and preserve valid decimals',()=>{
  for(const char of ['字','a','😀']) {
    assert.equal(bodySchema.safeParse(char.repeat(200)).success,true);
    assert.equal(bodySchema.safeParse(char.repeat(201)).success,false);
    assert.equal(textLength(clipText(char.repeat(201))),200);
  }
  assert.equal(bodySchema.safeParse('a\0b').success,false);
  for(const cost of [0,.01,.29,35.5,100000000]) assert.equal(costSchema.safeParse(cost).success,true);
  for(const cost of ['35.5',1.234,.00000001,-1,100000000.01,NaN,Infinity]) assert.equal(costSchema.safeParse(cost).success,false);
});
test('every place field and the whole metadata payload are bounded',async()=>{
  const places=JSON.parse(await readFile(new URL('../lib/places.json',import.meta.url)));
  assert.ok(places.every(p=>placeSchema.safeParse(p).success));
  const p=places[0];
  for(const bad of [{...p,name:'x'.repeat(201)}, {...p,region:'x'.repeat(501)}, {...p,id:'x'.repeat(101)}, {...p,center:[999,0]}, {...p,extra:'anything'},
    {...p,name:'字'.repeat(200),englishName:'字'.repeat(200),region:'字'.repeat(500),country:'字'.repeat(100),aliases:'字'.repeat(500),sourceShapeId:'字'.repeat(200)}]) assert.equal(placeSchema.safeParse(bad).success,false);
});
test('all users share one fixed bucket per operation; refill and concurrency are independent',()=>{
  let clock=0; const take=createLimiter(()=>clock);
  const active=Array.from({length:3},()=>take('diary'));
  assert.throws(()=>take('diary'),RateLimitError);
  const independent=take('comment');independent();
  active.forEach(release=>release());
  for(let i=0;i<7;i++)take('diary')();
  assert.throws(()=>take('diary'),e=>e instanceof RateLimitError && e.retryAfter===1);
  clock=1000;take('diary')();assert.throws(()=>take('diary'),RateLimitError);
  clock=2000;const release=take('diary');release();release();
  clock=12000;const full=Array.from({length:3},()=>take('diary'));assert.throws(()=>take('diary'),RateLimitError);full.forEach(f=>f());
});
test('HTTP limiter returns Retry-After and releases concurrency even after failure',async()=>{
  const response=await limited('query',async()=>{throw new RateLimitError(7);});
  assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'7');
  for(let i=0;i<15;i++)assert.equal((await limited('query',async()=>new Response('ok'))).status,200);
});
test('polling waits five seconds and cannot overlap a slow request',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0, resolve;
  const poller=startPoller(async()=>{calls++;await new Promise(r=>resolve=r);},5000);
  assert.equal(calls,1);t.mock.timers.tick(30000);assert.equal(calls,1);
  resolve();await setImmediate();t.mock.timers.tick(4999);assert.equal(calls,1);
  t.mock.timers.tick(1);assert.equal(calls,2);poller.stop();resolve();await setImmediate();t.mock.timers.tick(30000);assert.equal(calls,2);
});
test('polling honors backoff, pauses when hidden and cancels on cleanup',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0, signal;
  const poller=startPoller(async s=>{calls++;signal=s;return 12000;},5000);
  await setImmediate();t.mock.timers.tick(11999);assert.equal(calls,1);
  t.mock.timers.tick(1);assert.equal(calls,2);await setImmediate();
  poller.pause();assert.equal(signal.aborted,true);t.mock.timers.tick(30000);assert.equal(calls,2);
  poller.resume();assert.equal(calls,3);await setImmediate();poller.stop();assert.equal(signal.aborted,true);
  t.mock.timers.tick(60000);assert.equal(calls,3);
});
