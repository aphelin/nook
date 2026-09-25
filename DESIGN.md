---
name: Nook
description: Chat for clubs in Story Mode — the club's own two colours fill the screen, names are set at poster size, and people are bold flat shapes.
colors:
  wing-bg: "light-dark(#1c476e, #0c1721)"
  wing-fg: "light-dark(#ffffff, #ffffff)"
  wing-fg2: "light-dark(#d0dbe0, #bbbec1)"
  wing-hi: "light-dark(#f28c28, #f28c28)"
  wing-on-hi: "light-dark(#091825, #091825)"
  wing-chip: "light-dark(#375d7f, #29333c)"
  wing-ring: "light-dark(#ff8ac2, #ff8ac2)"
  rail-bg: "light-dark(#122e47, #081017)"
  rail-fg2: "light-dark(#bdc4cb, #babcbe)"
  rail-chip: "light-dark(#2e475d, #262d33)"
  stage-bg: "light-dark(#f39539, #163755)"
  stage-fg: "light-dark(#091825, #fef8f2)"
  stage-fg2: "light-dark(#322b24, #bec7cf)"
  stage-hi: "light-dark(#1c476e, #f28c28)"
  stage-on-hi: "light-dark(#ffffff, #091825)"
  stage-chip: "light-dark(#ffffff, #34516b)"
  stage-on-chip: "light-dark(#091825, #fef8f2)"
  stage-ring: "light-dark(#091825, #f28c28)"
  stage-title: "light-dark(#091825, #f28c28)"
  stage-face-1: "light-dark(#1c476e, #f28c28)"
  stage-on-face-1: "light-dark(#f39539, #091825)"
  stage-face-2: "light-dark(#091825, #ff8ac2)"
  stage-on-face-2: "light-dark(#f39539, #091825)"
  stage-face-3: "light-dark(#ffffff, #fef8f2)"
  stage-on-face-3: "light-dark(#091825, #163755)"
  card-bg: "light-dark(#ffffff, #0b1722)"
  card-fg: "light-dark(#091825, #f6f3f3)"
  card-fg2: "light-dark(#555f67, #acb0b4)"
  card-hi: "light-dark(#1c476e, #f28c28)"
  card-on-hi: "light-dark(#ffffff, #091825)"
  card-chip: "light-dark(#fdeddd, #302a23)"
  card-ring: "light-dark(#1c476e, #f28c28)"
  card-face-1: "light-dark(#f28c28, #f28c28)"
  card-on-face-1: "light-dark(#091825, #091825)"
  card-face-2: "light-dark(#1c476e, #ff8ac2)"
  card-on-face-2: "light-dark(#ffffff, #091825)"
  card-face-3: "light-dark(#ff8ac2, #f6f3f3)"
  card-on-face-3: "light-dark(#091825, #0b1722)"
  pop: "light-dark(#ff8ac2, #ff8ac2)"
  on-pop: "light-dark(#091825, #091825)"
  club-bright: "light-dark(#f28c28, #f28c28)"
  club-deep: "light-dark(#1c476e, #1c476e)"
  alert: "light-dark(#c4262e, #ff8f86)"
  house-deep-source: "#1f4e79"
  house-bright-source: "#f28c28"
  stage-day: "#f39539"
  stage-night: "#163755"
typography:
  display:
    fontFamily: "Funnel Display, Funnel Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(3rem, 7.4vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.04em"
  room-title:
    fontFamily: "Funnel Display, Funnel Sans, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.25rem, 6.2cqi, 4.75rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Funnel Display, Funnel Sans, ui-sans-serif, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  nook-name:
    fontFamily: "Funnel Display, Funnel Sans, ui-sans-serif, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Funnel Display, Funnel Sans, ui-sans-serif, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  title-sm:
    fontFamily: "Funnel Display, Funnel Sans, ui-sans-serif, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.4375rem"
  body-field:
    fontFamily: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: "1.4375rem"
  meta:
    fontFamily: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: "1.1875rem"
  caption:
    fontFamily: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.0625rem"
    fontFeature: "tnum"
  count:
    fontFamily: "Funnel Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  chip: "0.625rem"
  field: "1rem"
  row: "1.25rem"
  menu: "1.5rem"
  card: "1.75rem"
  full: "9999px"
spacing:
  tight: "6px"
  snug: "12px"
  card: "20px"
  dialog: "28px"
  room: "32px"
