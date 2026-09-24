"use client";

import { Menu } from "@base-ui/react/menu";
import { type ManualStatus } from "@nook/contracts";
import { Check, PencilSimple, Plus, SignOut } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "@/components/brand/mark";
import { NookDisc } from "@/components/brand/nook-disc";
import Link from "next/link";
import { StatusLine } from "@/components/people/person-card";
import { useProfileEditor } from "@/components/people/profile-dialog";
import { Avatar } from "@/components/ui/avatar";
import { PresenceShape } from "@/components/ui/presence-shape";
import { chooseStatus, useManualStatus } from "@/lib/presence";
import { useNooks } from "@/lib/queries";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { countLabel, useUnread } from "@/lib/unread";
import { Inbox } from "./inbox";
import { originOf, wipeTo } from "./wipe";

const STATUSES: { value: ManualStatus; label: string; hint: string }[] = [
  { value: "online", label: "Automatic", hint: "Online while you’re here" },
  { value: "away", label: "Away", hint: "Show as away everywhere" },
  { value: "dnd", label: "Do not disturb", hint: "Show that you’d rather not be pinged" },
];

export const menuPopup =
  "surface-card min-w-[16rem] origin-[var(--transform-origin)] rounded-[1.5rem] p-2 shadow-float outline-none transition-[opacity,scale] duration-200 ease-out-expo data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0";
export const menuItem =
  "flex h-10 cursor-default items-center gap-2.5 rounded-full px-3.5 text-base font-medium outline-none data-[highlighted]:bg-chip";

/**
 * The rail: every nook you are in, as its colours.
 *
 * The club's deep colour, a step deeper than the wing beside it, with each nook as a disc of its
 * own two colours. The one you are in wears a ring, like a story you are watching; a nook with
 * something new carries a dot in the pop colour, or a count when there is something for you. Your
 * inbox and your own shape sit at the foot.
 */
