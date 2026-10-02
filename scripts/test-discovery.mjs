import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { photonPlaces } from '../lib/place-search.ts';

test('live place results preserve real ids and reorder Photon extents; malformed or street results are excluded', () => {
  const place = { type:'Feature', properties:{ osm_key:'place', osm_type:'R', osm_id:5505984, type:'district', name:'海淀区', city:'北京市', country:'中国', countrycode:'CN', extent:[116.04,40.16,116.39,39.88] }, geometry:{type:'Point',coordinates:[116.29,39.95]} };
  const parsed = photonPlaces({features:[place,place,{...place,geometry:{coordinates:[999,999]}},{...place,properties:{...place.properties,type:'street'}}]});
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'osm-R-5505984');
  assert.deepEqual(parsed[0].bounds,[116.04,39.88,116.39,40.16]);
  assert.equal(parsed[0].region,'北京市');
});

test('shared discovery regions retain every child, so multiple towns are never reduced to nearest only', async () => {
  const wide = JSON.parse(await readFile(new URL('../public/data/glow-wide-soft.geojson', import.meta.url),'utf8'));
  const jiangsu = wide.features.filter(f=>f.properties.placeIds.includes('xuanwu'));
  assert.ok(jiangsu.length > 0);
  assert.ok(jiangsu.every(f=>f.properties.placeIds.includes('kunshan')));
  assert.equal(new Set(jiangsu.map(f=>f.properties.group)).size,1);
  assert.equal(new Set(jiangsu.map(f=>f.properties.alpha)).size,5);
});

test('hover summaries keep mixed currencies separate and omit unselected places', async () => {
  const { diaryStats } = await import('../lib/diary-stats.ts');
  const stats = diaryStats([
    {placeId:'a',score:51,cost:168,currency:'CNY'},
    {placeId:'a',score:86,cost:47.5,currency:'CNY'},
    {placeId:'b',score:100,cost:14.8,currency:'EUR'},
    {placeId:'c',score:0,cost:999999,currency:'CNY'},
  ],['a','b']);
  assert.deepEqual(stats,{count:3,minScore:51,maxScore:100,costs:[{currency:'CNY',min:47.5,max:168},{currency:'EUR',min:14.8,max:14.8}]});
  assert.deepEqual(diaryStats([],['a']),{count:0,minScore:null,maxScore:null,costs:[]});
});

test('cost editing accepts decimals and rejects exponent, letters, signs and excess precision', async () => {
  const { isCostInput } = await import('../lib/diary-stats.ts');
  for(const value of ['', '0','0.5','28.50','28.','.5']) assert.equal(isCostInput(value),true,value);
  for(const value of ['1e3','abc','-10','+20','12,000','28.501','1234567890','NaN','0x10']) assert.equal(isCostInput(value),false,value);
});
