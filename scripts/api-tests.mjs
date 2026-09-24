// Runs the api unit + e2e suites against the compose Postgres/Redis on an isolated test database,
// then checks the verbose report names every required topic.
import { join } from 'node:path';
import { fail, root, run } from './lib.mjs';

export function runApiTests(requiredTopics) {
  const api = join(root, 'apps/api');
  const env = {
    ...process.env,
    DATABASE_URL: 'postgresql://nook:nook@localhost:5432/nook_test',
    REDIS_URL: 'redis://localhost:6379/1',
    JWT_SECRET: 'test-secret-0123456789abcdef0123456789',
  };

  const up = run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis', 'storage']);
  if (up.status !== 0) fail(`could not start postgres/redis/storage:\n${up.out}`);

  const exists = run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'nook', '-tAc', "SELECT 1 FROM pg_database WHERE datname='nook_test'"]);
  if (exists.out.trim() !== '1') {
    const created = run('docker', ['compose', 'exec', '-T', 'postgres', 'createdb', '-U', 'nook', 'nook_test']);
    if (created.status !== 0) fail(`createdb failed:\n${created.out}`);
  }

  const migrate = run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd: api, env });
  if (migrate.status !== 0) fail(`migrate failed:\n${migrate.out}`);

  const unit = run('pnpm', ['-s', 'test', '--reporter=verbose'], { cwd: api, env });
  const unitPassed = unit.out.match(/Tests\s+(\d+) passed/);
  if (unit.status !== 0 || !unitPassed || /\d+ failed/.test(unit.out)) fail(`unit tests failed:\n${unit.out.slice(-4000)}`);
  console.log(`unit: ${unitPassed[1]} passed`);

  const e2e = run('pnpm', ['-s', 'test:e2e', '--reporter=verbose'], { cwd: api, env });
  const e2ePassed = e2e.out.match(/Tests\s+(\d+) passed/);
  if (e2e.status !== 0 || !e2ePassed || /\d+ failed/.test(e2e.out)) fail(`e2e tests failed:\n${e2e.out.slice(-4000)}`);
  console.log(`e2e: ${e2ePassed[1]} passed`);

  // Topics may be covered by either suite (e.g. the SSRF guard is unit-tested).
  const report = `${unit.out}\n${e2e.out}`;
  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const missing = requiredTopics.filter((t) => !new RegExp(escape(t), 'i').test(report));
  if (missing.length) fail(`no e2e test covers: ${missing.join(', ')}`);
}
