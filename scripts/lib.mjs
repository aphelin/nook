import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function fail(msg) {
  console.error(`FAIL: ${msg}`);
  // A browser this check launched would outlive an exit from the middle of it: take it down too.
  spawnSync('pkill', ['-KILL', '-P', String(process.pid)]);
  process.exit(1);
}

/** Run a command, returning { status, out }. Never throws. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

export function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
}

/**
 * Clears the dev api's demo sign-in counter (20 per 10 minutes per address), so a run of browser
 * checks that each sign in as the demo member is not turned away half-way. Local stacks only: it
 * talks to the compose stack's Redis, and does nothing if that container is not there.
 */
export function clearDemoLimit() {
  clearLimit('demo');
}

/** The same for another of the dev api's counters by name (register: 10 new accounts an hour per address). */
export function clearLimit(name) {
  run('docker', ['exec', 'nook-redis-1', 'sh', '-c', `redis-cli --scan --pattern 'rl:${name}:*' | xargs -r redis-cli del`]);
}
