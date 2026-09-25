"use client";

import { Drawer } from "@base-ui/react/drawer";
import type { Channel, NookDetail } from "@nook/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ActiveThreadContext, ChatContext, type ChatContextValue } from "@/components/chat/chat-context";
import { ThreadPanel } from "@/components/chat/thread-panel";
import { CommandPalette } from "@/components/search/command-palette";
import { SearchPanel } from "@/components/search/search-panel";
import { accentStyle } from "@/lib/accent";
import { cssEase, reducedMotion } from "@/lib/motion";
import { NOOK_SHOWN } from "./story-turn";
import { ChannelSheet } from "./channel-sheet";
import { NookRail } from "./nook-rail";
import { MemberSheet } from "./member-sheet";

interface ShellControls {
  openNav(): void;
  openMembers(): void;
}

const ShellContext = createContext<ShellControls | null>(null);

/** Lets the channel header open the navigation and member drawers on small screens. */
export function useShell(): ShellControls {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellFrame>");
  return ctx;
}

/** Tailwind's xl breakpoint: where the thread gets its own card beside the room instead of a drawer. */
const XL = "(min-width: 80rem)";
function useIsXl() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(XL);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(XL).matches,
    () => true,
  );
}

const backdrop =
  "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out-expo data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

const drawerPopup =
  "[transform:translateX(var(--drawer-swipe-movement-x))] shadow-float outline-none transition-transform duration-300 ease-out-expo";

/** What the column beside the room holds: a thread (in the channel it belongs to) or search results. */
type Side = { kind: "thread"; id: string; channel: Channel } | { kind: "search"; q: string };
const sideKey = (s: Side | null) => (s ? (s.kind === "thread" ? `thread:${s.id}` : `search:${s.q}`) : null);

/** How long the column takes to open or fold away (the grid's transition below). */
const SIDE_MS = 420;

interface ShellFrameProps {
  detail: NookDetail;
  activeChannelId: string | null;
  meId: string;
  children: ReactNode;
}

/**
 * The shell: the nook rail, the channel list, and the room.
 *
 * Three surfaces made from the club's two colours, meeting edge to edge with no rule between them:
 * the rail and the wing in its deep colour, the room drenched in its bright one (its deep one by
 * night). Who's here lives across the top of the room rather than in a fourth column, so people
 * come first and the conversation gets the width; the full member list, a thread or search results
 * open as a card over the colour. Switching nooks swaps the kit on the document root, and the
 * new club is poured over the screen (story-turn).
 */
