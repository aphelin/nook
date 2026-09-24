import { type Kit, contrast } from "@nook/contracts";
import type { CSSProperties } from "react";

/*
 * The club's colours are the app.
 *
 * Every nook has a kit of two colours. Story Mode spends them at full scale instead of on a single
 * accent: sorted by luminance, the darker one is the club's deep colour and the other its bright
 * one, and the screen is three surfaces made from them.
 *
 *   wing   the rail and the channel list, in the deep colour (the rail a step deeper).
 *   stage  the room, drenched: the bright colour by day, the deep colour by night.
 *   card   the things lifted off the colour (the composer, popovers, dialogs, panels, a message
 *          that is about you): flat white by day, near-black by night.
 *
 * A third colour, the pop, is picked for each kit from a short list of bright candy colours as the
 * one furthest in hue from both of the club's, so a room always has something loud that isn't
 * either of its own.
 *
 * A founder's colours can't be used raw, so each is moved into the band where it does its job,
 * keeping its hue, and every pair that carries text is walked apart until it clears its bar against
 * the hardest version of the surface it sits on (hovered). Each surface declares its own
 * foreground, highlight, chip and face colours, so a pill, a count or a person reads on whatever it
 * is placed on. `.unlazy/checks/accent-contrast.mjs` sweeps presets, a hue wheel and degenerate
 * kits through all of it.
 */

type Rgb = [number, number, number];
type Scheme = "light" | "dark";

const parse = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const format = (rgb: Rgb): string =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  return [h, s, l];
}

function toRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