components:
  button-primary:
    backgroundColor: "{colors.stage-hi}"
    textColor: "{colors.stage-on-hi}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.stage-chip}"
    textColor: "{colors.stage-on-chip}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 20px"
  button-ghost:
    textColor: "{colors.stage-fg2}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.card-bg}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 20px"
  text-field:
    backgroundColor: "{colors.card-chip}"
    textColor: "{colors.card-fg}"
    typography: "{typography.body-field}"
    rounded: "{rounded.field}"
    height: "48px"
    padding: "0 16px"
  channel-row:
    textColor: "{colors.wing-fg2}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 14px"
  channel-row-active:
    backgroundColor: "{colors.wing-hi}"
    textColor: "{colors.wing-on-hi}"
    rounded: "{rounded.full}"
    height: "44px"
  search-pill:
    backgroundColor: "{colors.wing-chip}"
    textColor: "{colors.wing-fg2}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 16px"
  count-pill:
    backgroundColor: "{colors.pop}"
    textColor: "{colors.on-pop}"
    typography: "{typography.count}"
    rounded: "{rounded.full}"
    height: "20px"
    padding: "0 6px"
  reaction-chip:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.card-fg}"
    rounded: "{rounded.full}"
    height: "32px"
    padding: "0 10px 0 8px"
  reaction-chip-mine:
    backgroundColor: "{colors.stage-hi}"
    textColor: "{colors.stage-on-hi}"
    rounded: "{rounded.full}"
    height: "32px"
  composer:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.card-fg}"
    typography: "{typography.body-field}"
    rounded: "{rounded.card}"
    padding: "8px"
  send-button:
    backgroundColor: "{colors.stage-hi}"
    textColor: "{colors.stage-on-hi}"
    rounded: "{rounded.full}"
    size: "40px"
  mention-card:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.card-fg}"
    rounded: "{rounded.field}"
    padding: "10px 16px"
  popover:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.card-fg}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  dialog:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.card-fg}"
    rounded: "{rounded.card}"
    padding: "{spacing.dialog}"
  nook-disc:
    backgroundColor: "{colors.club-bright}"
    textColor: "{colors.club-deep}"
    rounded: "{rounded.full}"
    size: "44px"
  avatar:
    backgroundColor: "{colors.stage-face-1}"
    textColor: "{colors.stage-on-face-1}"
    size: "40px"
  avatar-intro:
    backgroundColor: "{colors.stage-face-1}"
    textColor: "{colors.stage-on-face-1}"
    size: "84px"
  story-bar-fill:
    backgroundColor: "{colors.stage-fg}"
    rounded: "{rounded.full}"
    height: "6px"
---

# Design System: Nook

## Overview

**Creative North Star: "Story Mode"**

The club's colours don't accent the app; they are the app. Every nook has a kit of two colours, and `lib/accent` sorts them by luminance, not by the order a founder picked them: the darker is the club's **deep** colour, the other its **bright** one. The screen is built from them at full scale. The **wing** (the channel list, with the **rail** of nooks a step deeper beside it) is the deep colour. The **stage** (the room) is drenched in the bright colour by day and in a saturated deep colour by night. **Cards** (the composer, popovers, dialogs, drawers, panels, and any message that is about you) are flat white by day and a near-black carrying the club's hue by night. A fourth colour, the **pop**, is picked per kit from six candy colours as the one furthest in hue from both of the club's, so every room has one loud thing that is neither of its own.

The grammar is a story you tap through, turned into a place you chat every day: full-bleed fields of colour, the channel's name at poster size in Funnel Display 800 at the head of the room, a who's-here strip of people across the top like story rings, talk set straight onto the colour with no bubbles, and anything about you lifted onto a white card. Switching nooks swaps the kit on the document root and the new club's stage colour sweeps out as a growing circle from the disc you pressed, then lifts to show the room already re-tinted. Both schemes ship on equal footing: day is the bright room, night is the deep room lit by the bright colour.

Depth is colour against colour. There are no gradient fills, no glass, no grain and no glow; docked surfaces meet edge to edge with no rule between them, and only things lifted off the colour cast one soft shadow. Every colour a component uses is certified for the surface it sits on: `.unlazy/checks/accent-contrast.mjs` sweeps 41 kits (10 presets, a 24-step hue wheel, 7 degenerate kits) in both schemes, against each surface and its hovered versions, with zero failures.

