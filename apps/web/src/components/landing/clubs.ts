import type { Kit, PresenceState, PublicUser } from "@nook/contracts";

/** People in the landing page's live demo. Fictional, like the seeded demo data. */
export interface DemoPerson extends PublicUser {
  presence: PresenceState;
}

export interface DemoLine {
  who: string;
  body: string;
  /** Reactions as emoji → count. */
  reactions?: Record<string, number>;
}

export interface DemoClub {
  id: string;
  name: string;
  kit: Kit;
  channel: string;
  /** Other channels in the sheet, with how many unread messages each is holding. */
  channels: { name: string; unread: number; mentions?: number }[];
  people: DemoPerson[];
  /** Already in the transcript when the club is shown. */
  opening: DemoLine[];
  /** Arrives one by one while the demo plays. */
  script: DemoLine[];
}

const person = (
  id: string,
  handle: string,
  displayName: string,
  presence: PresenceState,
  emoji: string | null = null,
  text: string | null = null,
): DemoPerson => ({
  id,
  handle,
  displayName,
  avatarUrl: null,
  pronouns: null,
  bio: null,
  status: { emoji, text, expiresAt: null },
  presence,
});

const mara = person("p-mara", "mara", "Mara Okafor", "online", "🧗", "Chalked up");
const jonas = person("p-jonas", "jonas", "Jonas Lindqvist", "online");
const priya = person("p-priya", "priya", "Priya Raman", "away", "📚", "Chapter 12");
const theo = person("p-theo", "theo", "Theo Brandt", "online", "🎛️", "Patching");
const sam = person("p-sam", "sam", "Sam Achebe", "offline");
const lena = person("p-lena", "lena", "Lena Moreau", "dnd");
const aiko = person("p-aiko", "aiko", "Aiko Tanaka", "online");
const dev = person("p-dev", "dev", "Dev Kapoor", "offline");

export const CLUBS: DemoClub[] = [
  {
    id: "tuesday-climbers",
    name: "Tuesday Climbers",
    kit: { field: "#1f4e79", mark: "#f28c28" },
    channel: "general",
    channels: [
      { name: "beta-spray", unread: 3, mentions: 1 },
      { name: "gear-swap", unread: 0 },
      { name: "trip-planning", unread: 1 },
    ],
    people: [mara, jonas, theo, sam],
    opening: [
      { who: "jonas", body: "Photos from Tuesday are up in the shared album" },
      { who: "sam", body: "the noodle place has a new chilli oil and it is dangerous", reactions: { "🌶️": 2 } },
      { who: "theo", body: "Anyone want to split a new crash pad? Ours is basically a yoga mat now" },
      { who: "mara", body: "Yes. There is a sale at the gear shop until Sunday", reactions: { "🙌": 2 } },
    ],
    script: [
      { who: "jonas", body: "In. **Two** pads and we can finally do the cave problems" },
      { who: "sam", body: "I will come for the noodles regardless of the weather" },
      { who: "theo", body: "@mara can you grab them on Thursday? I'll pay you back", reactions: { "👍": 1 } },
      { who: "mara", body: "On it. Meet at the wall at 7" },
    ],
  },
  {
    id: "dog-eared",
    name: "Dog-Eared",
    kit: { field: "#7a1f2b", mark: "#e8c872" },
    channel: "now-reading",
    channels: [
      { name: "general", unread: 0 },
      { name: "spoilers", unread: 12 },
      { name: "recommendations", unread: 2 },
    ],
    people: [priya, lena, aiko, dev],
    opening: [
      { who: "dev", body: "Library has three copies of the next pick" },
      { who: "lena", body: "Halfway through and I need to talk to someone about chapter 9" },
      { who: "priya", body: "This month: _The Left Hand of Darkness_. Due the 30th." },
      { who: "aiko", body: "Finally. It has been on my shelf for four years.", reactions: { "📚": 3 } },
    ],
    script: [
      { who: "lena", body: "The ice crossing section is some of the best writing I have read in ages" },
      { who: "dev", body: "Grabbed the last copy. The other book club will have to wait" },
      { who: "priya", body: "@lena save it for Thursday, we are doing that chapter first", reactions: { "❤️": 2 } },
      { who: "aiko", body: "I will make the lentil thing" },
    ],
  },
  {
    id: "patch-bay",
    name: "Patch Bay",
    kit: { field: "#1b1d24", mark: "#ff5a36" },
    channel: "show-and-tell",
    channels: [
      { name: "general", unread: 1 },
      { name: "modules", unread: 0 },
      { name: "marketplace", unread: 4, mentions: 1 },
    ],
    people: [theo, dev, aiko, jonas],
    opening: [
      { who: "theo", body: "Meetup this Saturday at the community hall. Bring headphones." },
      { who: "aiko", body: "Is it beginner friendly? I own exactly one synth and it is a keychain" },
      { who: "dev", body: "Made a drone patch from a single oscillator and a very slow LFO." },
      { who: "aiko", body: "Can you post the settings?" },
    ],
    script: [
      { who: "dev", body: "VCO saw → filter at 400Hz, res 60%. LFO `0.05Hz` into cutoff.", reactions: { "🎛️": 2 } },
      { who: "aiko", body: "Tried it on the keychain synth. It sounds like a whale. I love it." },
      { who: "theo", body: "Add a second LFO on the pitch, very slightly detuned" },
      { who: "jonas", body: "Doors at 2pm tomorrow. Parking is behind the bakery" },
    ],
  },
  {
    id: "nook",
    name: "Harbour Rowing",
    kit: { field: "#0e5b3f", mark: "#f2c12e" },
    channel: "outings",
    channels: [
      { name: "general", unread: 0 },
      { name: "crews", unread: 5 },
      { name: "boathouse", unread: 0 },
    ],
    people: [lena, sam, mara, priya],
    opening: [
      { who: "priya", body: "New blades arrived. They are very shiny" },
      { who: "mara", body: "Please nobody drop them in the harbour this time", reactions: { "😬": 2 } },
      { who: "lena", body: "Water is flat tomorrow. 6:30 at the boathouse?" },
      { who: "sam", body: "I will bring coffee for anyone who is actually awake", reactions: { "☕": 3 } },
    ],
    script: [
      { who: "mara", body: "Count me in for the four" },
      { who: "priya", body: "@sam you said that last week and brought one coffee" },
      { who: "sam", body: "It was a very large coffee", reactions: { "😂": 3 } },
      { who: "lena", body: "Crews posted in #crews. Blades out by 6:45" },
    ],
  },
];
