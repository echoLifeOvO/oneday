"use client";
import { useEffect, useRef, useState } from "react";

// Six generated poses form a small texture atlas. WebGL bends the body, belly
// and wiping hand independently; no map renderer or full 3D engine is involved.
const vertex = `
attribute vec2 a_position;
varying vec2 v_uv;
uniform float u_time;
uniform float u_score;
uniform float u_motion;
void main() {
  v_uv = a_position;
  vec2 p = a_position;
  float laugh = smoothstep(78.0, 100.0, u_score) * u_motion;
  float cry = (1.0 - smoothstep(12.0, 30.0, u_score)) * u_motion;
  float belly = exp(-pow((p.y-.65)*5.0,2.0));
  float head = 1.0-smoothstep(.38,.68,p.y);
  p.x += (p.x-.5)*sin(u_time*11.0)*.05*belly*laugh;
  p.y += sin(u_time*11.0)*.018*(1.0-p.y)*laugh;
  p.x += sin(u_time*2.0)*.006*head*u_motion;
  float hand = exp(-dot((p-vec2(.34,.37))*vec2(8.0,9.0),(p-vec2(.34,.37))*vec2(8.0,9.0)));
  p.y += sin(u_time*3.5)*.025*hand*cry;
  p.x += sin(u_time*3.5)*.014*hand*cry;
  p.y += sin(u_time*2.2)*.004*(1.0-p.y)*u_motion;
  gl_Position=vec4((p.x*2.0-1.0)*.95,(1.0-p.y*2.0)*.95,0.,1.);
}`;
const fragment = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_atlas;
uniform float u_from;
uniform float u_to;
uniform float u_mix;
vec4 pose(float cell) {
  vec2 inset=clamp(v_uv,vec2(.002),vec2(.998));
  vec2 uv=(inset+vec2(mod(cell,3.0),floor(cell/3.0)))/vec2(3.,2.);
  return texture2D(u_atlas,uv);
}
void main(){ gl_FragColor=mix(pose(u_from),pose(u_to),u_mix); }
`;
function poseFor(score: number) { return score < 18 ? 0 : score < 42 ? 1 : score < 60 ? 2 : score < 76 ? 3 : score < 90 ? 4 : 5; }
export default function MoodCharacter({ score }: { score: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(score); target.current = score;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = canvas.current!;
    const gl = element.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) return;
    let stopped = false, frame = 0;
    const program = gl.createProgram()!;
    const shaders: WebGLShader[] = [];
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type)!; shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return;
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const vertices: number[] = [];
    const side = 24;
    for (let y=0; y<side; y++) for (let x=0; x<side; x++) {
      for (const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) vertices.push((x+dx)/side,(y+dy)/side);
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program,"a_position");
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    const uniforms = Object.fromEntries(["u_time","u_score","u_motion","u_from","u_to","u_mix"].map(name=>[name,gl.getUniformLocation(program,name)]));
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    const image = new Image();
    let loaded=false, pose=poseFor(target.current), previous=pose, changed=0, lastDraw=0;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    // Layout is measured only when the character actually resizes, not after
    // every slider update. Cap this decorative canvas independently of input.
    const resize = () => {
      const dpr=Math.min(window.devicePixelRatio||1,1.5);
      const size=Math.max(1,Math.round(element.clientWidth*dpr));
      if(element.width!==size){element.width=size;element.height=size;gl.viewport(0,0,size,size);}
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const draw=(now:number)=>{
      if(stopped) return;
      if(loaded && !document.hidden && now-lastDraw>=1000/30) {
        lastDraw=now;
        const next=poseFor(target.current);
        if(next!==pose){previous=pose;pose=next;changed=now;}
        gl.uniform1f(uniforms.u_time,now/1000);
        gl.uniform1f(uniforms.u_score,target.current);
        gl.uniform1f(uniforms.u_motion,reduced.matches?0:1);
        gl.uniform1f(uniforms.u_from,previous);
        gl.uniform1f(uniforms.u_to,pose);
        gl.uniform1f(uniforms.u_mix,reduced.matches?1:Math.min(1,(now-changed)/180));
        gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES,0,vertices.length/2);
      }
      frame=requestAnimationFrame(draw);
    };
    image.onload=()=>{
      if(stopped) return;
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      loaded=true;setReady(true);frame=requestAnimationFrame(draw);
    };
    image.src="/character/nailong-moods.png";
    const lost=()=>{setReady(false);cancelAnimationFrame(frame);};
    element.addEventListener("webglcontextlost",lost);
    return()=>{stopped=true;observer.disconnect();cancelAnimationFrame(frame);image.onload=null;element.removeEventListener("webglcontextlost",lost);gl.deleteTexture(texture);gl.deleteBuffer(buffer);shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);};
  },[]);
  const pose=poseFor(score);
  return <div className="mood-character" aria-hidden="true" data-renderer={ready?"webgl":"image"}>
    {!ready && <div className="character-fallback" style={{backgroundPosition:`${pose%3*50}% ${Math.floor(pose/3)*100}%`}}/>}
    <canvas ref={canvas} style={{opacity:ready?1:0}}/>
  </div>;
}
