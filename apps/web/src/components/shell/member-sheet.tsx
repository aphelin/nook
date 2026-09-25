"use client";

import { Drawer } from "@base-ui/react/drawer";
import type { NookMember, PresenceState } from "@nook/contracts";
import { X } from "@phosphor-icons/react/dist/ssr";
import { PersonTrigger, StatusEmoji } from "@/components/people/person-card";
import { Avatar } from "@/components/ui/avatar";
import { PRESENCE_LABEL } from "@/components/ui/presence-shape";
import { usePresence } from "@/lib/presence";
import { liveStatus } from "@/lib/profile";

const ORDER: Record<PresenceState, number> = { online: 0, away: 1, dnd: 2, offline: 3 };

function MemberRow({ member, state, meId, slug }: { member: NookMember; state: PresenceState; meId: string; slug: string }) {
  const details = [
    state === "away" || state === "dnd" ? PRESENCE_LABEL[state] : null,
    member.pronouns,
    member.isOwner ? "Founder" : null,
  ].filter(Boolean);
  const status = liveStatus(member.status);
  return (
    <li>
      <PersonTrigger
        person={member}
        slug={slug}
        meId={meId}
        side="left"
        label={`${member.displayName}${member.id === meId ? " (you)" : ""}, view profile`}
        render={
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-[1.25rem] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-chip data-[popup-open]:bg-chip"
          />
        }
      >
        <Avatar user={member} size={40} presence={state} />
        <span className="min-w-0 flex-1">
          <span className={`flex items-baseline gap-1.5 text-base font-bold ${state === "offline" ? "text-fg-2" : "text-fg"}`}>
            <span className="truncate">
              {member.displayName}
              {member.id === meId && <span className="font-medium text-fg-2"> (you)</span>}
            </span>
            <StatusEmoji user={member} />
          </span>
          {status?.text ? (
            <span className="block truncate text-sm text-fg-2">
              {state === "away" || state === "dnd" ? `${PRESENCE_LABEL[state]} · ` : ""}
              {status.text}
            </span>
          ) : (
            details.length > 0 && <span className="block truncate text-sm text-fg-2">{details.join(" · ")}</span>
          )}
        </span>
      </PersonTrigger>
    </li>
  );
}

function Section({
  title,
  members,
  states,
  meId,
  slug,
}: {
  slug: string;
  title: string;
  members: NookMember[];
  states: Record<string, PresenceState>;
  meId: string;
}) {
  if (members.length === 0) return null;
  return (
    <section aria-label={`${title}, ${members.length}`} className="mt-6 first:mt-0">
      <h3 className="flex items-baseline gap-2 px-2.5 pb-2 text-sm font-bold text-fg-2">
        {title}
        <span data-num>{members.length}</span>
      </h3>
      <ul className="flex flex-col gap-0.5">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} state={states[m.id] ?? "offline"} meId={meId} slug={slug} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Everyone in the nook.
 *
 * The who's-here strip across the top of the room is the glance; this is the whole list, a card
 * that slides over the colour, with each person's status and pronouns. Offline members keep their
 * place, with the open-ring mark beside them, because "not here right now" is information too.
 */
export function MemberSheet({ slug, members, meId }: { slug: string; members: NookMember[]; meId: string }) {
  const presence = usePresence(slug);
  const states = presence.data ?? {};
  const sorted = [...members].sort(
    (a, b) => ORDER[states[a.id] ?? "offline"] - ORDER[states[b.id] ?? "offline"] || a.displayName.localeCompare(b.displayName),
  );
  const onNow = sorted.filter((m) => (states[m.id] ?? "offline") !== "offline");
  const offline = sorted.filter((m) => (states[m.id] ?? "offline") === "offline");

  return (
    <aside aria-labelledby="members-heading" className="flex h-full min-h-0 w-full flex-col">
      {/* Headed like the thread and search panels: the title, its count, and a way out. */}
      <div className="flex shrink-0 items-start gap-3 pt-7 pr-3 pb-5 pl-5">
        <div className="min-w-0 flex-1">
          <h2 id="members-heading" className="font-display text-2xl leading-none font-extrabold tracking-[-0.03em]">
            Members
          </h2>
          <p className="mt-2 text-sm font-semibold text-fg-2" data-num>
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        </div>
        <Drawer.Close
          aria-label="Close members"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-chip text-on-chip transition-[scale] duration-200 ease-out-expo hover:scale-105"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </Drawer.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-5">
        {presence.isPending ? (
          <ul aria-busy="true" className="flex flex-col gap-0.5">
            {sorted.map((m) => (
              <MemberRow key={m.id} member={m} state="offline" meId={meId} slug={slug} />
            ))}
          </ul>
        ) : (
          <>
            <Section title="Online" members={onNow} states={states} meId={meId} slug={slug} />
            <Section title="Offline" members={offline} states={states} meId={meId} slug={slug} />
          </>
        )}
      </div>
    </aside>
  );
}
