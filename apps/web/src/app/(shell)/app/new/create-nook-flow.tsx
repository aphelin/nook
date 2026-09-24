"use client";

import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { KIT_PRESETS, Slug } from "@nook/contracts";
import { ArrowLeft, ArrowUp, Hash } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/brand/mark";
import { NookDisc } from "@/components/brand/nook-disc";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { TextField } from "@/components/ui/text-field";
import { ApiRequestError } from "@/lib/api";
import { accentStyle, discStyle } from "@/lib/accent";
import { useCreateNook } from "@/lib/queries";

const toSlug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

/**
 * How the new nook will look, as a miniature of the real shell: the rail with this nook's disc, the
 * wing with its one channel, the room in its colour with a first message, and the composer. The
 * colours you pick are the only thing that changes — which is exactly what they do in the app.
 */
function KitPreview({ name }: { name: string }) {
  const shown = name.trim() || "Your nook";
  return (
    <figure aria-label={`Preview of ${shown} in its colours`} className="w-full max-w-[36rem]">
      <div aria-hidden="true" className="flex h-[30rem] overflow-hidden rounded-card shadow-float ring-[3px] ring-fg">
        <div className="surface-rail tint flex w-[3.75rem] shrink-0 flex-col items-center gap-3 pt-4">
          <Mark size={26} variant="kit" />
          <span className="rounded-full p-[2px] ring-2 ring-fg ring-inset">
            <NookDisc initial={shown[0]} size={36} />
          </span>
        </div>
        <div className="surface-wing tint flex w-[10.5rem] shrink-0 flex-col px-2.5 pt-5">
          <p className="line-clamp-2 px-1.5 font-display text-lg leading-[0.95] font-extrabold tracking-[-0.02em]">{shown}</p>
          <span className="mt-3 block h-8 rounded-full bg-chip" />
          <span className="mt-1.5 block h-8 rounded-full bg-pop" />
          <p className="mt-4 px-1.5 text-2xs font-bold text-fg-2">Channels</p>
          <p className="tint mt-1 flex h-8 items-center gap-1.5 rounded-full bg-hi px-2.5 text-xs font-extrabold text-on-hi">
            <Hash size={12} weight="bold" /> general
          </p>
        </div>
        <div className="surface-stage tint flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-5">
            <p className="truncate font-display text-[2rem] leading-none font-extrabold tracking-[-0.04em]">general</p>
            <p className="mt-2 text-2xs font-bold text-fg-2">1 member, 1 here</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 px-3 pb-3">
            <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2">
              <NookDisc initial={shown[0]} size={28} inverse />
              <span className="min-w-0">
                <span className="block text-xs font-extrabold">{shown}</span>
                <span className="block text-xs leading-snug">Welcome in. This is where {shown} talks.</span>
              </span>
            </div>
          </div>
          <div className="surface-card tint mx-3 mb-3 flex h-10 shrink-0 items-center gap-2 rounded-full pr-1.5 pl-4 shadow-card">
            <span className="min-w-0 flex-1 truncate text-xs text-fg-2">Message #general</span>
            <span className="tint grid size-7 shrink-0 place-items-center rounded-full bg-hi text-on-hi">
              <ArrowUp size={13} weight="bold" />
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-base font-medium text-pretty">
        Your nook wears its colours everywhere: the deep one on the side, the bright one filling the room, and cards lifted off the colour
        for anything about you.
      </figcaption>
    </figure>
  );
}

