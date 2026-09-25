// Polish G1: the people-shape catalogue. Every shape is measured in a real browser (isPointInFill on
// the actual path): a solid centred disc of 60% of the box for the initial, the outline inside the
// 40×40 box, and a rasterised overlap under 0.92 with every other shape, so no two read as one.
// The first eight must be byte-identical to the shipped ones, and every generated face (shape and
// colour from the handle) must come out exactly as it did before, checked against the shipped file
// in git. Positive controls prove the disc and overlap checks can fail.
//
//   node scripts/verify-faces.mjs [--sheet out.png]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { fail, root, run } from './lib.mjs';

const MIN_SHAPES = 20;
const MAX_OVERLAP = 0.92;
const DISC = 12; // 60% of the 40px box, as a diameter
const SHIPPED_REF = process.env.FACES_SHIPPED_REF ?? '78c59b9c9dc8'; // the initial commit, before chosen faces

const { SHAPES, generatedFace } = await import(pathToFileURL(join(root, 'apps/web/src/lib/faces.ts')).href);
const { FACE_SHAPES } = await import(pathToFileURL(join(root, 'packages/contracts/dist/index.js')).href);

const names = Object.keys(SHAPES);
if (names.length < MIN_SHAPES) fail(`only ${names.length} shapes; need at least ${MIN_SHAPES}`);
if (JSON.stringify(names) !== JSON.stringify([...FACE_SHAPES])) fail(`faces.ts shapes ${names.join(',')} do not match the contract's FACE_SHAPES ${FACE_SHAPES.join(',')}`);

