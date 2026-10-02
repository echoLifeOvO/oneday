import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAtPosition, scoreForKey } from '../lib/score-slider.ts';

test('score drag is continuous across the track and clamps beyond the captured touch area', () => {
  assert.equal(scoreAtPosition(100,100,144),0);
  assert.equal(scoreAtPosition(172,100,144),50);
  assert.equal(scoreAtPosition(244,100,144),100);
  assert.equal(scoreAtPosition(-50,100,144),0);
  assert.equal(scoreAtPosition(600,100,144),100);
  const scores=Array.from({length:145},(_,x)=>scoreAtPosition(100+x,100,144));
  assert.equal(new Set(scores).size,101);
});
test('score keyboard controls preserve all 101 scores and endpoints',()=>{
  assert.equal(scoreForKey(50,'ArrowRight'),51);
  assert.equal(scoreForKey(50,'PageDown'),40);
  assert.equal(scoreForKey(90,'Home'),0);
  assert.equal(scoreForKey(10,'End'),100);
  assert.equal(scoreForKey(100,'ArrowUp'),100);
  assert.equal(scoreForKey(0,'ArrowLeft'),0);
  assert.equal(scoreForKey(50,'Tab'),null);
});