**Key Characteristics:**
- Four surfaces per club (wing, rail, stage, card), all computed from the kit's two colours plus one derived pop; the frontmatter values are the house kit's (navy `#1f4e79` and orange `#f28c28`), worn wherever no nook is in scope.
- One shared vocabulary on every surface (`bg`, `fg`, `fg-2`, `hi`, `on-hi`, `chip`, `on-chip`, `ring`, `face-1..3`, `on-face-1..3`), so a pill, a count or a person reads on whatever it is placed on.
- Funnel Display 800 at poster size names things; Funnel Sans carries everything read or pressed.
- People are twenty-one flat shapes with a heavy initial: the one a member picked in their profile (shape and one of three face colours), or one of the first eight given by their handle until they do; a club is a split disc of its two colours.
- Pills for what you press, 28px corners for what holds content.
- Motion: an overshoot for arrivals only, expo ease-out for everything else, a 360ms re-tint, and a story turn between clubs (the screen turns to the new club like the next face of a cube). On the landing, a crowd of people lands in the first screen, can be knocked flying with the cursor, and six of them fly down into the next chapter as you scroll. All of it is cut under reduced motion.

## Colors

A club's own two colours spent at full scale, with one derived candy pop and one alert, every pair walked apart by the engine until it clears its bar on the hardest (hovered) version of its surface.

### Primary
- **Club Bright** (`club-bright`): the kit's lighter colour moved into a vivid band (HSL lightness 0.5–0.66, saturation at least 0.72). By day it floods the stage (`stage-bg`, a step lifted where needed so deep ink holds 6:1 hovered); by night it is the highlight (`stage-hi`, `card-hi`) and the send button. On the wing it is always the highlight (`wing-hi`): the current channel's pill.
- **Club Deep** (`club-deep`, `wing-bg`): the kit's darker colour at HSL lightness 0.27 by day and 0.14 by night, settled until white holds 6.5:1 (12:1 by night) on it hovered. It is the wing; the rail is it mixed 30% toward black (`rail-bg`). By day it is the highlight on the stage and on cards (`stage-hi`, `card-hi`): the primary button, the send button, your reaction. By night the stage becomes a saturated version of it (`stage-bg`, lightness 0.21).

### Secondary
- **Pop** (`pop`, `on-pop`): one of `#ff8ac2`, `#b9f25c`, `#b8a4ff`, `#7fd3ff`, `#5fe3b4`, `#ffe066`, chosen per kit by largest hue distance from the club's two (navy and orange get pink). It marks what is new and who is here: unread counts and dots, the notification badge, the ring and "online" fill on the wing and rail, the second face colour, the invite icon. `on-pop` is the club's deep ink pressed to 7:1.

### Tertiary
- **Alert** (`alert`): `#c4262e` by day, `#ff8f86` by night, pressed to 5:1 (6:1 by night) against the card and the card's chip. The only colour that is not the club's, and it always travels with a glyph (the warning-circle mask on field errors, the icon in form alerts).

### Neutral
- **Card White / Card Night** (`card-bg`): flat `#ffffff` by day; by night the club's hue at lightness 0.09 (`#0b1722` for the house), never a neutral black.
- **Deep Ink** (`stage-fg`, `card-fg`): the darkest version of the club (its deep colour at lightness 0.09, pressed to 16:1 on white). Text on the bright stage and on white cards.
- **Poster Ink** (`stage-title`): the room's colour for large display heads: the stage's ink by day, the stage's highlight (the club's bright colour, certified 3:1 on the night room) by night. On the wing, rail and cards the title colour is simply that surface's `fg`.
- **Browser Stage** (`stage-day`, `stage-night`): the house stage's two flat halves, for places that cannot read a custom property (the browser's theme colour).
- **Secondary Ink** (`*-fg2`): every surface's quieter text, at 4.5:1 on the surface hovered and on its own chips (placeholders sit on chips).
- **Chips** (`*-chip`): the resting tone for pills on each surface. White at 12% over the wing and rail; pure white on the day stage; white at 13% over the night stage; on cards, a 16% wash of the club's bright colour (`card-chip`), never a neutral grey.
- **Washes** (not tokens in the kit; derived in `@theme`): `hover` and `line` are the surface's own `fg` at 8% and 14%, `hover-strong` at 14%, `line-strong` at 30%. They take the surface's colour wherever they sit.

### Named Rules
**The Club Is The Screen Rule.** Every colour comes from `lib/accent`. A component never names a hex or a club; it paints with the surface vocabulary, and a subtree showing another club gets that club's tokens through `accentStyle(kit)` (or `discStyle(kit)` for a disc shown outside its own screen).

**The Declare-Where-You-Paint Rule.** A surface class (`surface-wing`, `surface-rail`, `surface-stage`, `surface-card`) goes on the element that is that surface, because a custom property built from `var()` resolves where it is declared. The shell also writes the kit onto the document root so portalled popups are in the same club.