// The shipped catalogue, straight from git.
const shipped = run('git', ['show', `${SHIPPED_REF}:apps/web/src/lib/faces.ts`]);
if (shipped.status !== 0) fail(`cannot read the shipped faces.ts at ${SHIPPED_REF}:\n${shipped.out}`);
const tmp = mkdtempSync(join(tmpdir(), 'faces-'));
writeFileSync(join(tmp, 'shipped-faces.ts'), shipped.out);
const old = await import(pathToFileURL(join(tmp, 'shipped-faces.ts')).href);
rmSync(tmp, { recursive: true, force: true });
if (old.SHAPES.length !== 8) fail(`expected 8 shipped shapes, found ${old.SHAPES.length}`);
old.SHAPES.forEach((d, i) => {
  if (SHAPES[names[i]] !== d) fail(`shipped shape ${i} (${names[i]}) changed`);
});
const handles = ['mara', 'jonas', 'priya', 'theo', 'sam', 'lena', 'aiko', 'dev', 'nook', 'a', 'zz_top'];
for (let i = 0; i < 400; i += 1) handles.push(`user_${i.toString(36)}_${(i * 7919).toString(36)}`);
for (const h of handles) {
  const before = old.faceFor(h);
  const now = generatedFace(h);
  if (SHAPES[now.shape] !== before.shape || now.tone !== before.tone) fail(`generated face for "${h}" changed`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<svg id="s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"></svg>');

/** Measures one path: bbox, whether the centre disc is solid, and an 80×80 fill mask. */
const measure = (d) =>
  page.evaluate(
    ({ d, disc }) => {
      const svg = document.getElementById('s');
      svg.innerHTML = '';
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.append(p);
      const pt = svg.createSVGPoint();
      const inside = (x, y) => {
        pt.x = x;
        pt.y = y;
        return p.isPointInFill(pt);
      };
      let holes = 0;
      for (let y = 20 - disc; y <= 20 + disc; y += 0.5)
        for (let x = 20 - disc; x <= 20 + disc; x += 0.5) if ((x - 20) ** 2 + (y - 20) ** 2 <= disc * disc && !inside(x, y)) holes += 1;
      const mask = [];
      for (let y = 0; y < 80; y += 1) for (let x = 0; x < 80; x += 1) mask.push(inside(x / 2 + 0.25, y / 2 + 0.25) ? 1 : 0);
      const b = p.getBBox();
      return { bbox: [b.x, b.y, b.x + b.width, b.y + b.height], holes, mask };
    },
    { d, disc: DISC },
  );

const overlap = (a, b) => {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i += 1) {
    both += a[i] & b[i];
    either += a[i] | b[i];
  }
  return both / either;
};

// Positive controls: a shape too small for the initial must show holes; a shape against itself overlaps 1.
const small = await measure('M20 9a11 11 0 1 1 0 22a11 11 0 1 1 0-22Z');
if (small.holes === 0) fail('control: the disc check did not catch a circle too small for the initial');
const circleAgain = await measure(SHAPES.circle);
const circle = await measure(SHAPES.circle);
if (overlap(circle.mask, circleAgain.mask) < 0.999) fail('control: the overlap check did not see a shape as itself');

const measured = {};
for (const name of names) {
  const m = await measure(SHAPES[name]);
  const [x0, y0, x1, y1] = m.bbox;
  // The shipped eight are frozen as they are (pebble already reaches 1.33 past the box); new shapes stay inside it.
  if (names.indexOf(name) >= 8 && (x0 < -0.01 || y0 < -0.01 || x1 > 40.01 || y1 > 40.01)) fail(`${name} leaves the box: ${m.bbox.map((v) => v.toFixed(2)).join(' ')}`);
  if (m.holes > 0) fail(`${name} has ${m.holes} holes in its centre disc; an initial would not fit`);
  measured[name] = m;
}
// Every pair with a new shape in it must be distinct; the shipped eight are frozen among themselves
// (circle and pebble already overlap a lot), so that pair is reported, not judged.
let closest = { a: '', b: '', v: 0 };
let shippedClosest = { a: '', b: '', v: 0 };
for (let i = 0; i < names.length; i += 1)
  for (let j = i + 1; j < names.length; j += 1) {
    const v = overlap(measured[names[i]].mask, measured[names[j]].mask);
    if (j < 8) {
      if (v > shippedClosest.v) shippedClosest = { a: names[i], b: names[j], v };
    } else if (v > closest.v) closest = { a: names[i], b: names[j], v };
  }
console.log(`shipped closest pair ${shippedClosest.a}/${shippedClosest.b} overlap=${shippedClosest.v.toFixed(3)} (frozen)`);
const report = names.map((n) => `${n}:${(measured[n].mask.reduce((s, v) => s + v, 0) / 6400).toFixed(2)}`).join(' ');
console.log(`shapes=${names.length} fill ${report}`);
console.log(`closest pair ${closest.a}/${closest.b} overlap=${closest.v.toFixed(3)}`);

const sheetAt = process.argv.indexOf('--sheet');
if (sheetAt > 0) {
  const cells = names
    .map((n) =>
      `<figure><svg viewBox="0 0 40 40" width="96" height="96"><path d="${SHAPES[n]}" fill="#1c476e"/><text x="20" y="21" dy="0.35em" text-anchor="middle" font-size="19" font-weight="800" fill="#f39539" font-family="sans-serif">M</text></svg>` +
      `<svg viewBox="0 0 40 40" width="24" height="24"><path d="${SHAPES[n]}" fill="#091825"/></svg><figcaption>${n}</figcaption></figure>`,
    )
    .join('');
  await page.setViewportSize({ width: 1180, height: 700 });
  await page.setContent(`<body style="margin:0;background:#f39539;font:600 13px sans-serif"><main style="display:flex;flex-wrap:wrap;gap:18px;padding:24px">${cells}</main><style>figure{margin:0;display:grid;gap:6px;justify-items:center}</style></body>`);
  await page.screenshot({ path: process.argv[sheetAt + 1], fullPage: true });
}
await browser.close();

if (closest.v >= MAX_OVERLAP) fail(`${closest.a} and ${closest.b} overlap ${closest.v.toFixed(3)}; they read as one shape`);
console.log('FACES_OK');
