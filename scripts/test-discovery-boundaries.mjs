import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contains, selectBoundary, mergeBoundaryData } from '../lib/discovery-boundaries.ts';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const empty = () => ({ type:'FeatureCollection',features:[] });
const beijing = { id:'osm-R-912940',name:'北京市',countryCode:'CN',center:[116.3912972,39.9057136],bounds:[115.416849,39.1707096,117.7371243,41.059236] };

test('a real searched Beijing resolves its municipality, not the district containing its city centre', async () => {
  const parents = await read('../public/data/discovery-v1/CN.json');
  const parent = selectBoundary(beijing, parents);
  assert.equal(parent.name, 'Beijing Municipality');
  const children = await read(`../public/data/discovery-v1/${parent.details}`);
  assert.equal(selectBoundary(beijing, [parent,...children]).id,parent.id);
  const result = mergeBoundaryData({regions:empty(),wide:empty(),near:empty(),local:empty()},[{place:beijing,parent,local:parent,precise:true}],{[beijing.id]:1},null);
  assert.equal(result.regions.features[0].properties.id,beijing.id);
  for (const level of ['wide','near','local']) {
    assert.ok(result[level].features.length);
    assert.ok(result[level].features.every(f=>f.properties.lit && f.properties.placeIds.includes(beijing.id)));
  }
});

test('new towns sharing an existing discovery region share one fill, retain all children and do not mutate base data', async () => {
  const [regions,wide,near,local,parents] = await Promise.all(['../public/data/regions.geojson','../public/data/glow-wide-soft.geojson','../public/data/glow-near-soft.geojson','../public/data/glow-local-soft.geojson','../public/data/discovery-v1/CN.json'].map(read));
  const base = {regions,wide,near,local};
  const place = {id:'osm-R-test-kunshan',countryCode:'CN',center:[120.98,31.38],bounds:[120.7988,31.1072,121.1577,31.5425]};
  const parent = selectBoundary(place,parents);
  const children = await read(`../public/data/discovery-v1/${parent.details}`);
  const child = selectBoundary(place,children);
  assert.equal(child.name,'Kunshan City');
  const serialized = JSON.stringify(base);
  const additions = [{place,parent,local:child,precise:true}];
  const merged = mergeBoundaryData(base,additions,{xuanwu:1,[place.id]:1},null);
  const lit = merged.wide.features.filter(f=>f.properties.lit);
  assert.equal(new Set(lit.map(f=>f.properties.group)).size,1);
  assert.ok(lit.every(f=>f.properties.placeIds.includes('xuanwu') && f.properties.placeIds.includes(place.id)));
  assert.equal(JSON.stringify(base),serialized);
  const removed = mergeBoundaryData(base,additions,{},null);
  assert.ok(removed.wide.features.every(f=>!f.properties.lit));
  assert.ok(!removed.regions.features.some(f=>f.properties.id===place.id));
});

test('polygon containment respects holes and multipolygon islands',()=>{
  const ring=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
  const geometry={type:'MultiPolygon',coordinates:[[ring(0,0,10),ring(3,3,3)],[ring(20,20,2)]]};
  assert.equal(contains(geometry,[1,1]),true);
  assert.equal(contains(geometry,[4,4]),false);
  assert.equal(contains(geometry,[21,21]),true);
  assert.equal(contains(geometry,[15,15]),false);
});
