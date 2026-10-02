import test from "node:test";
import assert from "node:assert/strict";
import { activeRasterLevels, satelliteTileUrl, loadSatelliteTile, neighbouringTiles, prewarmTiles, zoomAheadTiles } from "../lib/satellite-tiles.ts";

test("initial globe imagery is same-origin while detail remains on-demand",()=>{
  assert.equal(satelliteTileUrl({z:0,x:0,y:0}),'/imagery/2024/0/0/0.jpg');
  assert.equal(satelliteTileUrl({z:3,x:6,y:3}),'/imagery/2024/3/3/6.jpg');
  assert.match(satelliteTileUrl({z:4,x:12,y:6}),/^https:\/\/tiles\.maps\.eox\.at\/.*\/4\/6\/12\.jpg$/);
});

test("each zoom uses only the target raster resolution and one fallback", () => {
  assert.deepEqual(activeRasterLevels(1).map(l=>l.id),['earth-wide']);
  assert.deepEqual(activeRasterLevels(6).map(l=>l.id),['earth-country','earth-area']);
  assert.deepEqual(activeRasterLevels(13).map(l=>l.id),['earth-local','earth-detail']);
  for(let z=0;z<=14;z+=.1) assert.ok(activeRasterLevels(z).length<=2);
});

test("prewarming remains bounded for a global view and wraps the date line", () => {
  const tiles = neighbouringTiles([179, 35], [-180, -85, 180, 85], 6, 20);
  assert.ok(tiles.length <= 20);
  assert.ok(tiles.every(t => t.x >= 0 && t.x < 64 && t.y >= 0 && t.y < 64));
  assert.ok(tiles.some(t => t.x === 0));
  assert.equal(new Set(tiles.map(t => `${t.z}/${t.y}/${t.x}`)).size, tiles.length);
});

test("coarse levels deduplicate wrapped coordinates and polar neighbours stay valid", () => {
  assert.equal(neighbouringTiles([179, 0], [-180, -85, 180, 85], 0).length, 1);
  const tiles = neighbouringTiles([10, 85], [0, 80, 20, 90], 8);
  assert.ok(tiles.every(t => t.y >= 0 && t.y < 256));
});

test("zoom prediction reads the next resolution before crossing it, with a bounded local footprint", () => {
  const center = [100.2, 25.7], bounds = [99, 25, 101, 27];
  const ahead = zoomAheadTiles(center, bounds, 9.1, 1);
  assert.ok(ahead.length <= 12);
  assert.ok(ahead.every(t => t.z === 11));
  assert.ok(zoomAheadTiles(center, bounds, 9.8, 1).every(t => t.z === 12));
  assert.ok(zoomAheadTiles(center, bounds, 9.1, -1).every(t => t.z === 9));
  assert.ok(zoomAheadTiles(center, bounds, 14, 1).every(t => t.z === 14));
  assert.ok(zoomAheadTiles(center, bounds, 0, -1).every(t => t.z === 0));
});

test("visible tiles reuse in-flight prewarm requests and cached bytes", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(new Uint8Array([1, 2, 3]));
  };
  try {
    const tile = { z: 14, x: 12000, y: 7000 };
    const [a, b] = await Promise.all([loadSatelliteTile(tile), loadSatelliteTile(tile)]);
    assert.equal(a, b);
    assert.equal(await loadSatelliteTile(tile), a);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("failed requests can retry and stopped prewarming starts no new requests", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return requests === 1 ? new Response(null, { status: 503 }) : new Response(new Uint8Array([1]));
  };
  try {
    const tile = { z: 14, x: 12001, y: 7001 };
    await assert.rejects(loadSatelliteTile(tile));
    assert.equal((await loadSatelliteTile(tile)).byteLength, 1);
    const stopped = new AbortController();
    stopped.abort();
    prewarmTiles([{ z: 14, x: 12002, y: 7002 }], stopped.signal);
    await Promise.resolve();
    assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("cached viewport tiles leave the budget to neighbours, with two prewarm workers", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0, active = 0, peak = 0;
  globalThis.fetch = async () => {
    requests++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return new Response(new Uint8Array([1]));
  };
  try {
    const visible = Array.from({length: 20}, (_, x) => ({z:14,x:13000+x,y:8000}));
    for (const tile of visible) await loadSatelliteTile(tile);
    requests = 0;
    const neighbours = Array.from({length: 50}, (_, x) => ({z:14,x:14000+x,y:8000}));
    prewarmTiles([...visible, ...neighbours], new AbortController().signal);
    for (let i = 0; i < 100 && (requests < 32 || active); i++)
      await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(requests, 32);
    assert.ok(peak <= 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("rapidly replacing a speculative view keeps a global two-request limit and drops stale queued work", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let active = 0, peak = 0;
  globalThis.fetch = async url => {
    requests.push(url); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return new Response(new Uint8Array([1]));
  };
  try {
    const first = new AbortController();
    prewarmTiles(Array.from({length:32}, (_, x) => ({z:14,x:15000+x,y:8100})), first.signal);
    first.abort();
    prewarmTiles(Array.from({length:20}, (_, x) => ({z:14,x:15100+x,y:8100})), new AbortController().signal, 12);
    for (let i = 0; i < 100 && (requests.length < 14 || active); i++)
      await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(peak, 2);
    assert.equal(requests.length, 14);
    assert.equal(requests.filter(url => /\/150\d\d.jpg$/.test(url)).length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