**The Bars Are The Spec Rule.** Text 6.5:1 (on the stage 6:1), secondary text 4.5:1, a highlight as a shape 3:1, text on a highlight 4.5:1, a face's initial 3:1, placeholders on chips 4.5:1, alert on card 4.5:1, each measured against the surface and its 8% and 14% hovered washes. A new pair joins the sweep before it ships.

**The Alert Lives On A Card Rule.** The alert colour is only certified on a card. A field error renders as a small card pill with its glyph on any surface; a failed send lifts the message onto a card; a form alert sits on the card's chip. Alert text never sits straight on the club's colour.

**The One Loud Stranger Rule.** The pop is for what is new and who is here. It never becomes a surface, a button fill, or body text.

## Typography

**Display Font:** Funnel Display (with Funnel Sans, ui-sans-serif, sans-serif)
**Body Font:** Funnel Sans (with ui-sans-serif, system-ui, sans-serif)

**Character:** One voice at two volumes, drawn by the same hand. Funnel Display at 800 shows its pinched joins at poster size and names things; Funnel Sans is a plain, open grotesk at 15px that stays calm on a loud colour.

### Hierarchy
- **Display** (800, clamp(3rem, 7.4vw, 6rem), 0.92, -0.04em): status pages and the landing hero; landing chapter heads use clamp(2.5rem, 5vw, 4.5rem) at the same leading and tracking.
- **Room Title** (800, clamp(2.25rem, 6.2cqi, 4.75rem), 0.9, -0.035em): the channel or DM name at the head of the room, sized from the room's own container width so it shrinks when a thread opens beside it, trimmed to cap height and baseline.
- **Headline** (800, 2.75rem, 1, -0.03em): the start of a channel or conversation, the inbox title, a member card's name.
- **Nook Name** (800, 2rem, 0.95, -0.03em): the nook's name at the top of the wing, up to two lines, balanced.
- **Title** (800, 1.875rem, 1, -0.02 to -0.03em): dialog, thread and member-sheet heads, empty-state lines.
- **Title Small** (800, 1.375rem, 1, -0.02em): popover titles; day dividers in the transcript (in the title colour).
- **Body** (400, 0.9375rem / 1.4375rem): messages (max 68ch), rows, buttons (buttons at 700).
- **Body Field** (400, 1rem / 1.5rem): typed text in fields and the composer.
- **Label** (700–800, 0.9375rem): sender names (800), field labels and button text (700). Sentence case.
- **Meta** (600–700, 0.8125rem): group labels ("Channels", "Direct messages"), sub-lines under heads, search placeholder hints.
- **Caption** (500, 0.75rem, tabular numerals): timestamps, "(edited)", who's-here names.
- **Count** (800, 0.6875rem, tabular numerals): counts inside pop pills.

### Named Rules
**The Two Volumes Rule.** Funnel Display 800 names things: nooks, channels, people in an opening, page, dialog and popover heads, day dividers, the wordmark, and the initials in faces and discs. Everything read or pressed (messages, labels, controls, counts) is Funnel Sans.

**The Poster Head Rule.** Display heads are tight: leading 0.9–1, tracking -0.02em to -0.04em, and a head that sits on an edge is trimmed to cap height and baseline (`text-box: trim-both cap alphabetic`) with a clip margin so descenders are never cut.

**The Night Poster Rule.** Display heads at poster size on the room (the room title, transcript day headings, the channel-start heading, the landing headline and chapter heads) take the title colour: ink by day, the club's bright colour by night. It is certified only as a large-type colour at 3:1, so body text, labels and small heads keep `fg`.

**The Tabular Numbers Rule.** Times and counts (`time`, `[data-num]`) always set tabular numerals.

## Layout

The desktop shell is three columns meeting edge to edge: a 76px rail, a 280px wing, and the room taking the rest (from `md`, 768px). Who's here lives across the top of the room, not in a fourth column: a strip of 48px shapes at 60px pitch with first names beneath, trimmed by the room's container width (4 below `@md`, 6 below `@3xl`) and ended by an "All N" chip. At `xl` (1280px) a thread or search results open as a card beside the room, inset 12px from the edges; below `xl` they slide in as a card drawer from the right (440px, full width on phones), and the member list is always a 360px card drawer. Below `md` the rail and wing slide in together from the left (up to 356px).

