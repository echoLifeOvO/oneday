import test from 'node:test';
import assert from 'node:assert/strict';
import { randomId } from '../lib/random-id.ts';
import { databaseTls } from '../lib/server/database-tls.ts';

test('LAN HTTP can generate valid random UUIDs without randomUUID support',()=>{
  const source={getRandomValues:array=>crypto.getRandomValues(array)};
  const ids=Array.from({length:1000},()=>randomId(source));
  assert.equal(new Set(ids).size,1000);
  assert.ok(ids.every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
});
test('database CA environment config verifies certificates and rejects connection-string overrides',()=>{
  const ca='-----BEGIN CERTIFICATE-----\ntest-certificate\n-----END CERTIFICATE-----';
  const env={DATABASE_URL:'postgresql://app:unused@database.example/one_day',PGSSL_CA_BASE64:Buffer.from(ca).toString('base64')};
  assert.deepEqual(databaseTls(env),{ssl:{ca,rejectUnauthorized:true}});
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) assert.throws(()=>databaseTls({...env,DATABASE_URL:env.DATABASE_URL+'?'+key+'=disable'}),/DATABASE_TLS_CONFIG/);
  assert.throws(()=>databaseTls({...env,PGSSL_CA_BASE64:'not-a-certificate'}),/DATABASE_TLS_CONFIG/);
  assert.deepEqual(databaseTls({}),{});
});
