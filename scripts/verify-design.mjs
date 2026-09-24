// Runs the Impeccable slop detector over the given UI paths and requires zero findings.
// A known-bad fixture runs first as a positive control, so silence can't mean a broken detector.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail, root, run } from './lib.mjs';

const detector = process.env.IMPECCABLE_BIN ?? join(homedir(), '.claude/skills/impeccable/scripts/impeccable');
const targets = process.argv.slice(2);
if (!targets.length) fail('usage: verify-design.mjs <paths...>');

function detect(paths) {
  const r = run(detector, ['detect', '--json', ...paths], { cwd: root });
  const start = r.out.indexOf('[');
  if (start < 0) fail(`detector produced no JSON:\n${r.out}`);
  try {
    return JSON.parse(r.out.slice(start));
  } catch {
    fail(`detector output was not JSON:\n${r.out}`);
  }
}

const dir = mkdtempSync(join(tmpdir(), 'nook-slop-'));
writeFileSync(
  join(dir, 'bad.tsx'),
  `export default function Bad() {
  return <h1 className="bg-gradient-to-r from-purple-500 to-cyan-400 bg-clip-text text-transparent animate-pulse">Supercharge</h1>;
}\n`,
);
const control = detect([dir]);
rmSync(dir, { recursive: true, force: true });
if (!control.length) fail('positive control produced no findings: the detector is not working');
console.log(`control: ${control.length} finding(s) on the known-bad fixture`);

const findings = detect(targets);
if (findings.length) fail(`detector findings:\n${JSON.stringify(findings, null, 2)}`);
console.log(`targets: 0 findings across ${targets.length} path(s)`);
console.log('DESIGN_OK');
