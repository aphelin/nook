/**
 * Demo data: fictional people and clubs so a fresh `docker compose up` has something to explore.
 * Idempotent: safe to run on every start. Sign in as mara@nook.demo / nook-demo-2026.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { mentionedHandles } from '@nook/contracts';
import argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { type ChannelKind, PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

export const DEMO_PASSWORD = 'nook-demo-2026';

const people = [
  { handle: 'mara', displayName: 'Mara Okafor', pronouns: 'she/her', bio: 'Sets routes, breaks them. Reads on the train.', statusEmoji: '🧗', statusText: 'Chalked up', faceShape: 'sparkle', faceTone: 3 },
  { handle: 'jonas', displayName: 'Jonas Lindqvist', pronouns: 'he/him', bio: 'Owns too many carabiners.', statusEmoji: null, statusText: null, faceShape: 'drop', faceTone: 1 },
  { handle: 'priya', displayName: 'Priya Raman', pronouns: 'she/her', bio: 'Book club founder. Will lend you anything but her Le Guin.', statusEmoji: '📚', statusText: 'Chapter 12', faceShape: 'circle', faceTone: 1 },
  { handle: 'theo', displayName: 'Theo Brandt', pronouns: 'he/him', bio: 'Modular synths and slab climbs.', statusEmoji: '🎛️', statusText: 'Patching', faceShape: 'flower', faceTone: 2 },
  { handle: 'aiko', displayName: 'Aiko Tanaka', pronouns: 'she/her', bio: null, statusEmoji: null, statusText: null, faceShape: 'star', faceTone: 2 },
  { handle: 'sam', displayName: 'Sam Achebe', pronouns: 'he/him', bio: 'Here for the noodles.', statusEmoji: null, statusText: null, faceShape: 'arch', faceTone: 3 },
  { handle: 'lena', displayName: 'Lena Moreau', pronouns: 'she/her', bio: 'Poetry, mostly.', statusEmoji: null, statusText: null, faceShape: 'pebble', faceTone: 1 },
  { handle: 'dev', displayName: 'Dev Kapoor', pronouns: 'he/him', bio: 'Sells more gear than he buys.', statusEmoji: null, statusText: null, faceShape: 'leaf', faceTone: 2 },
] as const;

type Handle = (typeof people)[number]['handle'];

interface LineExtras {
  reactions?: Record<string, Handle[]>;
  replies?: [Handle, number, string][];
}
type HistoryLine = [Handle, number, string, LineExtras?];

const nooks: {
  slug: string;
  name: string;
  description: string;
  kit: { field: string; mark: string };
  owner: Handle;
  members: Handle[];
  channels: { name: string; topic: string; kind?: ChannelKind; only?: Handle[] }[];
  directs: [Handle, Handle][];
  /** channel name (or "dm:<a>:<b>") → lines of [author, minutes ago, body, extras?] */
  history: Record<string, HistoryLine[]>;
  /** How many of a channel's latest messages the demo user hasn't read yet. */
  unread?: Record<string, number>;
  /** People whose joining prints in #general: [who, minutes ago]. */
  joins?: [Handle, number][];
}[] = [
  {
    slug: 'tuesday-climbers',
    name: 'Tuesday Climbers',
    description: 'Bouldering on Tuesdays, noodles after.',
    kit: { field: '#1f4e79', mark: '#f28c28' },
    owner: 'mara',
    members: ['mara', 'jonas', 'priya', 'theo', 'sam'],
    channels: [
      { name: 'general', topic: 'Everything and anything' },
      { name: 'beta-spray', topic: 'How did you do that heel hook' },
      { name: 'gear-swap', topic: 'Shoes, chalk bags, that one crash pad' },
      { name: 'trip-planning', topic: 'Fontainebleau, spring', kind: 'private', only: ['mara', 'jonas', 'theo'] },
    ],
    directs: [['mara', 'jonas']],
    history: {
      general: [
        ['mara', 4320, 'Reminder: the wall is closed next Tuesday for resetting. We could do the outdoor crag instead?'],
        ['jonas', 4310, 'Outdoors works for me if it stays dry'],
        ['sam', 4302, 'I will come for the noodles regardless of the weather'],
        ['theo', 4290, 'Forecast says 14 degrees and sunny. Carpool from the station at 17:30?'],
        ['priya', 4285, 'I can take 3 people. Leaving from the east exit.'],
        [
          'mara',
          1500,
          'Photos from Tuesday are up in the shared album. Jonas, that dyno.',
          {
            reactions: { '🔥': ['jonas', 'theo', 'sam'], '📸': ['priya'] },
            replies: [
              ['theo', 1497, 'The one where he lets go with both hands??'],
              ['jonas', 1494, 'Commitment is a lifestyle'],
              ['priya', 1480, 'Framing that one for the clubhouse'],
            ],
          },
        ],
        ['jonas', 1492, 'I have watched it eleven times'],
        ['sam', 1490, 'the noodle place has a new chilli oil and it is dangerous', { reactions: { '🌶️': ['mara', 'jonas'], '😂': ['theo'] } }],
        ['theo', 95, 'Anyone want to split a new crash pad? Ours is basically a yoga mat now'],
        ['mara', 88, 'Yes. There is a sale at the gear shop until Sunday. Link in #gear-swap'],
        ['priya', 12, 'Running 10 min late tonight, start without me'],
        ['jonas', 6, '@priya we will save you the good auto-belay'],
      ],
      'beta-spray': [
        ['theo', 2900, 'The purple V4 in the cave: is the start a heel hook or am I making it up'],
        ['mara', 2880, 'Heel hook on the big jug, then match. Do not try to campus it like Jonas did'],
        ['jonas', 2875, 'It worked eventually!!'],
        ['mara', 2874, 'It took you 40 minutes'],
        ['sam', 300, '@mara is the new yellow slab supposed to feel impossible or is it just me'],
        ['theo', 290, 'Trust your feet. Smear on the volume, do not look for holds.'],
      ],
      'gear-swap': [
        ['sam', 5000, 'Selling: La Sportiva Solutions, EU 42, resoled once. Free to a good home in exchange for noodles.'],
        ['priya', 4950, 'I will take them if nobody else wants them, my toes are 42'],
        ['mara', 90, 'Crash pad sale: https://example.com/crash-pads (ends Sunday)'],
      ],
      'trip-planning': [
        ['mara', 7000, 'Fontainebleau, second week of April? I found a gite that sleeps six.'],
        ['theo', 6990, 'In. I can drive from Brussels.'],
        ['jonas', 6900, 'In, but I refuse to do the 3am departure again'],
      ],
      'dm:mara:jonas': [
        ['jonas', 1400, 'Did you get the carabiners back from Sam?'],
        ['mara', 1395, 'Two of three. The third has entered the void.'],
        ['jonas', 1394, 'A classic'],
      ],
    },
    unread: { general: 2, 'beta-spray': 2 },
  },
  {
    slug: 'dog-eared',
    name: 'Dog-Eared',
    description: 'A book club that finishes the book. Mostly.',
    kit: { field: '#7a1f2b', mark: '#e8c872' },
    owner: 'priya',
    members: ['priya', 'mara', 'lena', 'aiko', 'dev'],
    channels: [
      { name: 'general', topic: 'Everything and anything' },
      { name: 'now-reading', topic: 'The Left Hand of Darkness, due the 30th' },
      { name: 'spoilers', topic: 'You were warned' },
      { name: 'recommendations', topic: 'Add to the pile' },
    ],
    directs: [['mara', 'priya']],
    history: {
      general: [
        ['priya', 5760, 'Welcome, everyone! Next meeting is the 30th at mine. I will make the lentil thing.', { reactions: { '❤️': ['lena', 'aiko', 'mara'] } }],
        ['lena', 5750, 'The lentil thing is the reason I joined this club'],
        ['aiko', 5700, 'Can I bring someone who has not read the book but has strong opinions about it'],
        ['priya', 5690, 'That describes half of us'],
        ['dev', 1300, 'Library has three copies of the next pick, grab them before the other book club does'],
        ['mara', 1280, 'There is ANOTHER book club?'],
        ['dev', 1279, 'They meet on Thursdays. We do not speak of them.'],
        ['lena', 40, 'Halfway through and I need to talk to someone about chapter 9'],
        ['priya', 35, 'Spoilers channel is right there, Lena'],
      ],
      'now-reading': [
        ['priya', 8000, 'This month: The Left Hand of Darkness. Due the 30th.'],
        ['aiko', 7900, 'Finally. It has been on my shelf for four years.'],
        [
          'mara',
          200,
          'The ice crossing section is some of the best writing I have read in ages',
          {
            replies: [
              ['lena', 180, '@mara the part where they count the days on the Gobrin ice. I had to stop reading for a bit.'],
              ['priya', 55, 'Agreed. Saving my notes on it for the meeting.'],
            ],
          },
        ],
        ['lena', 190, 'The shifgrethor stuff took me a while but now I think about it constantly'],
      ],
      spoilers: [
        ['lena', 38, 'Chapter 9. The letter. I was not ready.'],
        ['dev', 30, 'I had to put it down and go for a walk'],
      ],
      recommendations: [
        ['aiko', 9000, 'Adding: Piranesi. Short, strange, perfect for winter.'],
        ['dev', 8800, 'Seconding Piranesi. Also The Dispossessed if we want more Le Guin'],
        ['mara', 3000, 'Anything with mountains in it, please. For reasons.'],
      ],
      'dm:mara:priya': [
        ['priya', 300, 'Could you bring the folding chairs on the 30th?'],
        ['mara', 290, 'Yes! How many?'],
        ['priya', 288, 'Four should do it. Thank you!'],
      ],
    },
    unread: { 'now-reading': 1, spoilers: 1 },
    joins: [['dev', 1310]],
  },
  {
    slug: 'patch-bay',
    name: 'Patch Bay',
    description: 'Synth meetup. Bring cables.',
    kit: { field: '#1b1d24', mark: '#ff5a36' },
    owner: 'theo',
    members: ['theo', 'mara', 'dev', 'aiko', 'jonas'],
    channels: [
      { name: 'general', topic: 'Everything and anything' },
      { name: 'show-and-tell', topic: 'Post your patches' },
      { name: 'modules', topic: 'Eurorack talk' },
      { name: 'marketplace', topic: 'Buy, sell, swap' },
    ],
    directs: [['mara', 'theo']],
    history: {
      general: [
        ['theo', 6000, 'Meetup this Saturday at the community hall. Bring headphones, we have one mixer and six egos.'],
        ['dev', 5990, 'I will bring the extra power strips'],
        ['aiko', 5980, 'Is it beginner friendly? I own exactly one synth and it is a keychain'],
        ['theo', 5975, 'Very. The keychain is welcome.'],
        ['jonas', 1200, 'I have been told I have to come because I "keep talking about it"'],
        ['mara', 1190, 'He does keep talking about it'],
        ['theo', 20, 'Doors at 2pm tomorrow. Parking is behind the bakery. @mara can you bring the spare headphones?'],
      ],
      'show-and-tell': [
        ['dev', 3000, 'Made a drone patch from a single oscillator and a very slow LFO. Recording soon.'],
        ['aiko', 2990, 'Can you post the settings?'],
        [
          'dev',
          2985,
          'VCO saw -> filter at 400Hz, res 60%. LFO 0.05Hz into cutoff. Reverb at 80% wet, patience at 100%.',
          {
            reactions: { '🎛️': ['aiko', 'theo'] },
            replies: [
              ['aiko', 2970, 'Tried it on the keychain synth. It sounds like a whale. I love it.'],
              ['theo', 2960, 'Add a second LFO on the pitch, very slightly detuned'],
            ],
          },
        ],
      ],
      modules: [
        ['theo', 4000, 'Hot take: you only need a good filter and a good envelope. Everything else is decoration.'],
        ['dev', 3990, 'Says the person with a 104hp case'],
        ['theo', 3985, 'Decoration is important'],
      ],
      marketplace: [
        ['dev', 2000, 'Swapping a spare MIDI interface for a patch cable bundle'],
      ],
      'dm:mara:theo': [
        ['theo', 500, 'You should bring your old keyboard on Saturday'],
        ['mara', 490, 'It has three dead keys'],
        ['theo', 489, 'Perfect, it has character'],
        ['theo', 15, 'Also the hall has a piano now. Nobody knows why.'],
      ],
    },
    unread: { general: 1, 'dm:mara:theo': 1 },
    joins: [['jonas', 1205]],
  },
];

