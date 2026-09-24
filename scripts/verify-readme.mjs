// Phase 13 G2: the README is complete and self-consistent.
// Every local link and image exists and is committed; screenshots are real images at their intended
// size; light/dark <picture> pairs match; GIFs are animated and within budget; nothing in docs/media is
// orphaned; the sections a reviewer needs are there. A broken fixture runs first as a positive control.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail, root, run } from './lib.mjs';

const MB = 1024 * 1024;
const GIF_MAX = 5 * MB;
const MEDIA_MAX = 20 * MB;
/** Intended pixel sizes: [width, height], or a minimum width for strips and GIFs. */
const SIZES = {
  'shell-light.png': [1440, 900],
  'shell-dark.png': [1440, 900],
  'architecture-light.png': [2400, 1880],
  'architecture-dark.png': [2400, 1880],
};
const MIN_WIDTH = 800;
const SECTIONS = [
  'Run it',
  'See it move',
  'Architecture',
  'Auth',
  'Realtime',
  'Presence and typing',
  'Threads and reactions',
  'Uploads and link previews',
  'Mentions, unread and notifications',
  'Search and Cmd+K',
  'Profiles',
  'Design',
  'Nooks, channels, invites',
  'Develop',
  'Layout',
];

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=codec_name,width,height,nb_read_frames', '-show_entries', 'format=duration', '-of', 'json', file]);
  if (r.status !== 0) return null;
  const j = JSON.parse(r.out);
  const s = j.streams?.[0];
  return s ? { codec: s.codec_name, width: s.width, height: s.height, frames: Number(s.nb_read_frames), duration: Number(j.format?.duration ?? 0) } : null;
}

const slug = (h) =>
  h
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');

