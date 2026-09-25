"use client";

import type { Channel, NookDetail, NookMember, PresenceState } from "@nook/contracts";
import { LockSimple, MagnifyingGlass, Users } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import { Composer } from "@/components/chat/composer";
import { DropZone } from "@/components/chat/drop-zone";
import { ConnectionBanner } from "@/components/chat/connection-banner";
import { Transcript } from "@/components/chat/transcript";
import { TypingLine } from "@/components/chat/typing-line";
import { PersonTrigger } from "@/components/people/person-card";
import { Avatar } from "@/components/ui/avatar";
import { NookDisc } from "@/components/brand/nook-disc";
import { PRESENCE_LABEL } from "@/components/ui/presence-shape";
import { flatten, useMessages, useSendMessage } from "@/lib/messages";
import { usePresence } from "@/lib/presence";
import { useReadChannel, useUnread } from "@/lib/unread";
import { useUploads } from "@/lib/uploads";
import { useSearchParams } from "next/navigation";
import { usePalette } from "@/components/search/command-palette";
import { useShell } from "./shell-frame";

const longDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });

const ORDER: Record<PresenceState, number> = { online: 0, away: 1, dnd: 2, offline: 3 };

/*
 * The channel's name at the head of the room, at poster size on the club's colour. A private
 * channel carries its padlock; a direct message is the other person's name, and opens their card.
 */
function ChannelTitle({ channel, slug, meId }: { channel: Channel; slug: string; meId: string }) {
  const presence = usePresence(slug).data ?? {};
  if (channel.kind === "direct" && channel.dmUser) {
    const state = presence[channel.dmUser.id] ?? "offline";
    return (
      <PersonTrigger
        person={channel.dmUser}
        slug={slug}
        meId={meId}
        side="bottom"
        label={`${channel.dmUser.displayName}, ${PRESENCE_LABEL[state]}, view profile`}
        render={<button type="button" className="flex min-w-0 items-center gap-3 rounded-chip text-left" />}
      >
        <Avatar user={channel.dmUser} size={52} presence={state} />
        <span className="room-title head-trim min-w-0">{channel.dmUser.displayName}</span>
      </PersonTrigger>
    );
  }
  return (
    <span className="room-title flex min-w-0 items-center gap-[0.18em]">
      {channel.kind === "private" && <LockSimple weight="bold" aria-label="Private channel" className="size-[0.62em] shrink-0" />}
      <span className="head-trim">{channel.name}</span>
    </span>
  );
}

/*
 * Who's here: the channel's people across the top of the room, like a row of stories. Everyone who
 * is around wears a ring in their own outline; the rest sit, unringed, at the end of the row. It is
 * the member list's job done at a glance, and the button at its end opens the whole list.
 */
function WhosHere({ channel, detail, meId }: { channel: Channel; detail: NookDetail; meId: string }) {
  const shell = useShell();
  const slug = detail.nook.slug;
  const states = usePresence(slug).data ?? {};
  const people = detail.members
    .filter((m) => channel.memberIds.includes(m.id))
    .sort((a, b) => ORDER[states[a.id] ?? "offline"] - ORDER[states[b.id] ?? "offline"] || a.displayName.localeCompare(b.displayName));
  const shown = people.slice(0, 8);
  return (
    <div className="flex min-w-0 items-start gap-1">
      {/* Only whole people: as many as the room is wide (four on a phone), then everyone behind "All". */}
      <ul
        aria-label="Who's here"
        className="flex min-w-0 items-start gap-1 overflow-clip pb-1 [overflow-clip-margin:0.375rem] @max-md:[&>li:nth-child(n+5)]:hidden @max-3xl:[&>li:nth-child(n+7)]:hidden"
      >
        {shown.map((m) => (
          <Person key={m.id} member={m} state={states[m.id] ?? "offline"} slug={slug} meId={meId} />
        ))}
      </ul>
      <button
        type="button"
        onClick={shell.openMembers}
        aria-label={`Everyone in ${detail.nook.name} (${detail.members.length})`}
        className="flex w-15 shrink-0 flex-col items-center gap-1.5 rounded-[1.25rem] pt-1 pb-1.5 transition-colors duration-150 hover:bg-hover"
      >
        <span className="grid size-12 place-items-center rounded-full bg-chip text-on-chip">
          <Users size={21} weight="bold" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold" data-num>
          All {detail.members.length}
        </span>
      </button>
    </div>
  );
}

