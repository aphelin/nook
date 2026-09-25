"use client";

import { Form } from "@base-ui/react/form";
import { Switch } from "@base-ui/react/switch";
import { ChannelName } from "@nook/contracts";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Popover } from "@/components/ui/popover";
import { TextField } from "@/components/ui/text-field";
import { ApiRequestError } from "@/lib/api";
import { useCreateChannel } from "@/lib/queries";

/** "Beta Spray!" → "beta-spray": what the server will store, shown as you type. */
const normalise = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function NewChannelPopover({ slug }: { slug: string }) {
  const router = useRouter();
  const create = useCreateChannel(slug);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setIsPrivate(false);
      setError(null);
    }
  };

  async function submit() {
    setError(null);
    try {
      const channel = await create.mutateAsync({ name: normalise(name), topic: null, kind: isPrivate ? "private" : "public" });
      reset(false);
      router.push(`/app/${slug}/${channel.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn’t create the channel. Try again.");
    }
  }

  return (
    <Popover
      title="New channel"
      open={open}
      onOpenChange={reset}
      trigger={
        <button
          type="button"
          className="grid size-7 place-items-center rounded-full text-fg-2 transition-[scale,background-color,color] duration-200 ease-out-expo hover:scale-110 hover:bg-hi hover:text-on-hi"
        />
      }
      triggerContent={<Plus size={13} weight="bold" aria-hidden="true" />}
      triggerLabel="New channel"
    >
      <Form className="flex flex-col gap-4" onFormSubmit={() => void submit()}>
        <FormAlert message={error} />
        <TextField
          name="name"
          label="Name"
          prefix="#"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={40}
          value={name}
          onValueChange={setName}
          description={
            name && normalise(name) !== name
              ? normalise(name)
                ? `Saved as #${normalise(name)}`
                : "Use letters or numbers: a name of only symbols has nothing to save."
              : "Lowercase, with dashes between words."
          }
          validate={() => {
            const r = ChannelName.safeParse(normalise(name));
            return r.success ? null : (r.error.issues[0]?.message ?? "Check the name.");
          }}
        />
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-base font-bold">Private</span>
            <span className="block text-sm text-fg-2">Only people you add can see it.</span>
          </span>
          <Switch.Root
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
            className="relative mt-0.5 inline-flex h-8 w-13 shrink-0 items-center rounded-full bg-chip p-1 transition-colors duration-150 data-[checked]:bg-hi"
          >
            {/* Centred in the track with 4px all round, travelling the 20px between its two ends. */}
            <Switch.Thumb className="block size-6 rounded-full bg-fg-2 transition-[translate,background-color] duration-200 ease-out-expo data-[checked]:translate-x-5 data-[checked]:bg-on-hi" />
          </Switch.Root>
        </label>
        <Button type="submit" pending={create.isPending} pendingLabel="Creating…" className="w-full">
          Create channel
        </Button>
      </Form>
    </Popover>
  );
}
