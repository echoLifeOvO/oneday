// Explicit operator command only. Never run during startup, build or migration.
import nextEnv from '@next/env';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { demoDiaries } from '../lib/demo.ts';
import { databaseTls } from '../lib/server/database-tls.ts';

if (!process.argv.includes('--seed-demo')) throw new Error('Pass --seed-demo to insert labelled mobile-test fixtures.');
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const places = JSON.parse(await readFile(new URL('../lib/places.json', import.meta.url), 'utf8'));
const fixtures = [...demoDiaries,
  {id:'kunshan-mobile-1',placeId:'kunshan',nickname:'散步的云',body:'下班后沿河走了半小时，买了碗面。今天没有特别的事，吹到晚风的时候觉得挺舒服。',cost:26,currency:'CNY',score:83},
  {id:'kunshan-mobile-2',placeId:'kunshan',nickname:'慢慢醒来',body:'睡到自然醒，在家煮饭，下午看了两集剧。没出远门，也没有什么安排，这样过一天也还不错。',cost:18,currency:'CNY',score:72},
  {id:'kunshan-mobile-3',placeId:'kunshan',nickname:'路边的小树',body:'和朋友去逛了老街，吃饭喝茶，聊天聊到忘记看手机。回来有点累，但很开心。',cost:156,currency:'CNY',score:94},
];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ...databaseTls(), connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query('BEGIN');
  let inserted = 0;
  for (const [index, day] of fixtures.entries()) {
    const place = places.find(p => p.id === day.placeId);
    const digest = createHash('sha256').update(`mobile-test-v1:${day.id}`).digest('hex');
    const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
    if ([...day.body].length > 200) throw new Error('Fixture exceeds the diary body limit.');
    await client.query('INSERT INTO places(id,metadata) VALUES($1,$2) ON CONFLICT DO NOTHING', [place.id, JSON.stringify(place)]);
    const result = await client.query(`INSERT INTO diaries
      (id,request_hash,place_id,nickname,day_date,time_zone,body,cost,currency,score,created_at,is_demo)
      VALUES($1,$2,$3,$4,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date,'Asia/Shanghai',$5,$6,$7,$8,
        CURRENT_TIMESTAMP - ($9::int * interval '1 second'),true)
      ON CONFLICT(id) DO NOTHING RETURNING id`,
    [id,digest,place.id,day.nickname,day.body,day.cost,day.currency,day.score,index]);
    inserted += result.rowCount;
  }
  await client.query('COMMIT');
  console.log(`Inserted ${inserted} labelled mobile-test diaries; rerunning does not duplicate them.`);
} catch(error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
