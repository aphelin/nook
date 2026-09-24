"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useCallback, useState } from "react";
import { NookDisc } from "@/components/brand/nook-disc";
import { Wordmark } from "@/components/brand/wordmark";
import { originOf, Wipe, wipeTo } from "@/components/shell/wipe";
import { ApiRequestError } from "@/lib/api";
import { accentStyle } from "@/lib/accent";
import { useSession } from "@/lib/session";
import { Chapters } from "./chapters";
import { CLUBS } from "./clubs";
import { LiveNook, PauseButton, REST_MS, STEP_MS } from "./live-nook";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL;

function TryTheDemo() {
  const { state, signInDemo } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = state.status === "authenticated";

  async function start() {
    if (signedIn) return router.push("/app");
    setPending(true);
    setError(null);
    try {
      await signInDemo();
      router.push("/app/tuesday-climbers");
    } catch (err) {
      setPending(false);
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? "The demo isn’t set up on this server. Sign up to look around instead."
          : "Couldn’t open the demo. Try again in a moment.",
      );
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {/* The loudest thing on the page, in the club's other colour. */}
        <button
          type="button"
          onClick={() => void start()}
          disabled={pending}
          aria-busy={pending || undefined}
          className="tint press inline-flex h-15 items-center gap-3 rounded-full bg-hi px-8 text-lg font-extrabold text-on-hi hover:scale-[1.03] disabled:opacity-70"
        >
          {pending ? "Opening…" : signedIn ? "Open Nook" : "Try the demo"}
          <ArrowRight size={21} weight="bold" aria-hidden="true" />
        </button>
        {!signedIn && (
          <Link
            href="/signup"
            className="tint inline-flex h-15 items-center rounded-full bg-chip px-7 text-lg font-bold text-on-chip no-underline hover:scale-[1.03]"
          >
            Sign up
          </Link>
        )}
      </div>
      <p className="mt-5 max-w-[42ch] text-base font-medium text-pretty">
        {signedIn
          ? "You’re signed in. Your nooks are one click away."
          : "One click signs you in as Mara, a made-up member of the demo clubs. No sign-up needed."}
      </p>
      {error && (
        <p role="alert" className="field-error mt-3 max-w-[44ch] text-base font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

function TopBar() {
  const { state } = useSession();
  const signedIn = state.status === "authenticated";
  const link = "inline-flex h-11 items-center rounded-full px-4 text-base font-bold transition-colors duration-150 hover:bg-hover";
  return (
    <header className="flex items-center justify-between gap-4">
      <Wordmark href="/" size="lg" />
      <nav aria-label="Account" className="flex items-center gap-1.5">
        {signedIn ? (
          <Link href="/app" className={link}>
            Open Nook
          </Link>
        ) : (
          <>
            <Link href="/login" className={link}>
              Sign in
            </Link>
            <Link href="/signup" className={`${link} tint bg-chip text-on-chip hover:bg-chip hover:brightness-95`}>
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

/**
 * The club's name in the headline.
 *
 * Every name is laid in the same grid cell and only the current one is visible, so the headline is
 * always as tall as its longest name and switching clubs never moves anything below it. The
 * current name is keyed on the club, so it remounts and lands again.
 */
function ClubName({ index }: { index: number }) {
  return (
    <span className="grid">
      {CLUBS.map((c, i) =>
        i === index ? (
          <span key={`on-${c.id}`} className="pop-in col-start-1 row-start-1 origin-left sm:whitespace-nowrap">
            {c.name}.
          </span>
        ) : (
          <span key={c.id} aria-hidden="true" className="invisible col-start-1 row-start-1 sm:whitespace-nowrap">
            {c.name}.
          </span>
        ),
      )}
    </span>
  );
}

/**
 * The story bar over the live demo: one segment per club, filling while that club's conversation
 * plays, like the progress marks across the top of a story. Clubs already shown stay full; a club
 * you picked yourself is full at once, because the page has stopped advancing.
 */
function StoryBar({ index, playing, picked }: { index: number; playing: boolean; picked: boolean }) {
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      {CLUBS.map((c, i) => (
        <span key={c.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover-strong">
          {i < index || (i === index && picked) ? (
            <span className="block h-full rounded-full bg-fg" />
          ) : i === index ? (
            <span
              key={index}
              className="story-progress block h-full rounded-full bg-fg"
              style={
                {
                  "--story-ms": `${c.script.length * STEP_MS + REST_MS}ms`,
                  animationPlayState: playing ? "running" : "paused",
                } as CSSProperties
              }
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}

/**
 * The landing page is a story you tap through.
 *
 * The first screen is one club's colour, edge to edge, with its name set huge in the headline and a
 * real nook running beside it, so the interface is what the visitor reads first and the sentence
 * about it second. While the demo plays the headline moves on to the next club each time a
 * conversation finishes; tapping a club's disc keeps it there, and its colour wipes across the page
 * from the disc you pressed. Either way the kit swaps on this subtree and every `tint` element — the
 * name, the wordmark, the live app — re-tints with it. That is the same mechanism the shell uses
 * when you switch nooks for real; nothing here is a special landing-page effect.
 */
export function Landing() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Once someone picks a club, the page stops choosing for them.
  const [picked, setPicked] = useState(false);
  const club = CLUBS[index]!;
  const nextClub = useCallback(() => setIndex((i) => (i + 1) % CLUBS.length), []);

  return (
    <div style={accentStyle(club.kit)} className="min-h-dvh">
      <section aria-labelledby="landing-heading" className="surface-stage tint relative isolate flex min-h-svh flex-col">
        <div className="relative mx-auto flex w-full max-w-[90rem] flex-1 flex-col px-5 pt-5 pb-12 sm:px-8 xl:px-12">
          <TopBar />
          <h1
            id="landing-heading"
            className="mt-12 font-display text-4xl leading-[0.92] font-extrabold tracking-[-0.04em] text-balance text-title sm:mt-16"
          >
            <span className="block">Chat in the colours of</span> <ClubName index={index} />
          </h1>
          <div className="mt-10 grid flex-1 gap-10 xl:mt-12 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-16">
            <div className="flex flex-col gap-9">
              {/*
                The control that re-tints the page, right under the name it changes. The discs carry
                no labels of their own: the headline above them already says whose colours these are.
              */}
              <div>
                <Tooltip.Provider delay={200}>
                  <div role="group" aria-label="Try another club" className="flex flex-wrap gap-3">
                    {CLUBS.map((c, i) => (
                      <Tooltip.Root key={c.id}>
                        <Tooltip.Trigger
                          render={
                            <button
                              type="button"
                              aria-label={c.name}
                              aria-pressed={i === index}
                              onClick={(e) => {
                                if (i !== index) wipeTo(c.kit, originOf(e).x, originOf(e).y);
                                setIndex(i);
                                setPicked(true);
                              }}
                              className={`rounded-full transition-[scale] duration-200 ease-out-expo hover:scale-110 active:scale-95 ${
                                i === index ? "p-[4px] ring-[3px] ring-fg ring-inset" : "p-[7px]"
                              }`}
                            />
                          }
                        >
                          <NookDisc kit={c.kit} initial={c.name[0]} size={68} className="size-14 sm:size-[68px]" />
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Positioner sideOffset={10} className="z-50">
                            <Tooltip.Popup className="surface-card rounded-full px-3.5 py-2 text-sm font-bold shadow-float">
                              {c.name}
                            </Tooltip.Popup>
                          </Tooltip.Positioner>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    ))}
                  </div>
                </Tooltip.Provider>
              </div>
              <div>
                <p className="max-w-[34ch] text-xl leading-snug font-medium text-pretty sm:text-2xl">
                  Nook is chat for clubs and communities — channels, threads and direct messages — and your group’s own colours fill the
                  whole thing.
                </p>
                <div className="mt-8">
                  <TryTheDemo />
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-3 self-end">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-sm font-bold">A live demo. The club and its people are made up.</p>
                <PauseButton playing={playing} onToggle={() => setPlaying((p) => !p)} />
              </div>
              <StoryBar index={index} playing={playing} picked={picked} />
              {/*
                The app sits colour against colour with the page it came from: a shadow, never a frame.
                It always shows its day colours, so at night the club's bright room lights up the dark
                page instead of dissolving into a room of the same navy.
              */}
              <figure
                className="h-[30rem] min-h-0 rounded-[1.75rem] shadow-float [color-scheme:light] sm:h-[34rem] xl:h-[clamp(24rem,calc(100svh-27rem),34rem)]"
                aria-label={`Live demo: ${club.name} chatting in #${club.channel}`}
              >
                <LiveNook club={club} playing={playing} onFinished={picked ? undefined : nextClub} />
              </figure>
            </div>
          </div>
        </div>
      </section>

      <Chapters />

      {/* The build notes, for the engineers: a white card of a page after all that colour. */}
      <section aria-labelledby="built-heading" className="surface-card">
        <div className="mx-auto max-w-[90rem] px-5 py-24 sm:px-8 xl:px-12">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <h2
                id="built-heading"
                className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] font-extrabold tracking-[-0.04em]"
              >
                How it’s built
              </h2>
              <p className="mt-6 max-w-[42ch] text-lg text-pretty text-fg-2">
                Nook is a portfolio project: a full-stack chat app meant to be read as well as used. Everything here runs from one command.
              </p>
              <pre className="mt-8 w-fit max-w-full overflow-x-auto rounded-full bg-hi px-6 py-4 font-mono text-base font-semibold text-on-hi">
                <code>docker compose up</code>
              </pre>
              <p className="mt-4 text-base text-fg-2">Then open localhost:8080 and press Try the demo.</p>
              {REPO_URL && (
                <a
                  href={REPO_URL}
                  className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-chip px-6 text-base font-bold text-on-chip no-underline"
                >
                  Read the code <ArrowRight size={17} weight="bold" aria-hidden="true" />
                </a>
              )}
            </div>
            <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {BUILT.map(([term, detail]) => (
                <div key={term} className="border-t-[3px] border-fg pt-5">
                  <dt className="font-display text-2xl leading-none font-extrabold tracking-[-0.02em]">{term}</dt>
                  <dd className="mt-3 text-base leading-relaxed text-pretty text-fg-2">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <footer className="surface-rail tint">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-4 px-5 py-9 text-sm font-medium sm:px-8 xl:px-12">
          <p>Nook is a portfolio project. Every club, person and message in the demo is made up.</p>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/login" className="underline underline-offset-4 hover:no-underline">
              Sign in
            </Link>
            <Link href="/signup" className="underline underline-offset-4 hover:no-underline">
              Sign up
            </Link>
            <Link href="/status" className="underline underline-offset-4 hover:no-underline">
              Status
            </Link>
          </nav>
        </div>
      </footer>
      <Wipe />
    </div>
  );
}

const BUILT: [string, string][] = [
  [
    "Realtime",
    "Socket.IO with a Redis adapter, so two api replicas behind nginx deliver every message, typing hint and presence change to the right people. Presence runs on Redis leases that expire when a replica dies.",
  ],
  [
    "Data",
    "PostgreSQL through Prisma. Ids are UUIDv7, so they sort by time and double as pagination cursors; unread is one read pointer per channel. Search is Postgres full-text on a generated column.",
  ],
  [
    "Background work",
    "A BullMQ worker makes image thumbnails, fetches link previews behind an SSRF guard, and sweeps abandoned uploads, then reaches browsers through a Redis emitter.",
  ],
  [
    "Auth",
    "Short-lived JWTs held in memory and rotating refresh tokens in an httpOnly cookie, with reuse detection that revokes the whole family.",
  ],
  ["Frontend", "Next.js 16, React 19, Tailwind 4 and Base UI, with TanStack Query holding server state that the socket keeps current."],
  [
    "Checked",
    "API tests against real Postgres, Redis and S3; Playwright through the whole Docker stack; axe on every screen; and Impeccable’s design review.",
  ],
];
