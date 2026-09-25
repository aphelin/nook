"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { CreateInvite, Invite } from "@nook/contracts";
import { Check, Copy, UserPlus } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Popover } from "@/components/ui/popover";
import { useCreateInvite } from "@/lib/queries";

const EXPIRY = [
  { value: "never", label: "Never", hours: null },
  { value: "1d", label: "1 day", hours: 24 },
  { value: "7d", label: "7 days", hours: 24 * 7 },
] as const;
const USES = [
  { value: "any", label: "No limit", max: null },
  { value: "1", label: "1", max: 1 },
  { value: "10", label: "10", max: 10 },
  { value: "50", label: "50", max: 50 },
] as const;

const dateFormat = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-base font-bold">{label}</p>
      <ToggleGroup value={[value]} onValueChange={(v) => v[0] && onChange(v[0] as T)} className="flex w-full rounded-full bg-chip p-1">
        {options.map((o) => (
          <Toggle
            key={o.value}
            value={o.value}
            className="tint h-10 flex-1 rounded-full px-2 text-base font-semibold text-fg-2 hover:text-fg data-[pressed]:bg-hi data-[pressed]:font-extrabold data-[pressed]:text-on-hi"
          >
            {o.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}

function describe(invite: Invite, nookName: string) {
  const limits = [
    invite.expiresAt ? `until ${dateFormat.format(new Date(invite.expiresAt))}` : null,
    invite.maxUses ? `for ${invite.maxUses} ${invite.maxUses === 1 ? "person" : "people"}` : null,
  ].filter(Boolean);
  return `Anyone with this link can join ${nookName}${limits.length ? ` ${limits.join(", ")}` : ""}.`;
}

export function InvitePopover({ slug, nookName }: { slug: string; nookName: string }) {
  const create = useCreateInvite(slug);
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]["value"]>("7d");
  const [uses, setUses] = useState<(typeof USES)[number]["value"]>("any");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = invite ? `${window.location.origin}/join/${invite.code}` : "";

  async function generate() {
    setError(null);
    const input: CreateInvite = {
      expiresInHours: EXPIRY.find((e) => e.value === expiry)?.hours ?? null,
      maxUses: USES.find((u) => u.value === uses)?.max ?? null,
    };
    try {
      setInvite(await create.mutateAsync(input));
    } catch {
      setError("Couldn’t make a link. Try again.");
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Popover
      title={`Invite to ${nookName}`}
      className="w-[23rem]"
      onOpenChange={(open) => {
        if (!open) {
          setInvite(null);
          setCopied(false);
          setError(null);
        }
      }}
      trigger={
        <button
          type="button"
          aria-label="Invite people"
          className="tint press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3 text-sm font-bold text-on-chip hover:bg-hover-strong [&>svg]:text-pop"
        />
      }
      triggerContent={
        <>
          <UserPlus size={15} weight="bold" aria-hidden="true" /> Invite
        </>
      }
    >
      <FormAlert message={error} />
      {invite ? (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-2 block text-base font-bold">Invite link</span>
            <span className="flex gap-2">
              <input
                readOnly
                value={link}
                // The code is the part that matters and sits at the end: show the end of the link, not its start.
                ref={(el) => {
                  if (el) el.scrollLeft = el.scrollWidth;
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 rounded-full bg-chip px-4 text-base text-on-chip outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-hi"
              />
              <Button className="h-11 w-26" onClick={() => void copy()}>
                {copied ? <Check size={18} weight="bold" aria-hidden="true" /> : <Copy size={18} weight="bold" aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </span>
          </label>
          <p className="text-sm text-pretty text-fg-2" aria-live="polite">
            {describe(invite, nookName)}
          </p>
          <Button variant="link" className="self-start" onClick={() => setInvite(null)}>
            Make a different link
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Choice label="Expires" value={expiry} onChange={setExpiry} options={EXPIRY} />
          <Choice label="Uses" value={uses} onChange={setUses} options={USES} />
          <Button pending={create.isPending} pendingLabel="Making link…" className="w-full" onClick={() => void generate()}>
            Make invite link
          </Button>
        </div>
      )}
    </Popover>
  );
}
