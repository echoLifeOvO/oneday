import test from 'node:test';
import assert from 'node:assert/strict';
import { viewOrigin } from '../lib/view-origin.ts';
test('IP view retains coarse orientation only, without raw IP or device location',()=>{
  assert.deepEqual(viewOrigin(new Headers({'x-vercel-ip-latitude':'37.7749','x-vercel-ip-longitude':'-122.4194','x-real-ip':'192.0.2.1'})),{center:[-122,38]});
});
test('missing and invalid provider coordinates keep the default globe',()=>{
  for(const [lat,lng] of [[null,null],['',''],['NaN','1'],['Infinity','1'],['91','10'],['10','181']]) {
    const h=new Headers();if(lat!==null)h.set('x-vercel-ip-latitude',lat);if(lng!==null)h.set('x-vercel-ip-longitude',lng);
    assert.equal(viewOrigin(h),null);
  }
});
test('valid zero coordinates and high latitudes retain north-up overview limits',()=>{
  assert.deepEqual(viewOrigin(new Headers({'x-vercel-ip-latitude':'0','x-vercel-ip-longitude':'0'})),{center:[0,0]});
  assert.deepEqual(viewOrigin(new Headers({'x-vercel-ip-latitude':'78.22','x-vercel-ip-longitude':'15.64'})),{center:[16,55]});
});
