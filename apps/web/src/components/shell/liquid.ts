/*
 * The paint as liquid, drawn every frame on the GPU (see paint.ts for the pour it draws).
 *
 * One fragment shader, one full-screen triangle. The paint is a signed distance field in CSS
 * pixels: the band between its front and its back edge, and each drip, a cone from a swell at the
 * front down to a neck and a bulb at its end, smoothly joined to the band, so where they meet the
 * paint flows into itself rather than touching. The bulbs pulse, the drips sway, the front's bulges
 * travel along it, and a drip that lets go sheds its bulb as a drop that necks off and falls. Near
 * its edge the field is read as the height of a bead of paint: lit from the top-left, with a darker
 * lip where it meets the screen and a highlight that moves as the shape does.
 *
 * `pour` and `wobble` are paint.ts's, written again in GLSL; the back edge of the paint always sits
 * `COVER` px or more above the edge the room is uncovered to, so the room never shows a seam.
 *
 * It is drawn in a worker, on an OffscreenCanvas, from the same clock as the room's uncovering: the
 * browser runs that clip on the compositor, so with the paint off the main thread too, the pour
 * keeps moving while the new room's own work (its first renders, its data arriving) holds the page
 * up. The paint is drawn a frame behind the clip, so it can only ever cover more of the room, never
 * run ahead of it and open a gap.
 */

import type { PourPlan } from "./paint";

const MAX_DRIPS = 10;
/** How far the paint's back edge reaches over the uncovered room, at the least. */
const COVER = 14;

