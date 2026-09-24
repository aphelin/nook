// G5: the demo seed loads three nooks with distinct kits, channels, members and DMs, and is idempotent.
import { join } from 'node:path';
import { fail, root, run } from './lib.mjs';

const api = join(root, 'apps/api');
const DB = 'nook_seed_check';
const env = { ...process.env, DATABASE_URL: `postgresql://nook:nook@localhost:5432/${DB}` };
const psql = (sql, db = DB) => run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'nook', '-d', db, '-tAc', sql]);

const up = run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
if (up.status !== 0) fail(`postgres not up:\n${up.out}`);
psql(`DROP DATABASE IF EXISTS ${DB}`, 'nook');
if (psql(`CREATE DATABASE ${DB}`, 'nook').status !== 0) fail('could not create scratch database');

const migrate = run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd: api, env });
if (migrate.status !== 0) fail(`migrate failed:\n${migrate.out}`);

const snapshot = () =>
  psql(`SELECT
    (SELECT count(*) FROM "User"),
    (SELECT count(*) FROM "Nook"),
    (SELECT count(DISTINCT "kitField") FROM "Nook"),
    (SELECT count(*) FROM "NookMember"),
    (SELECT count(*) FROM "Channel" WHERE kind <> 'direct'),
    (SELECT count(*) FROM "Channel" WHERE kind = 'private'),
    (SELECT count(*) FROM "Channel" WHERE kind = 'direct'),
    (SELECT count(*) FROM "ChannelMember"),
    (SELECT count(*) FROM "Message"),
    (SELECT count(DISTINCT "channelId") FROM "Message"),
    (SELECT count(*) FROM "Message" m WHERE EXISTS (SELECT 1 FROM "Message" o WHERE o."channelId" = m."channelId" AND o."createdAt" < m."createdAt" AND o.id > m.id)),
    (SELECT count(*) FROM "Mention"),
    (SELECT count(*) FROM "Notification")`).out.trim();

const snapshots = [];
for (let i = 0; i < 2; i++) {
  const seed = run('pnpm', ['-s', 'db:seed'], { cwd: api, env });
  if (seed.status !== 0 || !seed.out.includes('seeded')) fail(`seed run ${i + 1} failed:\n${seed.out}`);
  snapshots.push(snapshot());
}
if (snapshots[0] !== snapshots[1]) fail(`seed is not idempotent: ${snapshots[0]} then ${snapshots[1]}`);

const [users, nooks, kits, members, channels, priv, directs, , messages, channelsWithHistory, outOfOrder] = snapshots[0].split('|').map(Number);
console.log(`users=${users} nooks=${nooks} distinctKits=${kits} members=${members} channels=${channels} private=${priv} directs=${directs} messages=${messages} channelsWithHistory=${channelsWithHistory} outOfOrder=${outOfOrder}`);
if (users < 8 || nooks !== 3 || kits !== 3 || members < 15 || channels < 12 || priv < 1 || directs < 3) fail('seed is missing data');
if (messages < 60 || channelsWithHistory < 15) fail('seed is missing conversation history');
// Pagination walks by id; ids must sort the same way as timestamps.
if (outOfOrder !== 0) fail(`${outOfOrder} messages have ids out of time order`);

const mara = psql(`SELECT count(*) FROM "NookMember" m JOIN "User" u ON u.id = m."userId" WHERE u.email = 'mara@nook.demo'`).out.trim();
if (mara !== '3') fail(`demo user should be in all three nooks, is in ${mara}`);

// The demo user should land on something to catch up on: measured straight from the tables.
const demo = psql(`WITH me AS (SELECT id FROM "User" WHERE email = 'mara@nook.demo'),
  behind AS (
    SELECT cm."channelId",
      (SELECT count(*) FROM "Message" m WHERE m."channelId" = cm."channelId" AND m."threadRootId" IS NULL
         AND m."authorId" <> cm."userId" AND m.id > cm."lastReadMessageId") AS unread,
      (SELECT count(*) FROM "Mention" x JOIN "Message" m ON m.id = x."messageId" WHERE x."userId" = cm."userId"
         AND m."channelId" = cm."channelId" AND m."threadRootId" IS NULL AND m.id > cm."lastReadMessageId") AS mentions
    FROM "ChannelMember" cm WHERE cm."userId" = (SELECT id FROM me))
  SELECT
    (SELECT count(*) FROM behind WHERE unread > 0),
    (SELECT count(DISTINCT c."nookId") FROM behind b JOIN "Channel" c ON c.id = b."channelId" WHERE b.unread > 0),
    (SELECT count(*) FROM behind WHERE mentions > 0),
    (SELECT count(*) FROM "Notification" WHERE "userId" = (SELECT id FROM me) AND "readAt" IS NULL AND kind = 'mention'),
    (SELECT count(*) FROM "Notification" WHERE "userId" = (SELECT id FROM me) AND "readAt" IS NULL AND kind = 'reply'),
    (SELECT count(*) FROM "Notification" WHERE "userId" = (SELECT id FROM me) AND "readAt" IS NOT NULL),
    (SELECT count(*) FROM "Notification" n JOIN "Message" m ON m.id = n."messageId" WHERE n."userId" = m."authorId")`).out.trim();
const [unreadChannels, unreadNooks, mentionChannels, unreadMentions, unreadReplies, readNotes, selfNotes] = demo.split('|').map(Number);
console.log(`demo: unreadChannels=${unreadChannels} across ${unreadNooks} nooks, mentionChannels=${mentionChannels} inbox mentions=${unreadMentions} replies=${unreadReplies} read=${readNotes} self=${selfNotes}`);
if (unreadChannels < 4 || unreadNooks !== 3 || mentionChannels < 2 || unreadMentions < 3 || unreadReplies < 1 || readNotes < 1) fail('demo user has too little to catch up on');
if (selfNotes !== 0) fail('someone was notified about their own message');

psql(`DROP DATABASE IF EXISTS ${DB}`, 'nook');
console.log('SEED_OK');