export function ShellFrame({ detail, activeChannelId, meId, children }: ShellFrameProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const controls = useMemo(() => ({ openNav: () => setNavOpen(true), openMembers: () => setMembersOpen(true) }), []);
  const slug = detail.nook.slug;
  const kit = detail.nook.kit;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlThread = params.get("thread");
  const searchQuery = params.get("q");
  const isXl = useIsXl();
  const activeChannel = detail.channels.find((c) => c.id === activeChannelId);

  // The open thread lives in the URL, so it survives reloads and can be linked to. Written with the
  // history API, which Next keeps `useSearchParams` in step with: nothing on the server reads it, so
  // there is no round trip to wait for. Next applies it as a low-priority update, though, so the
  // click also sets the thread here, at the click's own priority, and the column opens (or folds) on
  // the click; the URL catches up behind it.
  const [picked, setPicked] = useState<{ id: string | null } | null>(null);
  if (picked && picked.id === urlThread) setPicked(null);
  const threadId = picked ? picked.id : urlThread;
  const openThread = activeChannel && threadId ? threadId : null;
  const setThread = useCallback(
    (rootId: string | null) => {
      setPicked({ id: rootId });
      window.history.replaceState(null, "", rootId ? `${pathname}?thread=${rootId}` : pathname);
    },
    [pathname],
  );
  const chat = useMemo<ChatContextValue>(() => {
    const byHandle = new Map(detail.members.map((m) => [m.handle, m]));
    return {
      slug: detail.nook.slug,
      members: new Map(detail.members.map((m) => [m.id, m])),
      meId,
      openThread: (rootId) => setThread(rootId),
      resolveMention: (handle) => {
        const m = byHandle.get(handle);
        return m ? { id: m.id, name: m.displayName, isMe: m.id === meId } : null;
      },
    };
  }, [detail.members, detail.nook.slug, meId, setThread]);
  // Search results stay open while you jump between them (the URL carries ?q= along); a thread takes the column over.
  const side: Side | null =
    activeChannel && openThread
      ? { kind: "thread", id: openThread, channel: activeChannel }
      : searchQuery
        ? { kind: "search", q: searchQuery }
        : null;
  const closeSidePanel = () => (side?.kind === "thread" ? setThread(null) : router.replace(pathname, { scroll: false }));
  const renderSide = (s: Side) =>
    s.kind === "thread" ? (
      <ThreadPanel key={s.id} rootId={s.id} channel={s.channel} onClose={() => setThread(null)} />
    ) : (
      <SearchPanel
        key={s.q}
        slug={slug}
        nookName={detail.nook.name}
        query={s.q}
        focusedId={params.get("m")}
        onQueryChange={(q) => router.replace(`${pathname}?${new URLSearchParams({ q })}`, { scroll: false })}
        onClose={() => router.replace(pathname, { scroll: false })}
      />
    );
  // Closing, the panel stays on screen while its column folds away (or its drawer slides off), and
  // is let go once it is out of sight.
  const [shownSide, setShownSide] = useState<Side | null>(side);
  const [leaving, setLeaving] = useState(false);
  if (side) {
    if (sideKey(side) !== sideKey(shownSide)) setShownSide(side);
    if (leaving) setLeaving(false);
  } else if (shownSide && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const done = window.setTimeout(
      () => {
        setShownSide(null);
        setLeaving(false);
      },
      reducedMotion() ? 0 : SIDE_MS + 60,
    );
    return () => window.clearTimeout(done);
  }, [leaving]);
  // The card's slide, run with the column's own growth (the grid below) on the same clock and curve.
  const isOpen = !!side;
  const slide = useRef<HTMLDivElement>(null);
  const shownOpen = useRef(isOpen);
  useLayoutEffect(() => {
    if (isOpen === shownOpen.current) return;
    shownOpen.current = isOpen;
    const card = slide.current;
    if (!card || reducedMotion()) return;
    // From wherever the card is (a slide cut short by the other one sets off from mid-way).
    const from = getComputedStyle(card).transform;
    for (const run of card.getAnimations()) run.cancel();
    const away = "translateX(100%)";
    const timing = { duration: SIDE_MS, easing: cssEase("--ease") };
    if (isOpen) card.animate([{ transform: from === "none" ? away : from }, { transform: "none" }], timing);
    else card.animate([{ transform: from }, { transform: away }], { ...timing, fill: "forwards" });
  }, [isOpen]);
  const onScreen = side ?? shownSide;
  const sidePanel = onScreen ? renderSide(onScreen) : null;

  /*
   * Popovers, menus and drawers portal to <body>, outside this frame, so the nook's accent has to
   * live on the document root as well as on the subtree. Setting it here rather than swapping a
   * stylesheet is what lets the change animate: the properties are the same, only their values
   * move, and every `tint` element transitions between them.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const vars = Object.entries(accentStyle(kit)) as [string, string][];
    for (const [name, value] of vars) root.style.setProperty(name, value);
    return () => {
      for (const [name] of vars) root.style.removeProperty(name);
    };
  }, [kit]);
  // A story turn waits for this: the new nook is on screen, in its colours.
  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent(NOOK_SHOWN, { detail: slug }));
  }, [slug]);

  return (
    <ShellContext value={controls}>
      <ChatContext value={chat}>
        <ActiveThreadContext value={openThread}>
          <CommandPalette detail={detail} meId={meId}>
            {/* Keyboard users skip the rail and conversation list straight to the conversation. */}
            <a
              href="#conversation"
              className="surface-card fixed top-3 left-3 z-60 -translate-y-24 rounded-full px-5 py-3 text-base font-bold shadow-float transition-transform focus-visible:translate-y-0"
            >
              Skip to conversation
            </a>
            {/*
             * From xl the thread has a column of its own, 0 wide when nothing is open. Opening, the
             * column grows to 420px and the room gives way beside it, its conversation and composer
             * narrowing as it goes, while the card slides in from the right (a transform on the
             * compositor, so drawing the thread never holds it up) on the same clock and curve: its
             * left edge is the room's right edge all the way. Closing runs the same the other way.
             */}
            <div
              style={{ ...accentStyle(detail.nook.kit), "--side": isOpen ? "420px" : "0px" } as CSSProperties}
              data-testid="shell"
              data-side={side ? "open" : shownSide ? "closing" : undefined}
              className="surface-stage tint grid h-dvh grid-cols-[minmax(0,1fr)] md:grid-cols-[76px_280px_minmax(0,1fr)] xl:grid-cols-[76px_280px_minmax(0,1fr)_var(--side)] shell-columns"
            >
              <div className="hidden md:block">
                <NookRail activeSlug={slug} />
              </div>
              <div className="hidden min-h-0 md:block">
                <ChannelSheet detail={detail} activeChannelId={activeChannelId} meId={meId} />
              </div>
              <main id="conversation" tabIndex={-1} className="@container flex min-h-0 min-w-0 flex-col outline-none">
                {children}
              </main>
              {isXl && (
                // The card hangs from the right edge of its column, so it sits over the room while the
                // column is still 0 wide and fills the column once it is 420.
                <div className="relative hidden min-h-0 min-w-0 xl:block">
                  {sidePanel && (
                    <div ref={slide} data-side-panel className="absolute inset-y-0 right-0 z-10 w-[420px] py-3 pr-3 will-change-transform">
                      <div className="surface-card tint h-full overflow-hidden rounded-card shadow-card">{sidePanel}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Small screens: the rail and conversation list slide in from the left. */}
            <Drawer.Root open={navOpen} onOpenChange={setNavOpen} swipeDirection="left">
              <Drawer.Portal>
                <Drawer.Backdrop className={backdrop} />
                <Drawer.Viewport className="fixed inset-0 z-50 flex">
                  <Drawer.Popup
                    style={accentStyle(detail.nook.kit)}
                    className={`${drawerPopup} flex h-full w-[min(356px,calc(100vw-3rem))] data-[ending-style]:[transform:translateX(-100%)] data-[starting-style]:[transform:translateX(-100%)]`}
                  >
                    <Drawer.Title className="sr-only">Nooks and channels</Drawer.Title>
                    <NookRail activeSlug={slug} />
                    <div className="min-w-0 flex-1">
                      <ChannelSheet detail={detail} activeChannelId={activeChannelId} meId={meId} onNavigate={() => setNavOpen(false)} />
                    </div>
                  </Drawer.Popup>
                </Drawer.Viewport>
              </Drawer.Portal>
            </Drawer.Root>

            {/* Everyone in the nook, beyond the who's-here strip: a card that slides in from the right. */}
            <Drawer.Root open={membersOpen} onOpenChange={setMembersOpen} swipeDirection="right">
              <Drawer.Portal>
                <Drawer.Backdrop className={backdrop} />
                <Drawer.Viewport className="fixed inset-0 z-50 flex justify-end">
                  <Drawer.Popup
                    style={accentStyle(detail.nook.kit)}
                    className={`${drawerPopup} surface-card h-full w-[min(360px,calc(100vw-3rem))] rounded-l-card data-[ending-style]:[transform:translateX(100%)] data-[starting-style]:[transform:translateX(100%)]`}
                  >
                    <Drawer.Title className="sr-only">Members</Drawer.Title>
                    <MemberSheet slug={detail.nook.slug} members={detail.members} meId={meId} />
                  </Drawer.Popup>
                </Drawer.Viewport>
              </Drawer.Portal>
            </Drawer.Root>

            {/* Below xl: the thread or the search results slide in from the right (full width on phones). */}
            <Drawer.Root open={!isXl && !!side} onOpenChange={(open) => !open && closeSidePanel()} swipeDirection="right">
              <Drawer.Portal>
                <Drawer.Backdrop className={backdrop} />
                <Drawer.Viewport className="fixed inset-0 z-50 flex justify-end">
                  <Drawer.Popup
                    style={accentStyle(detail.nook.kit)}
                    className={`${drawerPopup} surface-card h-full w-[min(440px,100vw)] data-[ending-style]:[transform:translateX(100%)] data-[starting-style]:[transform:translateX(100%)] sm:rounded-l-card`}
                  >
                    <Drawer.Title className="sr-only">{shownSide?.kind === "thread" ? "Thread" : "Search"}</Drawer.Title>
                    {!isXl && sidePanel}
                  </Drawer.Popup>
                </Drawer.Viewport>
              </Drawer.Portal>
            </Drawer.Root>
          </CommandPalette>
        </ActiveThreadContext>
      </ChatContext>
    </ShellContext>
  );
}