const luminance = (hex: string) => {
  const [r, g, b] = parse(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** A colour with too little chroma to call a hue: a charcoal, a slate, white. */
const neutral = (hex: string) => toHsl(parse(hex))[1] < 0.2 || toHsl(parse(hex))[2] > 0.94 || toHsl(parse(hex))[2] < 0.04;

/** A colour at a given lightness and (capped or floored) saturation, keeping its hue. */
function at(hex: string, l: number, s: { max?: number; min?: number }): string {
  const [h, own] = toHsl(parse(hex));
  // A neutral keeps its own low saturation: flooring it would invent a hue nobody picked.
  const sat = neutral(hex) ? Math.min(own, s.max ?? own) : Math.min(s.max ?? 1, Math.max(s.min ?? 0, own));
  return format(toRgb([h, sat, l]));
}

const lightness = (hex: string) => toHsl(parse(hex))[2];
const hue = (hex: string) => toHsl(parse(hex))[0] * 360;

/** `amount` of `a` into `b`. */
const mix = (a: string, b: string, amount: number): string => {
  const [x, y] = [parse(a), parse(b)];
  return format([0, 1, 2].map((n) => y[n]! + (x[n]! - y[n]!) * amount) as Rgb);
};

/** Walk a colour toward `toward` until it clears `ratio` against every ground. The hue only thins or thickens. */
const press = (colour: string, grounds: string[], ratio: number, toward: string): string => {
  let out = colour;
  for (let step = 0; step < 200 && grounds.some((g) => contrast(out, g) < ratio); step += 1) out = mix(toward, out, 0.04);
  return out;
};

/**
 * A surface and the washes laid over it on hover and press (its own ink at 8% and 14%, as the
 * stylesheet's `hover` and `hover-strong` lay them): the hardest grounds its text meets.
 */
const hovered = (surface: string, wash: string) => [surface, mix(wash, surface, 0.08), mix(wash, surface, 0.14)];

/** Move a surface toward `toward` until `text` clears `ratio` on it and on its hovered versions. */
const settle = (surface: string, text: string, ratio: number, toward: string, wash = text): string => {
  let out = surface;
  for (let step = 0; step < 200 && hovered(out, wash).some((g) => contrast(text, g) < ratio); step += 1) out = mix(toward, out, 0.04);
  return out;
};

/** A token whose value follows the reader's colour scheme. */
const pair = (light: string, dark: string) => `light-dark(${light}, ${dark})`;

/** The kit's two colours, sorted into their jobs by luminance, not by the order they were picked. */
export function roles(kit: Kit): { deep: string; bright: string } {
  const [deep, bright] = luminance(kit.field) <= luminance(kit.mark) ? [kit.field, kit.mark] : [kit.mark, kit.field];
  return { deep, bright };
}

/*
 * The pops. Bright candy colours, each light enough to carry near-black text, and a kit takes the
 * one whose hue sits furthest from both of its own, so navy and orange get pink, wine and gold get
 * sky, charcoal and red get sky.
 */
const POPS = ["#ff8ac2", "#b9f25c", "#b8a4ff", "#7fd3ff", "#5fe3b4", "#ffe066"];

function popFor(deep: string, bright: string): string {
  const hues = [deep, bright].filter((c) => !neutral(c)).map(hue);
  if (hues.length === 0) return POPS[0]!;
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  return POPS.reduce((best, pop) =>
    Math.min(...hues.map((h) => distance(hue(pop), h))) > Math.min(...hues.map((h) => distance(hue(best), h))) ? pop : best,
  );
}

/** One surface: what it is, what reads on it, and what stands out on it. */
interface Surface {
  bg: string;
  fg: string;
  fg2: string;
  /** A solid highlight that stands out as a shape (3:1) and what reads on it (4.5:1). */
  hi: string;
  onHi: string;
  /** Pills and chips resting on the surface: reactions, the search field, a secondary button. */
  chip: string;
  onChip: string;
  /** The ring around someone who's here. */
  ring: string;
  /** People are shapes filled from the surface's colours, with their initial in what reads on each. */
  faces: [string, string][];
}

export interface Palette {
  wing: Surface;
  rail: Surface;
  stage: Surface;
  card: Surface;
  pop: string;
  onPop: string;
  /** The club's bright colour as a fill, what reads on it, and its deep colour, for showing the club itself. */
  bright: string;
  onBright: string;
  deep: string;
  alert: string;
}

const WHITE = "#ffffff";
const BLACK = "#000000";

function build(kit: Kit, scheme: Scheme): Palette {
  const { deep: deepSource, bright: brightSource } = roles(kit);
  const deepNeutral = neutral(deepSource);
  const brightNeutral = neutral(brightSource);
  // Where the colour comes from when one of the kit's two has none to give.
  const hueSource = deepNeutral && !brightNeutral ? brightSource : deepSource;
  const loudSource = brightNeutral && !deepNeutral ? deepSource : brightSource;

  // The deep colour, as the wing. A neutral keeps its own depth rather than being lifted into grey.
  const wingL = deepNeutral ? Math.min(lightness(deepSource), 0.14) : 0.27;
  const wingDay = settle(at(deepSource, wingL, { min: 0.42 }), WHITE, 6.5, BLACK);
  const wing = scheme === "light" ? wingDay : settle(at(deepSource, deepNeutral ? 0.1 : 0.14, { min: 0.4 }), WHITE, 12, BLACK);
  const rail = settle(mix(BLACK, wing, 0.3), WHITE, 9, BLACK);
  // Deep ink: the darkest version of the club, for text on the bright colour and on white.
  const ink = press(at(deepSource, 0.09, { max: 0.6 }), [WHITE], 16, BLACK);

  // The bright colour, moved into a vivid band so it reads as colour and carries deep ink.
  const brightL = Math.min(0.66, Math.max(0.5, lightness(loudSource)));
  let bright = at(loudSource, brightL, { min: brightNeutral && deepNeutral ? 0 : 0.72 });
  bright = press(bright, [ink], 6.5, WHITE);
  const onBright = contrast(ink, bright) >= 4.6 ? ink : press(ink, [bright], 4.6, BLACK);

  const pop = popFor(deepSource, brightSource);
  const onPop = press(ink, [pop], 7, BLACK);

  // Text on the wing: white, and a quieter white, both holding on the hovered wing.
  const wingGrounds = (w: string) => hovered(w, WHITE);
  const onWing = press("#ffffff", wingGrounds(wing), 7, WHITE);
  const wingChip = mix(WHITE, wing, 0.12);
  const railChip = mix(WHITE, rail, 0.12);
  // Secondary text also sits on the wing's chips: the search pill's placeholder.
  const onWing2 = press(mix(WHITE, wing, 0.72), [...wingGrounds(wing), wingChip], 4.6, WHITE);
  const onRail2 = press(mix(WHITE, rail, 0.72), [...wingGrounds(rail), railChip], 4.6, WHITE);
  // The bright colour must stand out on the wing as a shape; a deep bright colour is lifted.
  const wingHi = press(bright, [wing, rail], 3, WHITE);
  const onWingHi = contrast(ink, wingHi) >= 4.6 ? ink : WHITE;
  const wingFaces: [string, string][] = [
    [wingHi, onWingHi],
    [pop, onPop],
    [WHITE, wing],
  ];
  const wingSurface: Surface = {
    bg: wing,
    fg: onWing,
    fg2: onWing2,
    hi: wingHi,
    onHi: onWingHi,
    chip: wingChip,
    onChip: onWing,
    ring: pop,
    faces: wingFaces,
  };
  const railSurface: Surface = { ...wingSurface, bg: rail, fg2: onRail2, chip: railChip };

  let stage: Surface;
  let card: Surface;
  if (scheme === "light") {
    // By day the room is the bright colour, with deep ink on it; a colour too dark to carry the ink
    // when hovered is lifted a little.
    const stageBg = settle(bright, ink, 6, WHITE);
    const fg = press(ink, hovered(stageBg, ink), 6, BLACK);
    const fg2 = press(mix(ink, stageBg, 0.8), hovered(stageBg, ink), 4.6, BLACK);
    const hi = press(wingDay, [stageBg], 3.2, BLACK);
    stage = {
      bg: stageBg,
      fg,
      fg2,
      hi,
      onHi: press(WHITE, [hi], 4.6, WHITE),
      chip: WHITE,
      onChip: ink,
      ring: fg,
      faces: [
        [hi, contrast(stageBg, hi) >= 3 ? stageBg : WHITE],
        [fg, stageBg],
        [WHITE, ink],
      ],
    };
    // Chips on a card are a pale wash of the club's bright colour, never a neutral grey.
    const cardChip = mix(bright, WHITE, 0.16);
    // Secondary text also sits on the card's chips: placeholders in fields.
    const cardFg2 = press(mix(ink, WHITE, 0.66), [...hovered(WHITE, ink), cardChip], 4.6, BLACK);
    const cardHi = press(wingDay, [WHITE], 4.6, BLACK);
    card = {
      bg: WHITE,
      fg: ink,
      fg2: cardFg2,
      hi: cardHi,
      onHi: WHITE,
      chip: cardChip,
      onChip: ink,
      ring: cardHi,
      faces: [
        [bright, onBright],
        [cardHi, WHITE],
        [pop, onPop],
      ],
    };
  } else {
    // By night the room is the deep colour, saturated rather than greyed, and the bright colour lights it.
    const stageBg = settle(at(hueSource, 0.21, { min: 0.5 }), WHITE, 7.5, BLACK);
    const fg = press(mix(loudSource, WHITE, 0.06), hovered(stageBg, WHITE), 7.5, WHITE);
    const fg2 = press(mix(WHITE, stageBg, 0.72), hovered(stageBg, WHITE), 4.6, WHITE);
    const hi = press(bright, [stageBg], 3.2, WHITE);
    const onHi = contrast(ink, hi) >= 4.6 ? ink : press(ink, [hi], 4.6, BLACK);
    stage = {
      bg: stageBg,
      fg,
      fg2,
      hi,
      onHi,
      chip: mix(WHITE, stageBg, 0.13),
      onChip: fg,
      ring: hi,
      faces: [
        [hi, onHi],
        [pop, onPop],
        [fg, stageBg],
      ],
    };
    // Night cards keep a trace of the club's hue rather than going to a neutral black.
    const cardBg = settle(at(hueSource, 0.09, { min: 0.35, max: 0.5 }), WHITE, 12, BLACK);
    const cardFg = press("#f6f3ef", hovered(cardBg, WHITE), 12, WHITE);
    const nightCardChip = mix(bright, cardBg, 0.16);
    const cardFg2 = press(mix(WHITE, cardBg, 0.66), [...hovered(cardBg, WHITE), nightCardChip], 4.6, WHITE);
    const cardHi = press(bright, [cardBg], 4.6, WHITE);
    card = {
      bg: cardBg,
      fg: cardFg,
      fg2: cardFg2,
      hi: cardHi,
      onHi: contrast(ink, cardHi) >= 4.6 ? ink : BLACK,
      chip: nightCardChip,
      onChip: cardFg,
      ring: cardHi,
      faces: [
        [cardHi, contrast(ink, cardHi) >= 4.6 ? ink : BLACK],
        [pop, onPop],
        [stageBg, cardFg],
      ],
    };
  }

  return {
    wing: wingSurface,
    rail: railSurface,
    stage,
    card,
    pop,
    onPop,
    bright,
    onBright,
    deep: wingDay,
    alert: scheme === "light" ? press("#c4262e", [WHITE, card.chip], 5, BLACK) : press("#ff8f86", [card.bg, card.chip], 6, WHITE),
  };
}

/** The CSS name each surface's values go by: `--stage-bg`, `--stage-fg`, `--stage-face-1`… */
function surfaceTokens(name: string, day: Surface, night: Surface): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["bg", "fg", "fg2", "hi", "onHi", "chip", "onChip", "ring"] as const) {
    const css = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    out[`--${name}-${css}`] = pair(day[key], night[key]);
  }
  day.faces.forEach(([fill, initial], i) => {
    out[`--${name}-face-${i + 1}`] = pair(fill, night.faces[i]![0]);
    out[`--${name}-on-face-${i + 1}`] = pair(initial, night.faces[i]![1]);
  });
  return out;
}