function Person({ member, state, slug, meId }: { member: NookMember; state: PresenceState; slug: string; meId: string }) {
  const here = state !== "offline";
  return (
    <li>
      <PersonTrigger
        person={member}
        slug={slug}
        meId={meId}
        side="bottom"
        label={`${member.displayName}${member.id === meId ? " (you)" : ""}, ${PRESENCE_LABEL[state]}, view profile`}
        render={
          <button
            type="button"
            data-grows
            className="group flex w-15 flex-col items-center gap-1.5 rounded-[1.25rem] pt-1 pb-1.5 transition-colors duration-150 hover:bg-hover data-[popup-open]:bg-hover"
          />
        }
      >
        <span className="pop-in">
          <Avatar user={member} size={48} ring={here} />
        </span>
        <span className={`w-full truncate px-0.5 text-center text-xs ${here ? "font-bold" : "font-medium text-fg-2"}`}>
          {member.id === meId ? "You" : member.displayName.split(" ")[0]}
        </span>
      </PersonTrigger>
    </li>
  );
}

/** "12 members, 5 online" — the room's own second line, and the reason presence is loaded here. */
function RoomLine({ channel, detail, slug }: { channel: Channel; detail: NookDetail; slug: string }) {
  const presence = usePresence(slug).data ?? {};
  if (channel.kind === "direct") {
    const u = channel.dmUser;
    if (!u) return null;
    const bits = [PRESENCE_LABEL[presence[u.id] ?? "offline"], u.pronouns].filter(Boolean);
    return <>{bits.join(" · ")}</>;
  }
  const inRoom = detail.members.filter((m) => channel.memberIds.includes(m.id));
  const online = inRoom.filter((m) => (presence[m.id] ?? "offline") !== "offline").length;
  const members = `${inRoom.length} ${inRoom.length === 1 ? "member" : "members"}`;
  return (
    <>
      <span className="font-bold text-fg">
        {members}, {online} here
      </span>
      {channel.topic ? <span> · {channel.topic}</span> : null}
    </>
  );
}

/** The start of a channel: who or what it's for, and who is in it, before the first message. */
function ChannelIntro({ channel, nook, members }: { channel: Channel; nook: NookDetail["nook"]; members: NookMember[] }) {
  if (channel.kind === "direct" && channel.dmUser) {
    const u = channel.dmUser;
    return (
      <div className="max-w-[58ch]">
        <Avatar user={u} size={88} />
        <h2 className="mt-5 font-display text-3xl font-extrabold tracking-[-0.03em] text-balance">{u.displayName}</h2>
        <p className="mt-2 text-base font-semibold text-fg-2">
          @{u.handle}
          {u.pronouns ? ` · ${u.pronouns}` : ""}
        </p>
        {u.bio && <p className="mt-3 text-md text-pretty">{u.bio}</p>}
        <p className="mt-3 text-base text-pretty text-fg-2">This is the start of your conversation with {u.displayName.split(" ")[0]}.</p>
      </div>
    );
  }
  // The channel's people at poster size, a crowd at the door.
  const crowd = members.filter((m) => channel.memberIds.includes(m.id)).slice(0, 6);
  return (
    // The reading measure is for the lines under the head; the head itself takes the room's width, so
    // a hyphenated name is not broken in two while there is space beside it.
    <div className="[&>p]:max-w-[58ch]">
      {crowd.length > 1 ? (
        <ul aria-label={`People in #${channel.name}`} className="flex flex-wrap gap-2">
          {crowd.map((m, i) => (
            <li key={m.id} className="pop-in" style={{ animationDelay: `${i * 60}ms` }}>
              <Avatar user={m} size={84} />
            </li>
          ))}
        </ul>
      ) : (
        <NookDisc initial={nook.name[0]} size={72} inverse />
      )}
      <h2 className="mt-5 font-display text-3xl font-extrabold tracking-[-0.03em] break-words text-title">The start of #{channel.name}</h2>
      <p className="mt-3 text-md text-pretty">
        {channel.kind === "private" ? "A private channel" : "A channel"} in {nook.name}.{channel.topic ? ` ${channel.topic}.` : ""}
      </p>
      <p className="mt-2 text-sm font-semibold text-fg-2" data-num>
        Opened {longDate.format(new Date(channel.createdAt))}
      </p>
    </div>
  );
}