The room header pads 32px at `md` and up (16px on phones), 32px from the top. Messages sit on one left edge in a 2.75rem gutter column, with a 12px gap to the text, so a long channel scans; consecutive messages share one shape and name. The composer docks at the bottom, 24px from the sides and 20px from the foot at `md`.

Spacing follows a 4px base. The recurring steps are 6px (label-to-field, reaction gaps), 12px (row gaps, drawer insets), 20px (popover padding, wing padding), 28px (dialog padding) and 32px (room gutters). The landing is a 90rem max-width stage split 5:7 at `xl`, chapters alternating side. From `xl` the club discs stand at the end of the headline's second line (the name they change), and the live demo runs down to 4.25rem above the hero's foot, sized from the viewport so it keeps a healthy shape (about 1.2–1.7:1), floating over the crowd's trail; the mound rises into the corner under the call to action. Between `md` and `xl` the stacked demo keeps a 1.6:1 shape. A chosen club disc keeps the padding of the others and wears its ring inside it, so it sits centred and nothing shifts when you change clubs.

## Elevation & Depth

Depth is colour against colour. The rail, wing and stage are flat fields that meet with no border and no shadow; the step from rail to wing to stage is a change of colour, not of height. Only two kinds of thing lift off the colour, and each casts one soft, two-layer shadow whose colour is wrapped per layer in `light-dark()`.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px light-dark(rgb(10 12 20 / 0.08), rgb(0 0 0 / 0.4)), 0 10px 30px -10px light-dark(rgb(10 12 20 / 0.28), rgb(0 0 0 / 0.65))`): cards resting on the colour: the composer, a message that mentions you, file attachments and images, the message action bar, the thread card beside the room.
- **Float** (`box-shadow: 0 2px 6px light-dark(rgb(10 12 20 / 0.1), rgb(0 0 0 / 0.45)), 0 24px 56px -14px light-dark(rgb(10 12 20 / 0.36), rgb(0 0 0 / 0.75))`): things over the room: popovers, menus, tooltips, dialogs, drawers, the command palette, the landing's live demo.

Modal layers dim the room with black at 50–55%.

### Named Rules
**The Colour Against Colour Rule.** Docked surfaces separate by colour alone. A shadow says "this is lifted off the colour"; a surface that is part of the floor never gets one.

**The Flat Fill Rule.** Surfaces are single flat colours: no gradient fills, no glass or backdrop blur, no grain, no glow. The one gradient is a mask that fades a transcript's top edge under its header: the room's, and the landing demo's, which always fills with talk and lets its oldest line run up under the head.

## Shapes

Big and round. What you press is a full pill (buttons, channel rows, reactions, the search field, the composer's send, menu items, counts). What holds content has 28px corners (popovers, dialogs, drawers' inner edge, the composer, landing cards). Between them: 16px for fields, mention cards, attachments and form alerts; 20px for hover plates under message, member and inbox rows; 24px for menus; 10px for small focusable text and the wordmark.

Two custom silhouettes carry identity:
- **People** are twenty-one flat shapes in a 40×40 box: the eight given by handle (circle, flower, scallop, squircle, arch, clover, sparkle, pebble) and thirteen more a member can pick (star, burst, hexagon, pick, trefoil, wave, leaf, drop, bowl, blob, diamond, capsule, crown). Each keeps a solid centred disc of 60% of the box so an initial fits, the new ones stay inside the box, and no new shape overlaps any other by more than 0.92 when rasterised (`scripts/verify-faces.mjs` measures all three). A member's chosen face is stored by name with one of the surface's three face colours (`faceShape`, `faceTone`); until they choose, `generatedFace(handle)` picks one of the first eight and a colour by FNV-1a hash, exactly as before, so the same person is the same shape everywhere and nobody's shape changed when the catalogue grew. Uploaded photos are masked to the person's shape.
- **A club** is a split disc: the bright colour above, the deep colour as a lower band (from y 29 of 40 with an initial, y 24 without), the initial set heavy in the deep colour on the bright part. The same object from 16px to 104px; below 22px there is no initial. On its own room it is drawn `inverse`, in the surface's highlight.

The **mark** is two of the people shapes, a circle and a flower, overlapping by 4 in a 44×24 box, the flower cut out with a stroke in the surface's own colour. The wordmark sets "N", the mark, "k" in Funnel Display 800 on the type ramp (1.375rem in top bars, 1.875rem on the landing), the mark standing in for the two o's.

### Named Rules
**The Pill And Card Rule.** Pressable things are pills; containers are 28px cards. A new component picks one of the two before any other radius.

**The Solid People Rule.** People are always filled shapes. Presence is drawn around or beside a person, never by fading, outlining or greying the person.

**The Chosen By Name Rule.** A face is stored as a shape's name and a colour slot, never a path or a hex. The first eight names stay in their order forever (the handle hash picks from them); new shapes are only ever added after them, and the api refuses a name it does not know.

## Components

### Buttons
Pills of solid colour that squash when pressed.
- **Shape:** full pill, 44px high (landing hero actions 60px).
- **Primary:** the surface's highlight (`hi` / `on-hi`), 20px sides, 15px bold; wears the re-tint so it changes with the room. Hover brightens to 110%.
- **Secondary:** a chip resting on the surface (`chip` / `on-chip`); hover darkens to 95%.
- **Ghost:** bare secondary ink, 16px sides; hover lays the surface's 8% wash and lifts the text to `fg`.
- **Danger:** the alert fill with the surface colour as text.
- **Press / Focus / Disabled:** `:active` squashes to 90% scale and back over 180ms; focus is a 2.5px outline in the surface's `fg`, offset 2px; disabled drops to 50% opacity and loses the press. Nothing is outlined to look clickable.

### Chips (reactions, counts, pills)
- **Reactions:** 32px card pills under the message carrying up to a few faces of who reacted and a tabular count. Yours flips to the room's highlight, extrabold, and re-colours the faces in it; `aria-pressed` carries the state.
- **Counts:** pop pills (20–24px, extrabold 11–12px) that pop in; on the rail a 3px ring in the rail colour cuts them out of the disc. A 13px pop dot means "something new" without a count.
- **System lines** (joins) sit centred in a pill of the surface's 8% wash.

### Cards / Containers
- **Corner Style:** 28px (`card`); menus 24px; inline cards 16px.
- **Background:** `card-bg`, white by day, the club's near-black by night.
- **Shadow Strategy:** `card` shadow when resting on the colour, `float` when over the room (see Elevation & Depth).
- **Border:** none.
- **Internal Padding:** popovers 20px, dialogs 28px, inline cards 10px × 16px.

### Inputs / Fields
- **Style:** a chip you type into: 48px, `chip` fill, 16px corners, no border; bold label above at 6px; 16px type; placeholders in `fg-2`.
- **Focus:** a 2px inset ring in the surface's highlight.
- **Error:** a 2px inset ring in alert, and the message below as a card pill with the warning glyph (The Alert Lives On A Card Rule).
- **Composer:** a 28px-cornered card with the `card` shadow, an attach button, an auto-growing textarea, and a 40px round send button in the highlight that dims its glyph to 45% when there is nothing to send. Focus rings the whole card.

### Navigation
- **Rail:** 44px nook discs, 12px apart; the current one sits in a 2.5px ring in `fg`; hover grows discs to 105%, press shrinks to 95%. The "new nook" disc is an uncoloured chip with a plus that fills with the highlight on hover. The inbox and your own shape sit at the foot.
- **Wing:** the nook's name (Nook Name), then one quiet line with the member count and a small Invite chip (32px, pop-coloured glyph) at its end, then the 44px search pill with its shortcut, then 44px channel rows in quiet `fg-2`, medium. Name first, search second, invite as an aside: the search pill is the only full-width control above the channels. Unread lifts a row to `fg` bold with a pop count; the current row is a solid pill of the highlight with `on-hi` text, a swatch of where you are, and that pill slides from row to row when you move (see Motion). DM rows show the person's shape with a presence mark.
- **Mobile:** a menu button beside the room title opens the rail and wing as one drawer.

### Presence
Shape first, colour second, each on a halo of the surface colour: **online** a filled disc in the surface's `ring` colour (pop on the wing and rail, ink by day and bright by night on the stage, highlight on cards); **away** a half-filled disc; **do not disturb** a bar; **offline** an open ring, the last three in `fg-2`. In the who's-here strip, people who are here also wear a 2.4px ring in their own outline, scaled 130% around the shape.

### Message
Talk is set straight on the room's colour with no bubble: the author's shape (40px) in the gutter at the top of their run, the name extrabold with a caption time, the body at 15px. Hover lays a 20px-cornered 8% wash and shows a card action bar at the top right. A message that mentions you, or that failed to send, is lifted onto a card (onto the card's chip inside a thread). Mentions render as chips. Arriving from the inbox or a search, the message flashes a 16% wash that settles away over 2.4s.

### Channel Start
The top of an empty or fully scrolled channel shows up to six of the channel's people as filled shapes at 84px in a wrapped row (0.5rem gap), each popping in 60ms after the last, above "The start of #channel" in Title at the title colour, a line of description and a tabular member count. A channel with one person falls back to the club's inverse disc at 72px. A DM starts with the other person's 88px shape and name.

### Signature: The Story Turn
Changing nooks turns the screen like the faces of a cube, the way stories move from one account to the next (`story-turn.ts`, View Transitions). The browser snapshots the room being left, the new club is drawn, and the two snapshots turn together about their shared edge over 680ms on an ease-in-out (`cubic-bezier(0.7, 0, 0.2, 1)`: a solid thing turning, not a flick): picking a nook further down the rail turns forward, the old face swinging away to the left as the new one swings in from the right; back up turns the other way. The faces darken to 55% as they turn edge-on, over the new club's rail colour. Both faces are real screens, never a colour laid over one, and the re-tint is switched off while the turn runs (`html[data-turn] .tint`), so the incoming face arrives in its own colours. The turn waits for the shell to announce the new nook (`nook:shown`, at most 900ms). The rail, the Ctrl+K palette and the landing's club discs all turn; the landing's automatic advance just re-tints. Without View Transitions, or under reduced motion, the change is a plain cut.

### Story Bar
Above the landing's live demo, one 6px pill segment per demo club (6px apart), like the progress marks across the top of a story: a track in the surface's 14% wash with a fill in `fg`. Clubs already shown are full; the current one fills left to right over its script length × 2600ms + 5000ms, linearly, pausing when the demo is paused; a club the visitor picked is full at once. Under reduced motion the fill does not animate.

### Face Picker
In Edit profile, under the photo row: an 88px preview of you, then **Shape**, a radio grid of all twenty-one silhouettes (46px cells, drawn in the card's highlight so every one reads in both schemes; the chosen cell sits on the chip with a 2.5px ring in `fg`), and **Colour**, three 56px cells showing your shape and initial in each of the surface's face colours ("Each nook paints these from its own two colours"). Picking a shape morphs the preview from the old outline to the new one; with a photo, the colour row goes and the grid notes that the photo is cut to the shape. "Use the one I was given" goes back to the generated face. The preview card beside the form follows every pick before anything is saved.

### The Crowd (landing)
The first screen ends in a pile of people along its foot: the demo clubs' members and made-up others in all twenty-one shapes, in the club's face colours, re-tinting with it. The pile is laid out ahead of time from a seed (`crowd-layout.ts`: dropped one by one, resting on the floor on their whole box or on someone's shoulders as circles), in three layouts: from `xl` a mound heaped under the call to action (up to 300 units) with the six named people standing in front of it, left of the demo, and a trail of small people (under 52 units) along the floor beneath the demo, which floats over that half of the band; a 170-unit strip from `md`; a small one on phones. Only people at least 72% the size of the named six carry an initial, so it reads as a crowd, not an alphabet. The hero is clipped at its foot; the pile stands on that edge. From `xl` the crowd stands in front of the page's content (the layout keeps them clear of it at rest), so people can be tapped and thrown across it.

Every demo person wears a face of their own (the landing's data and the seeded app members share them: Mara sparkle, Jonas drop, Priya circle, Theo flower, Aiko star, Sam arch, Lena pebble, Dev leaf), so no two people in the demo look alike.

### Motion
- **Expo ease-out** (`cubic-bezier(0.16, 1, 0.3, 1)`, `--ease`; GSAP `"nook"`): hover, state, popups (200ms, from 90% scale), drawers (300ms), the re-tint, anything travelling.
- **Turn ease** (`cubic-bezier(0.7, 0, 0.2, 1)`): the story turn only, a cube turning in and out rather than flicked.
- **Pop ease** (`cubic-bezier(0.3, 1.4, 0.55, 1)`, `--ease-pop`; GSAP `"nook-pop"`): arrivals only. People, counts and badges pop in from 40% scale over 380ms; a sent message arrives from 12px below at 96% scale over 320ms; a count that changes lands again (keyed on its number).
- **Linear:** only the story bar's progress fill (time, not motion) and the landing flight's scrub (scroll, not time).
- **Loops:** only the typing dots (1.2s).
- **The runtime:** CSS keyframes for declared arrivals; the Web Animations API for one-shot pops on elements that already transition (reading the curve from its token, one keyframe so it lands on the resting value); GSAP (`lib/motion`, with `useGSAP` and `matchMedia`) for sequences, scroll, morphing and the crowd.
- **In the app:** the current-channel pill slides to the row you picked (420ms, expo) and re-tints on its fill alone; your own reaction pops its chip and a face joining a chip on screen slaps down beside the others (nothing pops for chips already there when the message appeared); the send arrow leaves through the top of its disc and a fresh one rises in (440ms); someone arriving in the who's-here strip grows their ring out from them (460ms, pop); picking a shape morphs the profile preview to it (500ms, expo, with a small 94%→100% squash): every shape is measured once as its radius at 120 angles round its centre, so the morph blends two lists of numbers each frame, with nothing to match up and nothing to twist.
- **On the landing:** the crowd jumps up into the room from below its floor in a loose wave (a jump, a fall, a squash on landing, a pop back), and can be played with: each person is a small body with a velocity and a spin (`crowd-physics.ts`); the cursor is a moving collider tested along its whole path, so a slow pass nudges people aside and a fast swipe kicks them into the air, tumbling, knocking into whoever they fly into (momentum handed on, never made); gravity brings them down with a bounce and a squash on landing, a spring walks them home and they right themselves to the nearest whole turn. A tap throws someone up to turn over. The crowd also hops when the page changes clubs (nearest the disc you pressed first). The club's name in the headline lands letter by letter (SplitText, 24ms apart). As the who's-here chapter comes up, its six people leave the pile and fly down into their seats, scrubbed to scroll, swaying up to 16° but never turning over, and passing behind the chapter's words rather than across them: the pile and the row are each clipped to their own section, so a person changes colour exactly as they cross the edge between rooms, and on landing whoever is here draws their ring on and the names come up under them. Each later chapter plays its piece once as it comes on screen, the way the app would: a message lands and its reactions pop on, thread replies arrive one after another, the file drops in and the link unfolds, the search types itself and its hits light up. No heading or paragraph moves.
- **Reduced motion:** every transition and animation above is cut, the story turn is a plain cut, popups lose their scale, and the settle flash holds as a static 10% wash. The crowd stands still where it rests, a swipe or a tap moves nobody, nobody flies, the headline swaps without letters landing, every chapter piece is simply there, the pill and the preview land at once, and the ring appears without growing.

### Named Rules
**The Tint Owns Its Element Rule.** `tint` transitions transform and opacity as well as colour, so a script never moves or fades an element that carries it: it animates a wrapper, or a Web Animation on a property the element is not transitioning. A GSAP tween on a tinted element reads the half-finished transition as its end state and lands wrong.

## Do's and Don'ts

### Do:
- **Do** paint with the surface vocabulary (`bg`, `fg`, `fg-2`, `hi`, `on-hi`, `chip`, `on-chip`, `ring`, `face-1..3`) and put the surface class on the element that is the surface.
- **Do** scope another club with `accentStyle(kit)` or `discStyle(kit)`, and add the re-tint to anything painted from the kit so it travels on a nook switch.
- **Do** keep every new text pair inside the contrast sweep: 6.5:1 text (6:1 on the stage), 4.5:1 secondary, 3:1 shapes and initials, measured on the surface hovered.
- **Do** lift what is about the reader (mentions, failed sends, field errors) onto a card; leave everything else on the colour.
- **Do** set poster-size heads on the room in the title colour (ink by day, the club's bright colour by night), and nothing smaller.
- **Do** make pressable things full pills and containers 28px cards.
- **Do** draw people through `Avatar` (their chosen face, or `generatedFace(handle)` until they choose) and a club as its split disc, at every size.
- **Do** tell presence apart by shape (disc, half disc, bar, open ring) before colour.
- **Do** keep the overshoot ease for arrivals and use the expo ease-out for hover and state, and take both from their tokens (`--ease`, `--ease-pop`, GSAP `"nook"`, `"nook-pop"`) rather than restating the curve.
- **Do** give every scripted motion a reduced-motion path that lands at once, and leave content visible if the script never runs.

### Don't:
- **Don't** hard-code a club's hex, or pick a kit colour's role by its position in the kit.
- **Don't** put alert text straight on the club's colour, or show alert without its glyph.
- **Don't** use the pop as a surface, a button fill or body text.
- **Don't** add gradient fills, glass, grain, glow, or a shadow on a docked surface.
- **Don't** outline a control to make it look clickable; rings mean current, here or focused.
- **Don't** fade or grey a person to show they are away or offline.
- **Don't** set messages, labels, controls or counts in Funnel Display.
- **Don't** use the overshoot ease on hover or state changes, or loop anything but the typing dots.
- **Don't** move or fade a `tint` element from a script; move its wrapper.
- **Don't** reorder or rename the first eight shapes, or store a face as anything but its name and colour slot.
