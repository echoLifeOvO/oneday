import test from 'node:test';
import assert from 'node:assert/strict';
import { createModerator, parseDecision, MODERATION_POLICY } from '../lib/server/moderation.ts';
import { browserIdentity, verifyBrowserToken, createBrowserLimiter } from '../lib/server/anonymous.ts';
import { RateLimitError } from '../lib/server/rate-limit.ts';
import { apiError } from '../lib/server/http.ts';

const config={key:'test-only',model:'deepseek-flash',url:'https://moderation.invalid/chat/completions'};
const envelope=(content,finish='stop')=>({choices:[{finish_reason:finish,message:{content:typeof content==='string'?content:JSON.stringify(content)}}]});
const allow={approved:true,category:'allowed'}, deny={approved:false,category:'nonsense'};
const input={kind:'diary',body:'今天吃了面，下午在家看书。'};

test('JSON mode result must be complete, correctly typed and internally consistent',()=>{
  assert.deepEqual(parseDecision(envelope(allow)),allow);
  assert.deepEqual(parseDecision(envelope(deny)),deny);
  for(const payload of [envelope(''),envelope('not json'),envelope(allow,'length'),envelope(allow,'content_filter'),envelope({approved:'true',category:'allowed'}),
    envelope({approved:true,category:'violence'}),envelope({approved:false,category:'allowed'}),envelope({...allow,explanation:'extra'}),
    {choices:[{finish_reason:'stop',message:{content:JSON.stringify(allow),refusal:'refused'}}]}])assert.throws(()=>parseDecision(payload));
});
test('OpenAI-compatible request uses JSON mode, disables thinking and isolates user content',async()=>{
  let captured;
  const check=createModerator(async(url,init)=>{captured={url,init};return Response.json(envelope(allow));});
  const approval=await check(input,config);
  const body=JSON.parse(captured.init.body);
  assert.equal(captured.url,config.url);assert.equal(captured.init.redirect,'error');
  assert.equal(captured.init.headers.Authorization,'Bearer test-only');
  assert.deepEqual(body.response_format,{type:'json_object'});assert.deepEqual(body.thinking,{type:'disabled'});
  assert.equal(body.model,'deepseek-flash');assert.equal(body.stream,false);assert.equal(body.max_tokens,128);
  assert.equal(body.messages[0].role,'system');assert.deepEqual(JSON.parse(body.messages[1].content),input);
  assert.equal(approval.policy,MODERATION_POLICY);assert.equal(approval.model,'deepseek-flash');
});
test('rejected content and failures never return approval; upstream details do not escape',async()=>{
  await assert.rejects(createModerator(async()=>Response.json(envelope(deny)))(input,config),/MODERATION_REJECTED/);
  const cases=[async()=>new Response('sensitive upstream error',{status:401}), async()=>Response.json(envelope('invalid')),
    async()=>new Response(' '.repeat(16385)), async()=>{throw new Error('network secret');}];
  for(const fetcher of cases)await assert.rejects(createModerator(fetcher)(input,config),/^Error: MODERATION_UNAVAILABLE$/);
  const rejected=apiError(new Error('MODERATION_REJECTED'));assert.equal(rejected.status,422);assert.deepEqual(await rejected.json(),{error:'MODERATION_REJECTED'});
  assert.equal(apiError(new Error('MODERATION_UNAVAILABLE')).status,503);
});
test('moderation times out without retrying or approving',async()=>{
  let calls=0;
  const check=createModerator(async(_url,{signal})=>{calls++;return new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  });},Date.now,10);
  const keepAlive=setTimeout(()=>{},100);
  try{await assert.rejects(check(input,config),/MODERATION_UNAVAILABLE/);assert.equal(calls,1);}finally{clearTimeout(keepAlive);}
});
test('same content shares one in-flight call and bounded cache; failures are not cached',async()=>{
  let calls=0,resolve,clock=0;
  const check=createModerator(async()=>{calls++;return new Promise(r=>resolve=r);},()=>clock);
  const a=check(input,config),b=check(input,config);
  assert.equal(calls,1);resolve(Response.json(envelope(allow)));await Promise.all([a,b]);
  await check(input,config);assert.equal(calls,1);
  clock=600001;const c=check(input,config);assert.equal(calls,2);resolve(Response.json(envelope(deny)));await assert.rejects(c,/MODERATION_REJECTED/);
  await assert.rejects(check(input,config),/MODERATION_REJECTED/);assert.equal(calls,2);
  let failures=0;
  const broken=createModerator(async()=>{failures++;throw new Error('broken');});
  await assert.rejects(broken(input,config));await assert.rejects(broken(input,config));assert.equal(failures,2);
});
test('all moderation requests share a strict cost and concurrency budget',async()=>{
  let clock=0,calls=0;const resolvers=[];
  const check=createModerator(async()=>{calls++;return new Promise(r=>resolvers.push(r));},()=>clock);
  const a=check(input,config),b=check({...input,body:'第二条'},config);
  await assert.rejects(check({...input,body:'第三条'},config),RateLimitError);assert.equal(calls,2);
  resolvers.shift()(Response.json(envelope(allow)));resolvers.shift()(Response.json(envelope(allow)));await Promise.all([a,b]);
  const c=check({...input,body:'第三条'},config);resolvers.shift()(Response.json(envelope(allow)));await c;
  await assert.rejects(check({...input,body:'第四条'},config),RateLimitError);
  clock=5000;const d=check({...input,body:'第四条'},config);resolvers.shift()(Response.json(envelope(allow)));await d;
});
test('anonymous cookie is signed, expires, is HttpOnly, and cannot be chosen by a client',()=>{
  const now=Date.now(),key='test-only-secret'.repeat(3),request=new Request('https://one.test/api/stream');
  const visitor=browserIdentity(request,key,now), token=visitor.cookie.split(';')[0].split('=')[1];
  assert.match(visitor.cookie,/__Host-one_day_browser=/);assert.match(visitor.cookie,/HttpOnly/);assert.match(visitor.cookie,/Secure/);assert.match(visitor.cookie,/SameSite=Lax/);
  assert.equal(verifyBrowserToken(token,key,now),visitor.id);
  assert.equal(verifyBrowserToken(token,'wrong',now),null);assert.equal(verifyBrowserToken(token,key,now+31*86400000),null);
  assert.equal(verifyBrowserToken('x'.repeat(1000),key,now),null);
  const repeat=browserIdentity(new Request(request.url,{headers:{cookie:visitor.cookie.split(';')[0]}}),key,now);
  assert.equal(repeat.id,visitor.id);assert.equal(repeat.cookie,null);
  const forged=browserIdentity(new Request(request.url,{headers:{cookie:'__Host-one_day_browser=chosen'}}),key,now);
  assert.notEqual(forged.id,'chosen');assert.ok(forged.cookie);
});
test('HTTPS behind the self-hosted proxy retains a secure signed browser cookie',()=>{
  const key='test-only-proxy-secret'.repeat(3);
  const request=new Request('http://web:3000/api/stream',{headers:{'x-forwarded-proto':'https'}});
  const first=browserIdentity(request,key);
  assert.match(first.cookie,/^__Host-one_day_browser=/);
  assert.match(first.cookie,/; Secure$/);
  const next=browserIdentity(new Request(request.url,{headers:{'x-forwarded-proto':'https',cookie:first.cookie.split(';')[0]}}),key);
  assert.equal(next.id,first.id);assert.equal(next.cookie,null);
});
test('browser quotas are independent, refill, and retain active quotas at memory capacity',()=>{
  let now=0;const take=createBrowserLimiter(()=>now,2);
  take('a','diary')();take('a','diary')();assert.throws(()=>take('a','diary'),RateLimitError);
  const b=take('b','diary');assert.throws(()=>take('b','diary'),RateLimitError);b();
  assert.throws(()=>take('c','query'),RateLimitError);
  now=60000;take('a','diary')();
  now=3600001;take('c','query')();assert.throws(()=>take('d','query'),RateLimitError); // b expired; a has not
  now=7200002;take('d','query')();
});