export function ChannelView({ channel, detail, meId }: { channel: Channel; detail: NookDetail; meId: string }) {
  const shell = useShell();
  const palette = usePalette();
  const query = useMessages(channel.id);
  const sender = useSendMessage(channel.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const uploads = useUploads();
  const unread = useUnread();
  const readChannel = useReadChannel(channel.id);
  const focusId = useSearchParams().get("m");
  const mentionable = useMemo(
    () => detail.members.filter((m) => m.id !== meId && channel.memberIds.includes(m.id)),
    [detail.members, channel.memberIds, meId],
  );
  const label = channel.kind === "direct" ? (channel.dmUser?.displayName ?? "Direct message") : `#${channel.name}`;

  function editLast() {
    const mine = flatten(query.data).findLast((m) => m.authorId === meId && m.kind === "user" && !m.deletedAt && !m.status);
    if (mine) setEditingId(mine.id);
  }

  return (
    <>
      {/*
       * The room's head, on the room's own colour with no rule under it: the channel's name at poster
       * size, who it's for, and who's here. On a narrow room the people drop under the name.
       */}
      <header className="flex shrink-0 flex-col gap-x-8 gap-y-4 px-4 pt-5 pb-3 md:px-8 md:pt-8 @3xl:flex-row @3xl:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button type="button" onClick={shell.openNav} aria-label="Open channels" className="mt-0.5 shrink-0 rounded-full md:hidden">
            <NookDisc initial={detail.nook.name[0]} size={40} inverse />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="flex min-w-0 items-center font-display font-extrabold">
              <ChannelTitle channel={channel} slug={detail.nook.slug} meId={meId} />
            </h1>
            <p className="mt-3.5 truncate text-sm text-fg-2">
              <RoomLine channel={channel} detail={detail} slug={detail.nook.slug} />
            </p>
          </div>
          {/* The channel list carries search on wide screens; below md that column is a drawer. */}
          <button
            type="button"
            onClick={() => palette.open()}
            aria-label="Search and jump"
            aria-keyshortcuts="Control+K Meta+K"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-chip text-on-chip md:hidden"
          >
            <MagnifyingGlass size={19} weight="bold" aria-hidden="true" />
          </button>
        </div>
        {channel.kind !== "direct" && <WhosHere channel={channel} detail={detail} meId={meId} />}
      </header>
      <ConnectionBanner />
      <DropZone label={`Drop to share in ${label}`} onFiles={(files) => void uploads.add(files)}>
        <Transcript
          key={channel.id}
          query={query}
          sender={sender}
          detail={detail}
          meId={meId}
          label={`Messages in ${label}`}
          intro={<ChannelIntro channel={channel} nook={detail.nook} members={detail.members} />}
          editingId={editingId}
          onEditingChange={setEditingId}
          sentCount={sentCount}
          channelId={channel.id}
          lastReadId={unread.isPending ? undefined : (unread.data?.channels.find((c) => c.channelId === channel.id)?.lastReadId ?? null)}
          onRead={readChannel}
          focusId={focusId}
        />
        <TypingLine channelId={channel.id} members={detail.members} meId={meId} />
        <Composer
          key={`composer-${channel.id}`}
          channelId={channel.id}
          placeholder={`Message ${label}`}
          uploads={uploads}
          onSend={(body, attachments) => {
            sender.send(body, attachments);
            setSentCount((n) => n + 1);
          }}
          onEditLast={editLast}
          mentionable={mentionable}
        />
      </DropZone>
    </>
  );
}