export function NookRail({ activeSlug }: { activeSlug: string | null }) {
  const nooks = useNooks();
  const { state, signOut } = useSession();
  const { socket } = useRealtime();
  const status = useManualStatus();
  const editor = useProfileEditor();
  const unread = useUnread().data;

  function nookUnread(nookId: string) {
    let any = false;
    let forYou = 0;
    for (const c of unread?.channels ?? []) {
      if (c.nookId !== nookId || c.unread === 0) continue;
      any = true;
      forYou += c.kind === "direct" ? c.unread : c.mentions;
    }
    return { any, forYou };
  }

  return (
    <nav aria-label="Nooks" className="surface-rail tint flex h-full w-19 flex-col items-center pt-5">
      <Link
        href="/app"
        aria-label="Nook home"
        className="mb-5 shrink-0 rounded-chip p-1 transition-transform duration-200 ease-out-expo hover:scale-110"
      >
        <Mark size={34} variant="kit" />
      </Link>
      <ul className="flex w-full flex-col items-center gap-3 overflow-y-auto px-1 py-1.5">
        {nooks.data?.map((nook) => {
          const active = nook.slug === activeSlug;
          const { any, forYou } = nookUnread(nook.id);
          return (
            <li key={nook.id} className="w-full">
              <Link
                href={`/app/${nook.slug}`}
                title={nook.name}
                aria-current={active ? "page" : undefined}
                aria-label={`${nook.name}${forYou ? `, ${countLabel(forYou)} for you` : any ? ", unread messages" : ""}`}
                data-unread={any || undefined}
                onClick={(e) => {
                  if (active || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  const { x, y } = originOf(e);
                  wipeTo(nook.kit, x, y);
                }}
                className="group mx-auto flex w-fit items-center justify-center rounded-full"
              >
                <span
                  className={`relative grid place-items-center rounded-full transition-[scale] duration-200 ease-out-expo group-hover:scale-105 group-active:scale-95 ${
                    active ? "p-[3px] ring-[2.5px] ring-fg ring-inset" : "p-[5.5px]"
                  }`}
                >
                  <NookDisc kit={nook.kit} initial={nook.name[0]} size={44} />
                  {any && !active && (
                    <span
                      aria-hidden="true"
                      data-num
                      className="pop-in absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-pop text-2xs leading-none font-extrabold text-on-pop ring-[3px] ring-rail"
                      style={forYou > 0 ? { minWidth: 20, height: 20, padding: "0 5px" } : { width: 13, height: 13 }}
                    >
                      {forYou > 0 ? countLabel(forYou, 100) : ""}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="w-full">
          <Link
            href="/app/new"
            aria-label="Start a nook"
            title="Start a nook"
            className="group mx-auto grid size-[55px] place-items-center rounded-full"
          >
            {/* A disc not yet coloured in: a nook that is not started yet. */}
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-full bg-chip text-fg-2 transition-[scale,color,background-color] duration-200 ease-out-expo group-hover:scale-105 group-hover:bg-hi group-hover:text-on-hi"
            >
              <Plus size={20} weight="bold" />
            </span>
          </Link>
        </li>
      </ul>

      {state.status === "authenticated" && (
        <div className="mt-auto flex w-full flex-col items-center gap-3 pt-3 pb-4">
          <Inbox />
          <Menu.Root>
            <Menu.Trigger
              aria-label={`Account: ${state.user.displayName}`}
              className="rounded-full p-1 transition-[scale] duration-200 ease-out-expo hover:scale-105 data-[popup-open]:scale-105"
            >
              <Avatar user={state.user} size={38} presence={status === "online" ? "online" : status} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="right" align="end" sideOffset={10} className="z-50">
                <Menu.Popup className={menuPopup}>
                  <div className="flex items-center gap-3 px-3 pt-2 pb-3">
                    <Avatar user={state.user} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg leading-tight font-extrabold tracking-[-0.01em]">
                        {state.user.displayName}
                      </p>
                      <p className="text-sm text-fg-2">@{state.user.handle}</p>
                    </div>
                  </div>
                  <StatusLine user={state.user} className="-mt-1 max-w-[15rem] px-3 pb-2 text-sm text-fg-2" />
                  <Menu.Item onClick={editor.open} className={menuItem}>
                    <PencilSimple size={16} aria-hidden="true" /> Edit profile
                  </Menu.Item>
                  <Menu.Separator className="mx-3 my-1.5 h-px bg-line" />
                  <Menu.Group>
                    <Menu.GroupLabel className="px-3.5 pt-1 pb-1.5 text-sm font-bold text-fg-2">Status</Menu.GroupLabel>
                    <Menu.RadioGroup value={status} onValueChange={(v: ManualStatus) => void chooseStatus(socket, v)}>
                      {STATUSES.map((s) => (
                        <Menu.RadioItem
                          key={s.value}
                          value={s.value}
                          closeOnClick
                          className="grid cursor-default grid-cols-[0.875rem_minmax(0,1fr)_1rem] items-center gap-2.5 rounded-[1rem] px-3.5 py-2 outline-none data-[highlighted]:bg-chip"
                        >
                          <PresenceShape state={s.value} size={12} />
                          <span>
                            <span className="block text-base font-medium">{s.label}</span>
                            <span className="block text-xs text-fg-2">{s.hint}</span>
                          </span>
                          <Menu.RadioItemIndicator>
                            <Check size={14} weight="bold" aria-hidden="true" />
                          </Menu.RadioItemIndicator>
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </Menu.Group>
                  <Menu.Separator className="mx-3 my-1.5 h-px bg-line" />
                  <Menu.Item render={<Link href="/app/new" />} className={menuItem}>
                    <Plus size={16} aria-hidden="true" /> Start a nook
                  </Menu.Item>
                  <Menu.Item onClick={() => void signOut()} className={menuItem}>
                    <SignOut size={16} aria-hidden="true" /> Sign out
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}
    </nav>
  );
}