async function main() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const ids = {} as Record<Handle, string>;

  for (const p of people) {
    const user = await prisma.user.upsert({
      where: { email: `${p.handle}@nook.demo` },
      update: {},
      create: { email: `${p.handle}@nook.demo`, passwordHash, ...p },
    });
    // Every demo member wears a face of their own. A database seeded before faces existed gets
    // them filled in; a face someone has since picked for the account is left alone.
    await prisma.user.updateMany({ where: { id: user.id, faceShape: null }, data: { faceShape: p.faceShape, faceTone: p.faceTone } });
    ids[p.handle] = user.id;
  }

  for (const n of nooks) {
    const nook = await prisma.nook.upsert({
      where: { slug: n.slug },
      update: {},
      create: {
        slug: n.slug,
        name: n.name,
        description: n.description,
        kitField: n.kit.field,
        kitMark: n.kit.mark,
        ownerId: ids[n.owner],
      },
    });
    await prisma.nookMember.createMany({
      data: n.members.map((h) => ({ nookId: nook.id, userId: ids[h] })),
      skipDuplicates: true,
    });

    const channelIds: Record<string, string> = {};
    const channelMembers: Record<string, readonly Handle[]> = {};
    for (const c of n.channels) {
      const kind = c.kind ?? 'public';
      const channel = await prisma.channel.upsert({
        where: { nookId_name: { nookId: nook.id, name: c.name } },
        update: {},
        create: { nookId: nook.id, kind, name: c.name, topic: c.topic, createdById: ids[n.owner] },
      });
      await prisma.channelMember.createMany({
        data: (c.only ?? n.members).map((h) => ({ channelId: channel.id, userId: ids[h] })),
        skipDuplicates: true,
      });
      channelIds[c.name] = channel.id;
      channelMembers[c.name] = c.only ?? n.members;
    }

    for (const [a, b] of n.directs) {
      const directKey = `${nook.id}:${[ids[a], ids[b]].sort().join(':')}`;
      const channel = await prisma.channel.upsert({
        where: { directKey },
        update: {},
        create: { nookId: nook.id, kind: 'direct', directKey, createdById: ids[a] },
      });
      await prisma.channelMember.createMany({
        data: [{ channelId: channel.id, userId: ids[a] }, { channelId: channel.id, userId: ids[b] }],
        skipDuplicates: true,
      });
      channelIds[`dm:${a}:${b}`] = channel.id;
      channelMembers[`dm:${a}:${b}`] = [a, b];
    }

    // History goes into empty channels only, so re-running the seed never duplicates it.
    for (const [key, lines] of Object.entries(n.history)) {
      const channelId = channelIds[key];
      if (!channelId) throw new Error(`seed history refers to unknown channel ${key}`);
      if ((await prisma.message.count({ where: { channelId } })) > 0) continue;
      const at = (minutesAgo: number) => Date.now() - minutesAgo * 60_000;
      // Ids are UUIDv7 minted at the message's own time, so id order matches time order.
      const rows = lines.map(([author, minutesAgo, body, extras]) => ({
        id: uuidv7({ msecs: at(minutesAgo) }),
        author,
        minutesAgo,
        body,
        extras,
      }));
      await prisma.message.createMany({
        data: rows.map((r) => ({ id: r.id, channelId, authorId: ids[r.author], body: r.body, createdAt: new Date(at(r.minutesAgo)) })),
      });
      // Team-sheet lines, as the api prints them: who opened the channel, and who joined along the way.
      const system: { author: Handle; minutesAgo: number; body: 'channel_created' | 'member_joined' }[] = [
        ...(key.startsWith('dm:') ? [] : [{ author: n.owner, minutesAgo: Math.max(...lines.map(([, m]) => m)) + 30, body: 'channel_created' as const }]),
        ...(key === 'general' ? (n.joins ?? []).map(([author, minutesAgo]) => ({ author, minutesAgo, body: 'member_joined' as const })) : []),
      ];
      if (system.length) {
        await prisma.message.createMany({
          data: system.map((m) => ({
            id: uuidv7({ msecs: at(m.minutesAgo) }),
            channelId,
            authorId: ids[m.author],
            kind: 'system' as const,
            body: m.body,
            createdAt: new Date(at(m.minutesAgo)),
          })),
        });
      }
      // Every message as saved, replies included, to derive mentions and notifications from.
      const saved: { id: string; author: Handle; minutesAgo: number; body: string; root: { id: string; author: Handle } | null }[] = rows.map(
        (r) => ({ ...r, root: null }),
      );
      for (const r of rows) {
        const replies = r.extras?.replies ?? [];
        if (replies.length) {
          const replyRows = replies.map(([author, minutesAgo, body]) => ({ id: uuidv7({ msecs: at(minutesAgo) }), author, minutesAgo, body }));
          await prisma.message.createMany({
            data: replyRows.map((x) => ({
              id: x.id,
              channelId,
              threadRootId: r.id,
              authorId: ids[x.author],
              body: x.body,
              createdAt: new Date(at(x.minutesAgo)),
            })),
          });
          saved.push(...replyRows.map((x) => ({ ...x, root: { id: r.id, author: r.author } })));
          const last = Math.min(...replies.map(([, m]) => m));
          await prisma.message.update({ where: { id: r.id }, data: { replyCount: replies.length, lastReplyAt: new Date(at(last)) } });
        }
        const reactions = Object.entries(r.extras?.reactions ?? {}).flatMap(([emoji, who]) => who.map((h) => ({ messageId: r.id, userId: ids[h], emoji })));
        if (reactions.length) await prisma.reaction.createMany({ data: reactions });
      }

      // Everyone has read the channel, except the demo user, who is a few messages behind in some.
      const members = channelMembers[key]!;
      const readUpTo = {} as Record<Handle, string>;
      for (const h of members) {
        const behind = h === 'mara' ? (n.unread?.[key] ?? 0) : 0;
        if (behind >= rows.length) throw new Error(`seed: ${key} needs a read message before the unread ones`);
        readUpTo[h] = rows[rows.length - 1 - behind]!.id;
        await prisma.channelMember.update({ where: { channelId_userId: { channelId, userId: ids[h] } }, data: { lastReadMessageId: readUpTo[h] } });
      }

      // Mentions and notifications, as the api would have made them. Recent ones are still unread.
      const RECENT_MIN = 600;
      for (const m of saved) {
        const mentioned = mentionedHandles(m.body).filter((h): h is Handle => members.includes(h as Handle) && h !== m.author);
        const repliedTo = m.root
          ? [...new Set([m.root.author, ...saved.filter((o) => o.root?.id === m.root!.id && o.id < m.id).map((o) => o.author)])].filter(
              (h) => h !== m.author && !mentioned.includes(h),
            )
          : [];
        const unread = (h: Handle) => (m.root ? m.minutesAgo < RECENT_MIN : m.id > readUpTo[h]);
        const createdAt = new Date(at(m.minutesAgo));
        if (mentioned.length) await prisma.mention.createMany({ data: mentioned.map((h) => ({ messageId: m.id, userId: ids[h] })) });
        const notes = [...mentioned.map((h) => ({ h, kind: 'mention' as const })), ...repliedTo.map((h) => ({ h, kind: 'reply' as const }))];
        if (notes.length) {
          await prisma.notification.createMany({
            data: notes.map(({ h, kind }) => ({
              id: uuidv7({ msecs: createdAt.getTime() }),
              userId: ids[h],
              actorId: ids[m.author],
              kind,
              messageId: m.id,
              createdAt,
              readAt: unread(h) ? null : createdAt,
            })),
          });
        }
      }
    }
  }

  console.log(`seeded ${people.length} people and ${nooks.length} nooks (sign in as mara@nook.demo / ${DEMO_PASSWORD})`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