/** Returns every problem found in a README at `dir`, whose committed files are `tracked`. */
function check(dir, tracked) {
  const problems = [];
  const text = readFileSync(join(dir, 'README.md'), 'utf8');
  if (/work in progress/i.test(text)) problems.push('work-in-progress banner');

  const headings = [...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].trim());
  for (const s of SECTIONS) if (!headings.includes(s)) problems.push(`missing section: ${s}`);
  const section = (name) => {
    const start = text.indexOf(`\n## ${name}\n`);
    if (start < 0) return '';
    const next = text.indexOf('\n## ', start + 4);
    return text.slice(start, next < 0 ? undefined : next);
  };
  if (!/```bash\s*\ndocker compose up -d --build\n/.test(section('Run it'))) problems.push('Run it: the one command is not the first line of its code block');
  if (!/demo seed/i.test(section('Run it'))) problems.push('Run it: the demo seed is not described');
  if (!/architecture-light\.png/.test(section('Architecture'))) problems.push('Architecture: no diagram');
  if (!/modular monolith/i.test(section('Architecture'))) problems.push('Architecture: the monolith trade-off is not explained');

  // Local references: markdown links and images, <img src>, <source srcset>.
  const refs = [
    ...[...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/\b(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]),
  ];
  const anchors = new Set(headings.map(slug));
  const localFiles = new Set();
  for (const ref of refs) {
    if (/^[a-z]+:/i.test(ref)) continue;
    if (ref.startsWith('#')) {
      if (!anchors.has(ref.slice(1))) problems.push(`broken anchor ${ref}`);
      continue;
    }
    const path = ref.split('#')[0].replace(/\/$/, '');
    const abs = join(dir, path);
    if (!existsSync(abs)) {
      problems.push(`missing file ${path}`);
      continue;
    }
    const committed = statSync(abs).isDirectory() ? [...tracked].some((f) => f.startsWith(`${path}/`)) : tracked.has(path);
    if (!committed) problems.push(`not committed: ${path}`);
    localFiles.add(path);
  }

  // Only real tags: the prose also mentions `<img>` in code.
  for (const [, attrs] of text.matchAll(/<img\b([^>]*\bsrc="[^>]*)>/g)) {
    if (!/\balt="[^"]{12,}"/.test(attrs)) problems.push(`image without a real alt: ${attrs.trim().slice(0, 60)}`);
  }
  for (const [, block] of text.matchAll(/<picture>([\s\S]*?)<\/picture>/g)) {
    const dark = block.match(/srcset="([^"]+)"/)?.[1];
    const light = block.match(/<img[^>]*src="([^"]+)"/)?.[1];
    if (!dark || !light || !/prefers-color-scheme: dark/.test(block)) {
      problems.push('a <picture> without a dark source and a light <img>');
      continue;
    }
    if (dark.replace('-dark', '-light') !== light) problems.push(`picture pair mismatch: ${dark} / ${light}`);
    const [a, b] = [probe(join(dir, dark)), probe(join(dir, light))];
    if (a && b && (a.width !== b.width || a.height !== b.height)) problems.push(`picture pair sizes differ: ${dark}`);
  }

  // The media themselves.
  const mediaDir = join(dir, 'docs/media');
  const media = existsSync(mediaDir) ? readdirSync(mediaDir) : [];
  if (!media.length) problems.push('docs/media is empty');
  let total = 0;
  for (const name of media) {
    const rel = `docs/media/${name}`;
    const abs = join(mediaDir, name);
    const bytes = statSync(abs).size;
    total += bytes;
    if (!localFiles.has(rel)) problems.push(`orphaned media ${rel}`);
    const info = probe(abs);
    if (!info) {
      problems.push(`not an image: ${rel}`);
      continue;
    }
    if (name.endsWith('.png') && info.codec !== 'png') problems.push(`${rel} is ${info.codec}, not png`);
    if (name.endsWith('.gif')) {
      if (info.codec !== 'gif') problems.push(`${rel} is ${info.codec}, not gif`);
      if (info.frames < 30 || info.duration < 3) problems.push(`${rel} is not a real animation (${info.frames} frames, ${info.duration}s)`);
      if (bytes > GIF_MAX) problems.push(`${rel} is ${(bytes / MB).toFixed(1)} MB (max 5)`);
    }
    const want = SIZES[name];
    if (want && (info.width !== want[0] || info.height !== want[1])) problems.push(`${rel} is ${info.width}×${info.height}, want ${want.join('×')}`);
    if (!want && info.width < MIN_WIDTH) problems.push(`${rel} is only ${info.width}px wide`);
  }
  if (total > MEDIA_MAX) problems.push(`docs/media totals ${(total / MB).toFixed(1)} MB (max 20)`);
  return problems;
}

const tracked = new Set(run('git', ['ls-files']).out.split('\n').filter(Boolean));

// Positive control: a copy of the real README and media, broken in known ways.
const fixture = mkdtempSync(join(tmpdir(), 'nook-readme-'));
try {
  mkdirSync(join(fixture, 'docs/media'), { recursive: true });
  for (const name of readdirSync(join(root, 'docs/media'))) copyFileSync(join(root, 'docs/media', name), join(fixture, 'docs/media', name));
  copyFileSync(join(root, 'docs/media/shell-light.png'), join(fixture, 'docs/media/stray.png'));
  writeFileSync(join(fixture, 'docs/media/still.gif'), readFileSync(join(root, 'docs/media/shell-light.png')));
  const broken = readFileSync(join(root, 'README.md'), 'utf8')
    .replace('# Nook\n', '# Nook\n\n> Work in progress.\n')
    .replace('docs/media/kits.gif', 'docs/media/missing.gif')
    .replace(/## Profiles\n/, '## Profile\n')
    .replace(/<img alt="Three phone screens[^"]*"/, '<img alt=""')
    .concat('\n<img alt="A still pretending to move, for the control" src="docs/media/still.gif">\n[jump](#no-such-heading)\n');
  writeFileSync(join(fixture, 'README.md'), broken);
  const fixtureTracked = new Set([...tracked].filter((f) => f !== 'docs/media/search.gif'));
  const seen = check(fixture, fixtureTracked).join('\n');
  const expected = [
    /work-in-progress banner/,
    /missing file docs\/media\/missing\.gif/,
    /missing section: Profiles/,
    /image without a real alt/,
    /orphaned media docs\/media\/stray\.png/,
    /orphaned media docs\/media\/kits\.gif/,
    /docs\/media\/still\.gif is png, not gif/,
    /broken anchor #no-such-heading/,
    /not committed: docs\/media\/search\.gif/,
  ];
  for (const e of expected) if (!e.test(seen)) fail(`positive control: the checker missed ${e}\n--- it reported:\n${seen}`);
  console.log(`positive control: ${expected.length} planted faults caught`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const problems = check(root, tracked);
if (problems.length) fail(`README problems:\n- ${problems.join('\n- ')}`);
const media = readdirSync(join(root, 'docs/media'));
const total = media.reduce((n, f) => n + statSync(join(root, 'docs/media', f)).size, 0);
console.log(`${media.length} media files, ${(total / MB).toFixed(1)} MB, all referenced, committed and in shape`);
console.log('README_OK');
