// A second, throwaway copy of the stack, started exactly as the README says, from a fresh clone of HEAD.
//
//   node scripts/fresh-stack.mjs up     clone HEAD, stop the main stack, `docker compose up -d --build`
//   node scripts/fresh-stack.mjs down   remove the copy and its volumes, start the main stack again
//
// The copy runs as its own compose project (nook-fresh), so its database, Redis and bucket are brand
// new and freshly seeded; the main stack's volumes are never touched. Both publish the same host
// ports, so the main stack is stopped (not removed) while the copy runs.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, root, run } from './lib.mjs';

export const PROJECT = 'nook-fresh';
export const BASE = 'http://localhost:8080';
const clone = join(tmpdir(), 'nook-fresh-clone');
const step = (m) => console.log(`• ${m}`);

export async function up() {
  const head = run('git', ['rev-parse', '--short', 'HEAD']).out.trim();
  step(`cloning HEAD (${head}) into ${clone}`);
  rmSync(clone, { recursive: true, force: true });
  mkdirSync(clone, { recursive: true });
  const cloned = run('git', ['clone', '--quiet', root, clone]);
  if (cloned.status !== 0) fail(`git clone failed:\n${cloned.out}`);

  step('stopping the main stack (its volumes stay)');
  const stop = run('docker', ['compose', 'stop']);
  if (stop.status !== 0) fail(`could not stop the main stack:\n${stop.out}`);

  // The README's one command, plus --wait so a script knows when it's done and -p to keep it apart.
  step('docker compose up -d --build, in the clone');
  const started = run('docker', ['compose', '-p', PROJECT, 'up', '-d', '--build', '--wait', '--wait-timeout', '600'], {
    cwd: clone,
    env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' },
  });
  if (started.status !== 0) {
    const out = started.out.slice(-3000);
    await down();
    fail(`fresh stack did not come up:\n${out}`);
  }
  // A just-started stack answers its first page loads slowly.
  for (const path of ['/', '/login', '/app', '/api/health']) {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${BASE}${path}`, { redirect: 'manual' }).catch(() => null);
      if (res && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return clone;
}

export async function down() {
  step('removing the fresh stack and its volumes');
  const composeDir = existsSync(join(clone, 'docker-compose.yml')) ? clone : root;
  run('docker', ['compose', '-p', PROJECT, 'down', '-v', '--remove-orphans'], { cwd: composeDir });
  rmSync(clone, { recursive: true, force: true });
  step('starting the main stack again');
  const restarted = run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '300']);
  if (restarted.status !== 0) fail(`main stack did not come back:\n${restarted.out.slice(-2000)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === 'up') await up();
  else if (cmd === 'down') await down();
  else fail('usage: fresh-stack.mjs up|down');
}