const VERTEX = `
attribute vec2 aAt;
void main() { gl_Position = vec4(aAt, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
#define MAXD ${MAX_DRIPS}
uniform vec2 uSize;
uniform float uRes;
uniform float uT;
uniform float uSlope;
uniform float uBand;
uniform float uWave;
uniform float uY0;
uniform float uY1;
uniform vec3 uLen;
uniform vec3 uPhase;
uniform vec4 uDrip[MAXD];
uniform vec4 uMore[MAXD];
uniform int uCount;
uniform float uReach;
uniform float uCheap;
uniform vec3 uPaint;
uniform vec3 uRim;
uniform vec3 uGloss;

float pour(float t) { return (1.0 - cos(3.14159265 * t)) / 2.0; }

float wob(float x, float calm) {
  return uWave * calm * (
    sin(6.2831853 * x / uLen.x + uPhase.x + uT * 5.2) +
    0.55 * sin(6.2831853 * x / uLen.y + uPhase.y - uT * 7.4) +
    0.25 * sin(6.2831853 * x / uLen.z + uPhase.z + uT * 11.0));
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float circle(vec2 p, vec2 c, float r) { return length(p - c) - r; }

// A cone between two circles, rounded at both ends (Inigo Quilez's round cone).
float roundCone(vec2 p, vec2 a, vec2 b, float r1, float r2) {
  vec2 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec2 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec2 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

float field(vec2 q) {
  float p = pour(uT);
  float base = mix(uY0, uY1, p);
  float x = q.x;
  // The front, with bulges that travel along it; the back edge, blobby too, above the room's.
  float front = base - uSlope * x + wob(x, 1.0) + 9.0 * sin(x / 53.0 - uT * 6.0) * sin(x / 131.0 + uT * 3.0);
  float reveal = base - uBand - uSlope * x + wob(x, 0.6);
  float back = reveal - ${COVER.toFixed(1)} - 8.0 * (0.5 + 0.5 * sin(x / 41.0 + uT * 9.0));
  float d = max(q.y - front, back - q.y) / 1.18;
  // Drips hang below the front: anything above the paint's back edge, or further below the front
  // than any drip and its drop can reach, is decided by the band alone.
  if (q.y < back - 30.0 || q.y > front + uReach) return d;
  for (int i = 0; i < MAXD; i++) {
    if (i >= uCount) break;
    vec4 a = uDrip[i];
    vec4 b = uMore[i];
    // Only the drips in this column (their width, sway and the join's reach).
    if (abs(q.x - a.x) > a.y * 2.2 + b.w + 20.0) continue;
    float run = a.z * smoothstep(0.0, 1.0, clamp((p - a.w) / (1.0 - a.w) / 0.7, 0.0, 1.0));
    if (run < 2.0) continue;
    float w = a.y;
    float top = base - uSlope * a.x + wob(a.x, 1.0);
    // Let go: from its release the bulb thins out of the drip and falls away as a drop.
    float gone = clamp((p - b.y) / 0.26, 0.0, 1.0);
    float bulb = w * (1.12 + 0.16 * sin(uT * 17.0 + b.x)) * (1.0 - 0.4 * gone);
    float neck = w * (0.5 + 0.12 * sin(uT * 11.0 + b.x * 1.7));
    float sway = b.w * sin(uT * 4.0 + b.x);
    vec2 root = vec2(a.x, top - 4.0);
    vec2 tip = vec2(a.x + sway, top + run - bulb);
    float drip = roundCone(q, root, tip, w * 1.3, neck);
    drip = smin(drip, circle(q, tip, bulb), w * 0.9);
    d = smin(d, drip, 16.0);
    if (gone > 0.0) {
      float fall = gone * gone * 150.0 + gone * 20.0;
      float drop = circle(q, tip + vec2(sway * 0.5, bulb * 0.7 + fall), w * 0.85 * (1.0 - 0.25 * gone));
      d = smin(d, drop, max(0.001, 10.0 * (1.0 - gone)));
    }
  }
  return d;
}

void main() {
  vec2 q = vec2(gl_FragCoord.x, uSize.y * uRes - gl_FragCoord.y) / uRes;
  float d = field(q);
  if (d > 1.5) { gl_FragColor = vec4(0.0); return; }
  float alpha = clamp(0.5 - d, 0.0, 1.0);
  vec3 col = uPaint;
  if (uCheap > 0.5) {
    // Drawn in software: the lip and a highlight from the distance alone, without the slope.
    float lip = smoothstep(0.0, 5.0, -d);
    float shine = smoothstep(7.0, 10.0, -d) * (1.0 - smoothstep(10.0, 15.0, -d));
    col = mix(mix(uRim, uPaint, lip), uGloss, shine * 0.55);
  } else if (d > -26.0) {
    // A bead of paint: steep at its edge, flat inside; its slope is the field's own.
    vec2 g = vec2(field(q + vec2(1.0, 0.0)) - field(q - vec2(1.0, 0.0)), field(q + vec2(0.0, 1.0)) - field(q - vec2(0.0, 1.0))) * 0.5;
    float edge = 1.0 - smoothstep(0.0, 22.0, -d);
    vec3 n = normalize(vec3(g * edge * 2.4, 1.0));
    vec3 light = normalize(vec3(-0.45, -0.7, 0.75));
    float diff = clamp(dot(n, light), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 42.0);
    col = mix(uRim, uPaint, smoothstep(0.0, 5.0, -d));
    col *= 0.86 + 0.22 * diff;
    col = mix(col, uGloss, clamp(spec * 0.9, 0.0, 1.0));
  }
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const rgb = (css: string): [number, number, number] => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
  return [r! / 255, g! / 255, b! / 255];
};

/** The colours as the page resolves them now (light or dark), read off a probe. */
function resolve(colours: { paint: string; rim: string; gloss: string }) {
  const probe = document.createElement("span");
  document.body.append(probe);
  const read = (c: string) => {
    probe.style.color = c;
    return rgb(getComputedStyle(probe).color);
  };
  const out = { paint: read(colours.paint), rim: read(colours.rim), gloss: read(colours.gloss) };
  probe.remove();
  return out;
}

/*
 * The worker: sets the shader up on the canvas it is handed, draws nothing until it is told when the
 * pour started, then draws every frame from its own clock until the pour is done. One worker serves
 * every pour; each brings a new canvas.
 */
const WORKER = `
const VERTEX = ${JSON.stringify(VERTEX)};
const FRAGMENT = ${JSON.stringify(FRAGMENT)};
const MAX_DRIPS = ${MAX_DRIPS};
// A frame behind the room's clip, so the paint never runs ahead of the edge it covers.
const LAG = 18;
let gl = null, time = null, start = null, duration = 820, frame = 0;
const now = () => performance.timeOrigin + performance.now();
function setup(m) {
  const canvas = m.canvas;
  gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return false;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  // With no GPU (WebGL drawn by the CPU), a third of the resolution, lit from the distance alone.
  const cheap = /swiftshader|llvmpipe|software|softpipe/i.test(renderer);
  const res = m.dpr * (cheap ? 0.34 : 0.6);
  canvas.width = Math.round(m.plan.width * res);
  canvas.height = Math.round(m.plan.height * res);
  const shader = (kind, source) => { const s = gl.createShader(kind); gl.shaderSource(s, source); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return false;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'aAt');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (name) => gl.getUniformLocation(program, name);
  const p = m.plan;
  const drips = p.drips.slice(0, MAX_DRIPS);
  gl.uniform2f(u('uSize'), p.width, p.height);
  gl.uniform1f(u('uRes'), res);
  gl.uniform1f(u('uSlope'), p.slope);
  gl.uniform1f(u('uBand'), p.band);
  gl.uniform1f(u('uWave'), p.wave);
  gl.uniform1f(u('uY0'), p.y0);
  gl.uniform1f(u('uY1'), p.y1);
  gl.uniform3f(u('uLen'), p.lengths[0], p.lengths[1], p.lengths[2]);
  gl.uniform3f(u('uPhase'), p.phase[0], p.phase[1], p.phase[2]);
  const pack = (f, empty) => new Float32Array(Array.from({ length: MAX_DRIPS }, (_, i) => (drips[i] ? f(drips[i]) : empty)).flat());
  gl.uniform4fv(u('uDrip'), pack((d) => [d.x, d.w, d.length, d.from], [0, 0, 0, 1]));
  gl.uniform4fv(u('uMore'), pack((d) => [d.phase, d.release, 0, d.sway], [0, 2, 0, 0]));
  gl.uniform1i(u('uCount'), drips.length);
  // The furthest below the front paint can be: the longest drip, its bulb and a drop's whole fall.
  gl.uniform1f(u('uReach'), drips.reduce((m, d) => Math.max(m, d.length + d.w * 3), 0) + 240);
  gl.uniform1f(u('uCheap'), cheap ? 1 : 0);
  gl.uniform3f(u('uPaint'), ...m.colours.paint);
  gl.uniform3f(u('uRim'), ...m.colours.rim);
  gl.uniform3f(u('uGloss'), ...m.colours.gloss);
  time = u('uT');
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  return true;
}
function draw(t) {
  if (!gl) return;
  gl.uniform1f(time, Math.min(1, Math.max(0, t)));
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function loop() {
  frame = requestAnimationFrame(() => {
    if (start === null) return;
    const t = (now() - start - LAG) / duration;
    draw(t);
    if (t < 1) loop();
  });
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    cancelAnimationFrame(frame);
    start = null;
    const ok = setup(m);
    if (ok) draw(0);
    self.postMessage({ type: ok ? 'ready' : 'failed' });
  } else if (m.type === 'start') {
    start = m.at;
    duration = m.duration;
    loop();
  } else if (m.type === 'hold') {
    // Held at a moment (the checks freeze the pour to read it): drawn there, and the clock stopped.
    cancelAnimationFrame(frame);
    start = null;
    draw(m.t - LAG / duration);
  } else if (m.type === 'stop') {
    cancelAnimationFrame(frame);
    start = null;
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    gl = null;
  }
};
`;

let worker: Worker | null = null;
let supported: boolean | null = null;

/** Whether this browser can draw the liquid: WebGL in a worker, on a canvas handed to it. */
function canPour(canvas: HTMLCanvasElement) {
  if (supported === null) {
    supported =
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      "transferControlToOffscreen" in canvas &&
      !!new OffscreenCanvas(1, 1).getContext("webgl");
  }
  return supported;
}

export interface Liquid {
  /** The pour started at `epochMs` (performance.timeOrigin + the document timeline's time). */
  start(epochMs: number, durationMs: number): void;
  /** Stops the paint's clock and draws it at `t` (0 to 1 of the pour). */
  hold(t: number): void;
  dispose(): void;
}

/** Hands `canvas` to the paint's worker for this pour, or null where the liquid cannot be drawn. */
export function liquidPaint(
  canvas: HTMLCanvasElement,
  plan: PourPlan,
  colours: { paint: string; rim: string; gloss: string },
): Liquid | null {
  if (!canPour(canvas)) return null;
  try {
    worker ??= new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
  } catch {
    supported = false;
    return null;
  }
  const w = worker;
  const offscreen = canvas.transferControlToOffscreen();
  w.postMessage({ type: "init", canvas: offscreen, plan, colours: resolve(colours), dpr: Math.min(window.devicePixelRatio || 1, 1.5) }, [
    offscreen,
  ]);
  return {
    start: (at, duration) => w.postMessage({ type: "start", at, duration }),
    hold: (t) => w.postMessage({ type: "hold", t }),
    dispose: () => w.postMessage({ type: "stop" }),
  };
}
