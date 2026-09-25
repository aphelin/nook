"use client";

import { Popover } from "@base-ui/react/popover";
import type { PresenceState, PublicUser } from "@nook/contracts";
import { ChatCircle, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PRESENCE_LABEL } from "@/components/ui/presence-shape";
import { usePresence } from "@/lib/presence";
import { liveStatus } from "@/lib/profile";
import { useOpenDirect } from "@/lib/queries";
import { useProfileEditor } from "./profile-dialog";

const clock = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("en", { weekday: "long" });
const monthYear = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

/** "until 5:30 PM", "until Tuesday". */
export function untilLabel(iso: string) {
  const d = new Date(iso);
  return `until ${d.toDateString() === new Date().toDateString() ? clock.format(d) : weekday.format(d)}`;
}

/** A status as one line: the emoji, then the words. */
export function StatusLine({ user, className = "" }: { user: Pick<PublicUser, "status">; className?: string }) {
  const status = liveStatus(user.status);
  if (!status) return null;
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${className}`}>
      {status.emoji && <span aria-hidden="true">{status.emoji}</span>}
      <span className="truncate">{status.text ?? ""}</span>
      {!status.text && status.emoji && <span className="sr-only">Status: {status.emoji}</span>}
    </span>
  );
}

/** The status emoji beside a name, with the words as its label. */
export function StatusEmoji({ user }: { user: Pick<PublicUser, "status"> }) {
  const status = liveStatus(user.status);
  if (!status?.emoji) return null;
  return (
    <span
      role="img"
      aria-label={`Status: ${status.text ?? status.emoji}`}
      title={status.text ?? undefined}
      className="shrink-0 text-[0.9375em] leading-none"
    >
      {status.emoji}
    </span>
  );
}

export type Person = PublicUser & { joinedAt?: string; isOwner?: boolean };

interface PersonCardProps {
  person: Person;
  presence?: PresenceState;
  /** What the card's button does; omitted in the editor's preview. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Someone's card, like the cover of their story: a band of the club's colour with their shape big
 * on it, their name set loud, then the few facts that help you place them. The shape leads because
 * in this product people are the content — and it is the same shape, from the same handle, that
 * sits beside every message they have sent.
 */
export function PersonCard({ person, presence, actions, className = "w-[21rem] max-w-[calc(100vw-1.5rem)]" }: PersonCardProps) {
  const status = liveStatus(person.status);
  const facts = [person.pronouns, person.isOwner ? "Founder" : null].filter(Boolean).join(" · ");
  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="surface-stage tint h-20" aria-hidden="true" />
      <div className="px-5 pb-5">
        <div className="-mt-12 flex items-end justify-between gap-3">
          <span className="p-1.5">
            <Avatar user={person} size={80} presence={presence} halo={6} />
          </span>
        </div>
        <p className="mt-3 font-display text-2xl leading-[1.05] font-extrabold tracking-[-0.02em] break-words text-fg">
          {person.displayName}
        </p>
        <p className="mt-1 truncate text-base font-medium text-fg-2">
          @{person.handle}
          {facts && ` · ${facts}`}
        </p>
        {status && (
          <p className="mt-4 flex items-baseline gap-2 rounded-field bg-chip px-3.5 py-2.5 text-base font-medium text-on-chip">
            {status.emoji && <span aria-hidden="true">{status.emoji}</span>}
            <span className="min-w-0 flex-1 break-words">
              {status.text ?? <span className="sr-only">Status: {status.emoji}</span>}
              {status.expiresAt && <span className="text-fg-2"> · {untilLabel(status.expiresAt)}</span>}
            </span>
          </p>
        )}
        {person.bio && <p className="mt-3 text-base text-pretty break-words">{person.bio}</p>}

        <p className="mt-4 flex flex-wrap items-center gap-x-2 text-sm font-medium text-fg-2">
          {presence && <span className={presence === "online" ? "font-extrabold text-fg" : ""}>{PRESENCE_LABEL[presence]}</span>}
          {presence && person.joinedAt && <span aria-hidden="true">·</span>}
          {person.joinedAt && <span data-num>Member since {monthYear.format(new Date(person.joinedAt))}</span>}
        </p>
        {actions && <div className="mt-5 flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

interface PersonTriggerProps {
  person: Person;
  slug: string;
  meId: string;
  /** The element that opens the card: a name or an avatar. */
  render?: ComponentProps<typeof Popover.Trigger>["render"];
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  label?: string;
}

/** Hover (after a beat), click or press Enter on a name to see who it is. */
export function PersonTrigger({ person, slug, meId, render, children, side = "right", className, label }: PersonTriggerProps) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(slug).data?.[person.id] ?? "offline";
  const isMe = person.id === meId;
  const router = useRouter();
  const openDirect = useOpenDirect(slug);
  const editor = useProfileEditor();
  const [error, setError] = useState<string | null>(null);

  async function message() {
    setError(null);
    try {
      const channel = await openDirect.mutateAsync(person.id);
      setOpen(false);
      router.push(`/app/${slug}/${channel.id}`);
    } catch {
      setError("Couldn’t open the conversation. Try again.");
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={450}
        closeDelay={120}
        render={render ?? <button type="button" />}
        aria-label={label ?? `${person.displayName}, view profile`}
        className={className}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} align="start" sideOffset={10} collisionPadding={12} className="z-50">
          <Popover.Popup className="surface-card origin-[var(--transform-origin)] overflow-hidden rounded-card shadow-float outline-none transition-[scale,opacity] duration-200 ease-out-expo data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0">
            <Popover.Title className="sr-only">{person.displayName}</Popover.Title>
            <PersonCard
              person={person}
              presence={presence}
              actions={
                isMe ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      editor.open();
                    }}
                  >
                    <PencilSimple size={17} weight="bold" aria-hidden="true" /> Edit profile
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => void message()} disabled={openDirect.isPending}>
                    <ChatCircle size={17} weight="bold" aria-hidden="true" /> Message
                  </Button>
                )
              }
            />
            {error && (
              <p role="alert" className="px-5 pb-5 text-sm font-semibold text-alert">
                {error}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