export function CreateNookFlow() {
  const router = useRouter();
  const create = useCreateNook();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [kitName, setKitName] = useState<string>(KIT_PRESETS[1].name);
  const [alert, setAlert] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const shownSlug = slugEdited ? slug : toSlug(name);
  const kit = KIT_PRESETS.find((p) => p.name === kitName)!.kit;

  async function submit(values: Record<string, string>) {
    setAlert(null);
    setErrors({});
    try {
      const detail = await create.mutateAsync({
        name: values.name ?? name,
        slug: shownSlug,
        description: values.description?.trim() || null,
        kit,
      });
      router.push(`/app/${detail.nook.slug}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) setErrors({ slug: err.message });
      else if (err instanceof ApiRequestError && err.issues?.length)
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      else setAlert(err instanceof ApiRequestError ? err.message : "Couldn’t reach Nook. Check your connection and try again.");
    }
  }

  return (
    <main style={accentStyle(kit)} className="surface-stage tint min-h-dvh">
      <div className="mx-auto grid min-h-dvh max-w-6xl gap-12 px-5 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col">
          <Link
            href="/app"
            className="inline-flex h-10 items-center gap-2 self-start rounded-full bg-chip px-4 text-base font-bold text-on-chip no-underline"
          >
            <ArrowLeft size={18} weight="bold" aria-hidden="true" /> Back
          </Link>
          <h1 className="mt-10 font-display text-4xl font-extrabold tracking-[-0.04em] text-balance">Start a nook</h1>
          <p className="mt-5 max-w-[40ch] text-xl text-pretty">
            A home for your club: channels, direct messages, and everyone who shows up.
          </p>

          <Form
            className="mt-10 flex max-w-[28rem] flex-col gap-6"
            errors={errors}
            onFormSubmit={(v) => void submit(v as Record<string, string>)}
          >
            <FormAlert message={alert} />
            <TextField
              name="name"
              label="Name"
              required
              maxLength={48}
              value={name}
              onValueChange={setName}
              validate={(v) => (v.trim() ? null : "Give your nook a name.")}
            />
            <TextField
              name="slug"
              label="Address"
              prefix="/app/"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={32}
              value={shownSlug}
              onValueChange={(v) => {
                setSlugEdited(true);
                setSlug(v.toLowerCase());
              }}
              description="Where your nook lives. Lowercase, with dashes."
              validate={() => {
                const r = Slug.safeParse(shownSlug);
                return r.success ? null : (r.error.issues[0]?.message ?? "Check the address.");
              }}
            />
            <Field.Root name="description" className="flex flex-col gap-1.5">
              <Field.Label className="text-base font-bold">
                What’s it for? <span className="font-medium text-fg-2">Optional</span>
              </Field.Label>
              <Field.Control
                render={<textarea rows={3} maxLength={280} />}
                className="min-h-24 w-full resize-y rounded-field bg-chip px-4 py-3 text-md text-on-chip outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-hi"
              />
            </Field.Root>

            <fieldset>
              <legend className="text-base font-bold">
                Colours <span className="font-medium text-fg-2">· {kitName}</span>
              </legend>
              <p className="mt-1 text-sm text-fg-2">Pick the pair that feels like your group. The whole page tries it on.</p>
              {/*
               * Each swatch is the kit's two colours as the nook will wear them, split across a disc,
               * so the choice is made against the pair rather than against one paint chip.
               */}
              <RadioGroup value={kitName} onValueChange={(v) => setKitName(v as string)} className="mt-4 flex flex-wrap gap-2.5">
                {KIT_PRESETS.map((preset) => (
                  <Radio.Root
                    key={preset.name}
                    value={preset.name}
                    aria-label={preset.name}
                    style={discStyle(preset.kit)}
                    className="size-12 rounded-full bg-[linear-gradient(to_bottom,var(--disc)_70%,var(--disc-deep)_70%)] transition-[scale] duration-200 ease-out-expo hover:scale-110 data-[checked]:scale-110 data-[checked]:ring-[3px] data-[checked]:ring-fg data-[checked]:ring-offset-[3px] data-[checked]:ring-offset-bg"
                  />
                ))}
              </RadioGroup>
            </fieldset>

            <Button type="submit" pending={create.isPending} pendingLabel="Starting…" className="mt-2 h-14 w-full text-md">
              Start the nook
            </Button>
          </Form>
        </div>

        <div className="flex items-start justify-center lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)] lg:items-center">
          <KitPreview name={name} />
        </div>
      </div>
    </main>
  );
}
