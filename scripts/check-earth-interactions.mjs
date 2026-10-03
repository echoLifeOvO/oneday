// Optional browser regression; API responses are fixtures and never write to PG.
// Start the app first, then set PLAYWRIGHT_MODULE if Playwright is installed elsewhere.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const places = JSON.parse(readFileSync(new URL('../lib/places.json', import.meta.url), 'utf8'));
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
const browser=await chromium.launch({...(existsSync(chrome) ? { executablePath: chrome } : {}),headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try {
for(const config of [{width:390,height:844},{width:1280,height:800},{width:390,height:844,broad:true}]) {
const {broad,...viewport}=config;
const context=await browser.newContext({viewport,hasTouch:true,isMobile:viewport.width<500,reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const place=broad ? {id:'osm-R-beijing-test',name:'北京市',englishName:'Beijing',region:'北京市',country:'中国',countryCode:'CN',center:[116.4,39.9],bounds:[115.4,39.4,117.5,41.1],aliases:'北京',sourceShapeId:'',origin:'photon'} : places.find(p=>p.id==='dali');
const diary={id:'test-dali',placeId:place.id,nickname:'测试',date:'2026-10-03',body:'本地交互回归数据',cost:20,currency:'CNY',score:80,comments:[]};
await page.route('**/api/**',async route=>{
const path=new URL(route.request().url()).pathname;
let data={};
if(path==='/api/view-origin')data={center:place.center};
if(path==='/api/discovery')data={mode:'database',places:[{place,stats:{count:1,minScore:80,maxScore:80,costs:[]}}],nextCursor:null};
if(path==='/api/stream')data={mode:'database',diaries:[{...diary,place}]};
if(path==='/api/diaries/test-dali')data={diary};
if(path==='/api/diaries')data={diaries:[diary],nextCursor:null};
if(path.endsWith('/comments'))data={comments:[],nextCursor:null};
await route.fulfill({json:data});
});
await page.goto(process.env.EARTH_TEST_URL || 'http://127.0.0.1:3107');
await page.waitForFunction(()=>document.querySelector('.earth-canvas')?.dataset.litRegionCount==='1');
await page.waitForFunction(()=>document.querySelector('.earth-canvas')?.dataset.origin==='ip');
if(broad) await page.waitForFunction(()=>document.querySelector('.earth-canvas')?.dataset.resolvedRegionCount==='1');
await page.waitForTimeout(700);
const canvas=page.locator('.earth-canvas canvas');
const box=await canvas.boundingBox();
// Read the existing React map ref for projection and halo sampling. No product test hook.
await page.locator('.earth-canvas').evaluate(el=>{
let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
while(fiber){let h=fiber.memoizedState;while(h){if(h.memoizedState?.current?.queryRenderedFeatures){window.earthTestMap=h.memoizedState.current;return;}h=h.next;}fiber=fiber.return;}
throw new Error('map ref missing');
});
// Network delivery can finish after the layers are added; await worker geometry.
await page.waitForFunction(()=>['regions','glow-wide','glow-near','glow-local'].every(id=>window.earthTestMap.isSourceLoaded(id)));
const tap=async()=>{const point=await page.evaluate(center=>window.earthTestMap.project(center),place.center);await page.touchscreen.tap(box.x+point.x,box.y+point.y);};

await tap();
await page.waitForFunction(()=>document.querySelector('.experience')?.classList.contains('has-place'));
await page.waitForTimeout(500);
const focused=await page.locator('.earth-canvas').evaluate(e=>({...e.dataset}));
console.log('focused', viewport.width, broad ? 'Beijing' : 'Dali', focused.zoom);
assert.ok(Number(focused.zoom)<9.01);
if(broad)assert.ok(Number(focused.zoom)<7,'broad phone region must exercise opening below zoom 7');
const span=await page.evaluate(bounds=>{const m=window.earthTestMap;const a=m.project([bounds[0],bounds[1]]),b=m.project([bounds[2],bounds[3]]);return {x:Math.abs(a.x-b.x)/m.getContainer().clientWidth,y:Math.abs(a.y-b.y)/m.getContainer().clientHeight};},place.bounds);
assert.ok(span.x<=.41&&span.y<=.41,JSON.stringify(span));
console.log('bounds viewport fraction',span);
await tap();
await page.waitForFunction(()=>document.querySelector('.experience')?.classList.contains('reading'));
console.log('second tap opened',viewport.width,broad?'broad':'local');
await page.keyboard.press('Escape');
await page.waitForFunction(()=>document.querySelector('.earth-canvas')?.dataset.paused==='false');
// Check the missed high-zoom halo separately from the exact region outline.
if(!broad){
await page.evaluate(()=>window.earthTestMap.jumpTo({zoom:9.5}));
await page.waitForTimeout(500);
const halo=await page.evaluate(id=>{const m=window.earthTestMap;for(let y=50;y<m.getContainer().clientHeight-80;y+=4)for(let x=20;x<m.getContainer().clientWidth-20;x+=4){const exact=m.queryRenderedFeatures([x,y],{layers:['region-fill']});if(exact.some(f=>f.properties.id===id))continue;const local=m.queryRenderedFeatures([x,y],{layers:['glow-local-fill']});if(local.some(f=>(typeof f.properties.placeIds==='string'?JSON.parse(f.properties.placeIds):f.properties.placeIds).includes(id)))return {x,y};}return null;},place.id);
assert.ok(halo,'local glow has a visible area outside the exact outline');
await page.touchscreen.tap(box.x+halo.x,box.y+halo.y);
await page.waitForFunction(()=>document.querySelector('.experience')?.classList.contains('reading'));
console.log('local halo tap opened',halo);
await page.keyboard.press('Escape');
await page.waitForFunction(()=>document.querySelector('.earth-canvas')?.dataset.paused==='false');
}
// A realistic 5px finger wobble is still a tap, not a drag.
const point=await page.evaluate(center=>window.earthTestMap.project(center),place.center);
const session=await context.newCDPSession(page);
await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+point.x,y:box.y+point.y}]});
await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+point.x+5,y:box.y+point.y}]});
await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForFunction(()=>document.querySelector('.experience')?.classList.contains('reading'));
console.log('5px finger wobble opened');
await page.keyboard.press('Escape');
await page.waitForFunction(()=>document.querySelector('.earth-canvas')?.dataset.paused==='false');
await page.mouse.move(box.x+point.x,box.y+point.y);await page.mouse.down();await page.mouse.move(box.x+point.x+50,box.y+point.y,{steps:5});await page.mouse.up();await page.waitForTimeout(200);assert.equal(await page.locator('.experience').evaluate(e=>e.classList.contains('reading')),false);console.log('drag did not open');
await page.locator('[data-diary-id="test-dali"]').click();await page.waitForFunction(()=>document.querySelector('.experience')?.classList.contains('reading'));assert.ok((await page.locator('[role=dialog]').innerText()).includes(diary.body));console.log('stream opened requested diary');


assert.deepEqual(errors,[]);
await context.close();
}
}finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
