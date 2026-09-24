"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import type { NookMember } from "@nook/contracts";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { FormAlert } from "@/components/ui/form-alert";
import { Popover } from "@/components/ui/popover";
import { useOpenDirect } from "@/lib/queries";

interface NewDirectPopoverProps {
  slug: string;
  members: NookMember[];
  meId: string;
}

export function NewDirectPopover({ slug, members, meId }: NewDirectPopoverProps) {
  const router = useRouter();
  const openDirect = useOpenDirect(slug);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = members.filter((m) => m.id !== meId);

  async function start(member: NookMember) {
    setError(null);
    try {
      const channel = await openDirect.mutateAsync(member.id);
      setOpen(false);
      router.push(`/app/${slug}/${channel.id}`);
    } catch {
      setError(`Couldn’t open a conversation with ${member.displayName}. Try again.`);
    }
  }

  return (
    <Popover
      title="Message someone"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
      trigger={
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full text-fg-2 transition-[scale,background-color,color] duration-200 ease-out-expo hover:scale-110 hover:bg-hi hover:text-on-hi"
        />
      }
      triggerContent={<Plus size={13} weight="bold" aria-hidden="true" />}
      triggerLabel="Message someone"
    >
      <FormAlert message={error} />
      <Autocomplete.Root
        open
        inline
        items={others}
        itemToStringValue={(m: NookMember) => `${m.displayName} @${m.handle}`}
        autoHighlight="always"
      >
        <label className="relative block">
          <span className="sr-only">Find a member</span>
          <MagnifyingGlass
            size={18}
            weight="bold"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-2"
          />
          <Autocomplete.Input
            placeholder="Name or handle"
            className="h-12 w-full rounded-full bg-chip pr-4 pl-11 text-base text-on-chip outline-none placeholder:text-fg-2 focus-visible:inset-ring-2 focus-visible:inset-ring-hi"
          />
        </label>
        <Autocomplete.Empty className="px-1 pt-3 text-base text-fg-2 empty:hidden">No one here by that name.</Autocomplete.Empty>
        <Autocomplete.List className="mt-2 max-h-72 overflow-y-auto data-[empty]:mt-0">
          {(member: NookMember) => (
            <Autocomplete.Item
              key={member.id}
              value={member}
              onClick={() => void start(member)}
              className="flex cursor-default items-center gap-3 rounded-full px-2 py-1.5 outline-none select-none data-[highlighted]:bg-chip"
            >
              <Avatar user={member} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-base font-bold">{member.displayName}</span>
                <span className="block truncate text-sm text-fg-2">@{member.handle}</span>
              </span>
            </Autocomplete.Item>
          )}
        </Autocomplete.List>
      </Autocomplete.Root>
    </Popover>
  );
}