/** Every token a kit sets, as `light-dark()` pairs. */
function tokens(kit: Kit): Record<string, string> {
  const day = build(kit, "light");
  const night = build(kit, "dark");
  return {
    ...surfaceTokens("wing", day.wing, night.wing),
    ...surfaceTokens("rail", day.rail, night.rail),
    ...surfaceTokens("stage", day.stage, night.stage),
    ...surfaceTokens("card", day.card, night.card),
    // Poster type on the room: ink by day; by night the club's bright colour, so the dark room still shouts.
    "--stage-title": pair(day.stage.fg, night.stage.hi),
    "--pop": pair(day.pop, night.pop),
    "--on-pop": pair(day.onPop, night.onPop),
    "--club-bright": pair(day.bright, night.bright),
    "--club-deep": pair(day.deep, night.deep),
    "--alert": pair(day.alert, night.alert),
  };
}

/**
 * Scopes a nook's colours to a subtree (and, from the shell, to the document root so portalled
 * popups are in the same club).
 */
export function accentStyle(kit: Kit): CSSProperties {
  return tokens(kit) as CSSProperties;
}

/**
 * One club shown outside its own screen (its disc on the rail, a notification from another nook,
 * the landing page's club picker): its bright colour, its deep colour, and what reads on each.
 */
export function discStyle(kit: Kit): CSSProperties {
  const day = build(kit, "light");
  const night = build(kit, "dark");
  return {
    "--disc": pair(day.bright, night.bright),
    "--on-disc": pair(day.onBright, night.onBright),
    "--disc-deep": pair(day.deep, night.wing.bg),
  } as CSSProperties;
}

/** The colours as plain values, for the checks and for anything drawn outside CSS. */
export function paletteFor(kit: Kit, scheme: Scheme): Palette {
  return build(kit, scheme);
}

/** The house kit, worn wherever no nook is in scope: the same navy and orange as the climbing club. */
export const HOUSE: Kit = { field: "#1f4e79", mark: "#f28c28" };

/** The house kit's tokens, for the stylesheet's :root (see `scripts/house-tokens`). */
export const houseTokens = () => tokens(HOUSE);
