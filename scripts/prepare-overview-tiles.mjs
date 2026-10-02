// Optional asset preparation, never run in an HTTP handler or during startup.
// Original EOX images, unchanged. Attribution and licence accompany the assets.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SATELLITE_ROOT } from '../lib/satellite-tiles.ts';

const jobs=[];
for(let z=0;z<=3;z++) for(let y=0;y<2**z;y++) for(let x=0;x<2**z;x++) jobs.push({z,x,y});
let bytes=0;
await Promise.all(Array.from({length:4},async()=>{
  while(jobs.length){
    const {z,x,y}=jobs.shift();
    const folder=new URL(`../public/imagery/2024/${z}/${y}/`,import.meta.url);
    const target=new URL(`${x}.jpg`,folder);
    const existing=await readFile(target).catch(()=>null);
    if(existing){bytes+=existing.byteLength;continue;}
    const response=await fetch(`${SATELLITE_ROOT}/${z}/${y}/${x}.jpg`,{signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error(`EOX returned ${response.status} for ${z}/${y}/${x}`);
    const data=new Uint8Array(await response.arrayBuffer());
    // EOX returns tiny PNG no-data tiles for some polar .jpg URLs.
    const jpeg=data[0]===255 && data[1]===216;
    const png=data[0]===137 && data[1]===80 && data[2]===78 && data[3]===71;
    if(!jpeg && !png) throw new Error(`Expected an image tile at ${z}/${y}/${x}`);
    await mkdir(folder,{recursive:true});
    await writeFile(target,data);bytes+=data.byteLength;
  }
}));
console.log(`85 overview tiles ready, ${bytes} bytes in total.`);
