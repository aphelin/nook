// Polish G9: the whole Playwright browser suite against the production Docker stack through nginx
// on :8080 (two api replicas, the worker; brought up by scripts/verify-stack-up.mjs with sign-ups
// raised), from cleared rate-limit counters. The new choose-a-face test must be among what ran.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail, run } from './lib.mjs';

const BASE = 'http://localhost:8080';
const health = await fetch(`${BASE}/api/health`).catch(() => null);
if (!health || health.status !== 200) fail(`the stack is not answering on ${BASE}; run scripts/verify-stack-up.mjs first`);
const cleared = run('docker', ['compose', 'exec', '-T', 'redis', 'sh', '-c', "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli DEL"]);
if (cleared.status !== 0) fail(`could not reset rate-limit keys:\n${cleared.out}`);

const e2e = run('pnpm', ['exec', 'playwright', 'test'], { env: { ...process.env, E2E_BASE_URL: BASE } });
const report = join(tmpdir(), 'nook-polish-browser-suite.log');
writeFileSync(report, e2e.out);
console.log(`full report: ${report}`);
const passed = e2e.out.match(/(\d+) passed/);
if (e2e.status !== 0 || !passed || /\d+ (failed|flaky)/.test(e2e.out)) fail(`browser suite failed:\n${e2e.out.slice(-5000)}`);
if (!/choosing a face reaches a teammate live/.test(e2e.out)) fail('the choose-a-face test did not run');
console.log(`browser suite: ${passed[1]} passed against the stack`);
console.log('E2E_STACK_OK');
