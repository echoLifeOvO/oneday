import test from "node:test";
import assert from "node:assert/strict";
import { constrainLatitude, constrainZoom, latitudeLimit, nextClickZoom, panCamera, scaleZoomDelta, wheelIntent } from "../lib/earth-gestures.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("two-finger scrolling pans both axes, regardless of speed", () => {
  for (const delta of [0.5, 50, 600]) {
    const input = wheelIntent({ deltaX: delta, deltaY: delta / 2, deltaMode: 0, ctrlKey: false }, 800);
    assert.equal(input.kind, "pan");
    assert.equal(input.x, delta);
    assert.equal(input.y, delta / 2);
  }
});

test("pinch opens to zoom in and closes to zoom out, without pan", () => {
  for (const deltaY of [-20, 20]) {
    const input = wheelIntent({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: true }, 800);
    assert.equal(input.kind, "zoom");
    assert.equal(Math.sign(input.zoom), -Math.sign(deltaY));
    assert.equal("x" in input, false);
  }
  near(scaleZoomDelta(1, 2), 1);
  near(scaleZoomDelta(2, 1), -1);
  near(scaleZoomDelta(1, 1.5) + scaleZoomDelta(1.5, 2), 1);
});

test("wheel line/page units normalize before panning", () => {
  const base = { deltaX: 0, deltaY: 2, ctrlKey: false };
  assert.equal(wheelIntent({ ...base, deltaMode: 1 }, 800).y, 32);
  assert.equal(wheelIntent({ ...base, deltaMode: 2 }, 800).y, 1600);
});

test("horizontal rotation never changes latitude or apparent scale", () => {
  const result = panCamera({ lng: 109, lat: 24 }, 2, 160, 0);
  assert.ok(result.center[0] > 109);
  near(result.center[1], 24);
  near(result.zoom, 2);
});

test("vertical rotation stops before poles and reverses immediately at the limit", () => {
  const north = panCamera({ lng: 109, lat: 24 }, 2, 0, -5000);
  near(north.center[1], 55);
  const reverse = panCamera({ lng: north.center[0], lat: north.center[1] }, north.zoom, 0, 2);
  assert.ok(reverse.center[1] < 55);
  near(panCamera({ lng: 109, lat: 24 }, 2, 0, 5000).center[1], -55);
  assert.equal(constrainLatitude(90, 2), 55);
  assert.equal(constrainLatitude(-90, 2), -55);
  assert.ok(latitudeLimit(10) >= 80);
});

test("vertical globe rotation preserves its visible size", () => {
  const radius = (zoom, lat) => 2 ** zoom / Math.cos(lat * Math.PI / 180);
  for (const zoom of [2, 1.05, constrainZoom(-5, 24)]) {
    const result = panCamera({ lng: 109, lat: 24 }, zoom, 0, -5000);
    near(radius(result.zoom, result.center[1]), radius(zoom, 24));
  }
});

test("local-scale pan slows down and can cross the date line", () => {
  const world = panCamera({ lng: 109, lat: 24 }, 2, 100, 0);
  const street = panCamera({ lng: 109, lat: 24 }, 12, 100, 0);
  assert.ok(street.center[0] - 109 < (world.center[0] - 109) / 100);
  assert.ok(panCamera({ lng: 179, lat: 24 }, 2, 100, 0).center[0] < 0);
});

test("rapid repeated clicks accumulate even while an animation is unfinished", () => {
  const first = nextClickZoom(2, null);
  const second = nextClickZoom(2.1, first);
  near(second, 3.7);
  near(nextClickZoom(2.2, second), 4.55);
  assert.equal(nextClickZoom(13.9, 14), 14);
});

test("minimum globe size is its initial viewport size, at every overview latitude", async () => {
  const { overviewZoom, viewportZoom } = await import('../lib/earth-gestures.ts');
  for (const [width,height] of [[390,844],[320,568],[1280,800],[844,390]]) {
    near(overviewZoom(width,height,24),viewportZoom(width,height));
    const equatorMinimum=overviewZoom(width,height,0);
    for (const latitude of [-55,-24,0,24,55]) {
      const minimum=overviewZoom(width,height,latitude);
      near(constrainZoom(-100,latitude,equatorMinimum),minimum);
      near(2**minimum/Math.cos(latitude*Math.PI/180),2**equatorMinimum);
      near(constrainZoom(minimum+.5,latitude,equatorMinimum),minimum+.5);
    }
  }
});
