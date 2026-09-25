// Polish G17: the seeded demo members wear eight different faces. Runs the (idempotent) seed, then
// reads the eight demo accounts straight from Postgres: every one has a stored face, the shapes are
// all different and all known to the contract, and a second seed run leaves them as they are.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, root, run } from './lib.mjs';

const { FACE_SHAPES } = await import(pathToFileURL(join(root, 'packages/contracts/dist/index.js')).href);
const seed = () => run('pnpm', ['--filter', '@nook/api', 'db:seed']);
const faces = () => {
  const q = run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'nook', '-d', 'nook', '-tAF', '|', '-c',
    `SELECT handle, "faceShape", "faceTone" FROM "User" WHERE email LIKE '%@nook.demo' ORDER BY handle`]);
  if (q.status !== 0) fail(`could not read the demo members:\n${q.out}`);
  return q.out.trim().split('\n').filter(Boolean).map((l) => l.split('|'));
};

const first = seed();
if (first.status !== 0 || !/seeded 8 people/.test(first.out)) fail(`seed failed:\n${first.out.slice(-2000)}`);
const rows = faces();
if (rows.length !== 8) fail(`expected 8 demo members, found ${rows.length}`);
const missing = rows.filter(([, shape, tone]) => !shape || !tone);
if (missing.length) fail(`demo members without a face: ${missing.map(([h]) => h).join(', ')}`);
const unknown = rows.filter(([, shape]) => !FACE_SHAPES.includes(shape));
if (unknown.length) fail(`demo members with an unknown shape: ${unknown.map(([h, s]) => `${h}=${s}`).join(', ')}`);
const shapes = new Set(rows.map(([, s]) => s));
if (shapes.size !== 8) fail(`demo members share shapes: ${rows.map(([h, s]) => `${h}=${s}`).join(', ')}`);

const again = seed();
if (again.status !== 0) fail(`second seed failed:\n${again.out.slice(-2000)}`);
if (JSON.stringify(faces()) !== JSON.stringify(rows)) fail('a second seed changed the demo faces');
console.log(`demo faces: ${rows.map(([h, s, t]) => `${h}=${s}/${t}`).join(' ')}`);
console.log('DEMO_FACES_OK');
