// Always creates a disposable local cluster. Never connects to DATABASE_URL.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import pg from 'pg';
import { DiaryRepository } from '../lib/server/repository.ts';
import { decodeCursor, readRecentCursor } from '../lib/server/contracts.ts';
const bin=process.env.PG_TEST_BIN;
if(!bin) throw new Error('Set PG_TEST_BIN to an installed PostgreSQL bin directory (postgres, initdb, pg_ctl).');
const temp=await mkdtemp(join(tmpdir(),'one-day-pg-test-'));
const reserve=createServer(); await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
let pool, started=false, web, moderationServer;
try {
  execFileSync(join(bin,'initdb'),['-D',join(temp,'data'),'-A','trust','-U','one_day_test','--no-locale','--encoding=UTF8'],{stdio:'pipe'});
  execFileSync(join(bin,'pg_ctl'),['-D',join(temp,'data'),'-l',join(temp,'log'),'-o',`-p ${port} -h 127.0.0.1 -k ${temp}`,'-w','start'],{stdio:'pipe'});
  started=true;
  const url=`postgresql://one_day_test@127.0.0.1:${port}/postgres`;
  // Both initial apply and second no-op use the actual migration runner.
  for(let i=0;i<2;i++)execFileSync(process.execPath,['scripts/migrate.mjs'],{env:{...process.env,DATABASE_URL:url,PGSSLROOTCERT:'',PGSSL_CA_BASE64:''},stdio:'pipe'});
  pool=new pg.Pool({connectionString:url,max:6});
  const fixtureApproval={model:'test-only',policy:'test-fixture',at:new Date().toISOString()};
  // Direct repository tests supply an explicit fixture receipt; HTTP tests must use the real review gate.
  const repo=new class extends DiaryRepository {
    publish(input,place){return super.publish(input,place,fixtureApproval);}
    comment(id,input){return super.comment(id,input,fixtureApproval);}
  }(pool);
  const places=JSON.parse(await readFile(new URL('../lib/places.json',import.meta.url)));
  const input=(place,extra={})=>({requestId:crypto.randomUUID(),place,body:'Temporary integration test.',cost:28.5,currency:'CNY',score:60,locale:'en',timeZone:'Asia/Shanghai',...extra});
  assert.deepEqual((await repo.recentPlaces(5)).places,[]);
  const a=input(places[0]), b=input(places[1]);
  const first=await repo.publish(a,a.place);
  assert.equal(first.created,true);assert.equal(first.diary.isDemo,undefined);assert.equal(first.diary.isLocal,undefined);
  assert.equal((await repo.publish(a,a.place)).created,false);
  await assert.rejects(repo.publish({...a,body:'Changed'},a.place),/REQUEST_CONFLICT/);
  const second=await repo.publish(b,b.place);
  const again=await repo.publish(input(a.place,{currency:'USD',cost:5,score:99}),a.place);
  const recent=(await repo.recentPlaces(5)).places;
  assert.deepEqual(recent.map(p=>p.place.id),[a.place.id,b.place.id]);assert.equal(recent[0].count,2);
  assert.equal((await repo.recentPlaces(1)).places.length,1);
  const totals=(await repo.summaries(100)).places;
  assert.deepEqual(totals.find(p=>p.place.id===a.place.id).stats,{count:2,minScore:60,maxScore:99,costs:[{currency:'CNY',min:28.5,max:28.5},{currency:'USD',min:5,max:5}]});
  await pool.query('UPDATE diaries SET hidden_at = now() WHERE id = $1',[again.diary.id]);
  assert.deepEqual((await repo.recentPlaces(5)).places.map(p=>p.place.id),[b.place.id,a.place.id]);
  const concurrent=input(places[2]);
  const retry=await Promise.all(Array.from({length:5},()=>repo.publish(concurrent,concurrent.place)));
  assert.equal(retry.filter(r=>r.created).length,1);
  // Deliberate sub-millisecond publication ties exercise SQL cursor precision.
  const ids=[];
  for(let i=0;i<4;i++) { const result=await repo.publish(input(places[3]),places[3]);ids.push(result.diary.id);
    await pool.query('UPDATE diaries SET created_at=$1 WHERE id=$2',[`2026-01-01T00:00:00.00000${i<2?1:i}Z`,result.diary.id]); }
  let cursor=null; const seen=[];
  do { const page=await repo.list(places[3].id,1,cursor);seen.push(...page.diaries.map(d=>d.id));cursor=decodeCursor(page.nextCursor); } while(cursor);
  assert.equal(seen.length,4); assert.equal(new Set(seen).size,4); assert.deepEqual(new Set(seen),new Set(ids));
  await assert.rejects(pool.query('UPDATE diaries SET score=101 WHERE id=$1',[first.diary.id]),error=>error.code==='23514');
  await pool.query('INSERT INTO comments (id,diary_id,nickname,body) VALUES ($1,$2,$3,$4)',[crypto.randomUUID(),first.diary.id,'Passing Bear','A public reply.']);
  assert.equal((await repo.comments(first.diary.id,20)).comments.length,1);
  // Reusing a request id with a new location must roll back the location insert too.
  const phantom={...places[4],id:'osm-N-999999999999',origin:'photon'};
  await assert.rejects(repo.publish({...a,place:phantom},phantom),/REQUEST_CONFLICT/);
  assert.equal((await pool.query('SELECT id FROM places WHERE id=$1',[phantom.id])).rowCount,0);
  // The second migration must reject oversize text and unrounded values even in direct SQL.
  for(const body of ['x'.repeat(201), '😀'.repeat(201)]) await assert.rejects(pool.query('UPDATE diaries SET body=$1 WHERE id=$2',[body,first.diary.id]),e=>e.code==='23514');
  await pool.query('UPDATE diaries SET body=$1 WHERE id=$2',['😀'.repeat(200),first.diary.id]);
  for(const cost of ['1.234','-1','100000000.01','NaN','Infinity']) await assert.rejects(pool.query('UPDATE diaries SET cost=$1 WHERE id=$2',[cost,first.diary.id]),e=>e.code==='23514');
  for(const bad of [{...a.place,name:'x'.repeat(201)}, {...a.place,extra:'x'.repeat(5000)}, {...a.place,center:[999,0]}, {}])
    await assert.rejects(pool.query('UPDATE places SET metadata=$1 WHERE id=$2',[JSON.stringify(bad),a.place.id]),e=>e.code==='23514');
  let placeCursor=null; const discovered=[];
  do { const page=await repo.summaries(1,placeCursor);assert.ok(page.places.length<=1);discovered.push(...page.places.map(p=>p.place.id));placeCursor=page.nextCursor; } while(placeCursor);
  assert.equal(discovered.length,4);assert.equal(new Set(discovered).size,4);
  let recentCursor=null; const recentIds=[];
  do {const page=await repo.recentPlaces(1,recentCursor);recentIds.push(...page.places.map(p=>p.place.id));recentCursor=readRecentCursor(page.nextCursor);}while(recentCursor);
  assert.equal(recentIds.length,4);assert.equal(new Set(recentIds).size,4);
  const stream=await repo.stream(2);assert.equal(stream.length,2);assert.ok(stream.every(d=>typeof d.cost==='number' && !('body' in d) && !('comments' in d)));
  const reply={requestId:crypto.randomUUID(),body:'An anonymous reply',locale:'en'};
  assert.equal((await repo.comment(first.diary.id,reply)).created,true);
  assert.equal((await repo.comment(first.diary.id,reply)).created,false);
  await assert.rejects(repo.comment(first.diary.id,{...reply,body:'changed'}),/REQUEST_CONFLICT/);
  const replies=await repo.comments(first.diary.id,1);assert.ok(replies.nextCursor);
  assert.equal((await repo.comments(first.diary.id,1,decodeCursor(replies.nextCursor))).comments.length,1);
  await assert.rejects(pool.query('UPDATE comments SET body=$1 WHERE id=$2',['a'.repeat(201),reply.requestId]),e=>e.code==='23514');
  console.log('PASS: 200-character/emoji limits, exact numeric cost, bounded place metadata, SQL map/recent/comment pagination and lean stream.');
  console.log('PASS: migrations, persistence, recent distinct locations, publication order, mixed currencies, hidden records, atomic rollback, concurrent retry, cursor pagination and constraints.');
  if(process.env.TEST_HTTP==='1') {
    let moderationCalls=0;
    moderationServer=createHttpServer(async(req,res)=>{
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw);moderationCalls++;
      assert.equal(body.response_format.type,'json_object');assert.equal(body.thinking.type,'disabled');
      const content=JSON.parse(body.messages[1].content);
      const rejected=content.body==='moderation-reject';
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({approved:!rejected,category:rejected?'nonsense':'allowed'})}}]}));
    });
    await new Promise(resolve=>moderationServer.listen(0,'127.0.0.1',resolve));
    const mockUrl=`http://127.0.0.1:${moderationServer.address().port}`;
    const webPort=Number(process.env.TEST_HTTP_PORT||3108);
    web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(webPort)],{env:{...process.env,DATABASE_URL:url,PGSSLROOTCERT:'',PGSSL_CA_BASE64:'',MODERATION_BASE_URL:mockUrl,MODERATION_API_KEY:'test-only',MODERATION_MODEL:'deepseek-flash',ANONYMOUS_COOKIE_SECRET:'temporary-http-test-secret-at-least-32-characters'},stdio:['ignore','pipe','pipe']});
    const base=`http://127.0.0.1:${webPort}`;
    for(let n=0;n<60;n++){try{const response=await fetch(`${base}/api/discovery`);if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
    const discovery=await (await fetch(`${base}/api/discovery`)).json();assert.equal(discovery.mode,'database');assert.equal('diaries' in discovery,false);
    const record=input(places[4]);
    const post=()=>fetch(`${base}/api/diaries`,{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(record)});
    assert.equal((await post()).status,201);assert.equal((await post()).status,200);assert.equal(moderationCalls,1);
    const audit=await pool.query('SELECT moderation_model,moderation_policy,moderated_at FROM diaries WHERE id=$1',[record.requestId]);assert.equal(audit.rows[0].moderation_model,'deepseek-flash');assert.ok(audit.rows[0].moderated_at);
    const fresh=await (await fetch(`${base}/api/places/recent?limit=3`)).json();assert.equal(fresh.places.length,3);assert.equal(fresh.places[0].place.id,record.place.id);
    assert.equal((await fetch(`${base}/api/places/recent?limit=11`)).status,400);
    const invalid=await fetch(`${base}/api/diaries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...record,score:101})});assert.equal(invalid.status,400);
    const page=await (await fetch(`${base}/api/diaries?placeId=${record.place.id}`)).json();assert.equal(page.diaries[0].id,record.requestId);
    const feed=await (await fetch(`${base}/api/stream?limit=12`)).json();assert.ok(feed.diaries.length<=12);assert.ok(feed.diaries.every(d=>!('body' in d)&&typeof d.cost==='number'));
    const single=await (await fetch(`${base}/api/diaries/${record.requestId}`)).json();assert.equal(single.diary.id,record.requestId);
    const response=await fetch(`${base}/api/diaries/${record.requestId}/comments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),body:'HTTP reply',locale:'en'})});assert.equal(response.status,201);
    const responses=await (await fetch(`${base}/api/diaries/${record.requestId}/comments?limit=1`)).json();assert.equal(responses.comments.length,1);
    const over=await fetch(`${base}/api/diaries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...record,body:'x'.repeat(201)})});assert.equal(over.status,400);
    const stringCost=await fetch(`${base}/api/diaries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...record,cost:'12'})});assert.equal(stringCost.status,400);
    const huge=await fetch(`${base}/api/diaries`,{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(8193)});assert.equal(huge.status,413);
    const rejectedId=crypto.randomUUID();
    const rejected=await fetch(`${base}/api/diaries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...record,requestId:rejectedId,body:'moderation-reject'})});
    assert.equal(rejected.status,422);assert.deepEqual(await rejected.json(),{error:'MODERATION_REJECTED'});
    assert.equal((await pool.query('SELECT id FROM diaries WHERE id=$1',[rejectedId])).rows.length,0);
    assert.equal(moderationCalls,3);
    const cookieResponse=await fetch(`${base}/api/stream`);const cookie=cookieResponse.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);
    console.log('PASS: actual HTTP publishing is reviewed before insertion; rejection creates no row; retry does not call model; anonymous cookie and audit fields verified.');
    if(process.env.QA_HOLD==='1') { console.log(`QA_READY ${base} — disposable data only; stop with Ctrl+C.`); await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);}); }
  }
} finally {
  if(web && web.exitCode===null) { const done=new Promise(resolve=>web.once('exit',resolve)); web.kill('SIGTERM'); await done; }
  if(moderationServer)await new Promise(resolve=>moderationServer.close(resolve));
  if(pool)await pool.end();
  if(started)execFileSync(join(bin,'pg_ctl'),['-D',join(temp,'data'),'-m','fast','-w','stop'],{stdio:'pipe'});
  await rm(temp,{recursive:true,force:true});
}
