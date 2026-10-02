import test from 'node:test';
import assert from 'node:assert/strict';
import { PinchGesture } from '../lib/pinch-gesture.ts';
import { constrainZoom, overviewZoom } from '../lib/earth-gestures.ts';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('pinch clamps before anchoring, reverses immediately and has no movement after lift',()=>{
  const gesture=new PinchGesture();
  const minimum=overviewZoom(390,844,24), equator=overviewZoom(390,844,0);
  let zoom=minimum, anchors=0;
  const apply=delta=>{
    if(!delta)return;
    const next=constrainZoom(zoom+delta.zoom,24,equator);
    if(Math.abs(next-zoom)>.00001)anchors++;
    zoom=next;
  };
  gesture.down(1,[100,200]);gesture.down(2,[300,200]);
  apply(gesture.move(2,[250,200]));apply(gesture.move(2,[200,200]));
  close(zoom,minimum);assert.equal(anchors,0);
  apply(gesture.move(2,[210,200]));assert.ok(zoom>minimum);assert.equal(anchors,1);
  gesture.up(1);gesture.up(2);
  const released=zoom;
  apply(gesture.move(2,[500,200]));
  close(zoom,released);assert.equal(gesture.points.size,0);
});
test('pinch midpoint tracks two-finger pan and a cancelled/replaced finger starts with a fresh distance',()=>{
  const gesture=new PinchGesture();gesture.down(1,[100,100]);gesture.down(2,[200,100]);
  const left=gesture.move(1,[110,120]),right=gesture.move(2,[210,120]);
  close(left.zoom+right.zoom,0);close(left.panX+right.panX,-10);close(left.panY+right.panY,-20);
  assert.deepEqual(right.anchor,[160,120]);
  gesture.up(2);assert.equal(gesture.move(1,[120,120]),null);
  gesture.down(3,[320,120]);close(gesture.move(3,[340,120]).zoom,Math.log2(220/200));
  gesture.clear();assert.equal(gesture.move(3,[400,120]),null);
});
