"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AVATAR_TYPES, PRONOUNS, type Pronouns, type PublicUser } from "@nook/contracts";
import { Smiley, Trash, UploadSimple, X } from "@phosphor-icons/react/dist/ssr";
import { createContext, type ReactNode, useContext, useId, useMemo, useRef, useState } from "react";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ApiRequestError } from "@/lib/api";
import { liveStatus, useAvatar, useUpdateProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { PersonCard, untilLabel } from "./person-card";

interface ProfileEditor {
  open(): void;
}
const ProfileEditorContext = createContext<ProfileEditor | null>(null);

/** Opens the edit-profile dialog from the account menu, your own card, or the palette. */
export function useProfileEditor(): ProfileEditor {
  const ctx = useContext(ProfileEditorContext);
  if (!ctx) throw new Error("useProfileEditor must be used inside <ProfileEditorProvider>");
  return ctx;
}

export function ProfileEditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const controls = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <ProfileEditorContext value={controls}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup className="surface-card fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(54rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card shadow-float outline-none transition-[opacity,scale] duration-200 ease-out-expo data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <ProfileForm onDone={() => setOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </ProfileEditorContext>
  );
}

type ClearAfter = "never" | "1h" | "4h" | "today";
const CLEAR_OPTIONS: { value: ClearAfter; label: string }[] = [
  { value: "never", label: "Don’t clear" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "today", label: "Today" },
];
function expiryFor(choice: ClearAfter, now = new Date()): string | null {
  if (choice === "never") return null;
  if (choice === "today") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 0);
    return end.toISOString();
  }
  return new Date(now.getTime() + (choice === "1h" ? 1 : 4) * 3_600_000).toISOString();
}

/** A profile shows one of the two pronoun sets, or none. */
const PRONOUN_OPTIONS: { value: Pronouns | null; label: string }[] = [
  { value: null, label: "Not shown" },
  ...PRONOUNS.map((p) => ({ value: p, label: p })),
];
const BIO_MAX = 280;

const inputClass =
  "h-12 w-full min-w-0 rounded-field bg-chip px-4 text-md text-on-chip outline-none transition-[box-shadow] duration-150 placeholder:text-fg-2 focus-visible:inset-ring-2 focus-visible:inset-ring-hi aria-[invalid=true]:inset-ring-2 aria-[invalid=true]:inset-ring-alert";
const labelClass = "text-base font-bold text-fg";
const chipClass =
  "inline-flex h-9 items-center rounded-full bg-chip px-3.5 text-sm font-semibold text-fg-2 transition-colors duration-150 hover:text-fg";

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { state } = useSession();
  const me = state.status === "authenticated" ? state.user : null;
  if (!me) return null;
  return <ProfileFormFor me={me} onDone={onDone} />;
}

function ProfileFormFor({ me, onDone }: { me: PublicUser; onDone: () => void }) {
  const current = liveStatus(me.status);
  const [displayName, setDisplayName] = useState(me.displayName);
  const [pronouns, setPronouns] = useState<Pronouns | null>(me.pronouns);
  const [bio, setBio] = useState(me.bio ?? "");
  const [emoji, setEmoji] = useState(current?.emoji ?? null);
  const [statusText, setStatusText] = useState(current?.text ?? "");
  // An existing expiry is kept unless you pick another option.
  const [clearAfter, setClearAfter] = useState<ClearAfter | "keep">(current?.expiresAt ? "keep" : "never");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProfile();
  const avatar = useAvatar();
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), pronouns: useId(), bio: useId(), status: useId(), bioCount: useId(), nameError: useId(), clear: useId() };

  const hasStatus = !!emoji || statusText.trim().length > 0;
  const expiresAt = !hasStatus ? null : clearAfter === "keep" ? (current?.expiresAt ?? null) : expiryFor(clearAfter);
  const draft: PublicUser = {
    ...me,
    displayName: displayName.trim() || me.displayName,
    pronouns,
    bio: bio.trim() || null,
    status: { emoji, text: statusText.trim() || null, expiresAt },
  };
  const bioOver = bio.length > BIO_MAX;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setNameError("Your name can’t be empty.");
      return;
    }
    if (bioOver) return;
    try {
      await update.mutateAsync({
        displayName,
        pronouns,
        bio,
        status: hasStatus ? { emoji, text: statusText, expiresAt } : null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn’t save your profile. Try again.");
    }
  }

  const uploading = avatar.state.status === "uploading";
  const shownAvatar = uploading && avatar.state.status === "uploading" ? { ...draft, avatarUrl: avatar.state.preview } : draft;

  return (
    <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pt-6 pb-3 sm:px-7">
        <Dialog.Title className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em]">Edit profile</Dialog.Title>
        <Dialog.Close
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full bg-chip text-on-chip transition-[scale] duration-200 ease-out-expo hover:scale-105"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </Dialog.Close>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-8 overflow-y-auto px-5 py-5 sm:px-7 md:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <span className="relative">
              <Avatar user={shownAvatar} size={72} />
              {uploading && (
                <span
                  role="progressbar"
                  aria-label="Uploading your photo"
                  aria-valuenow={Math.round(avatar.state.status === "uploading" ? avatar.state.progress * 100 : 0)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/55"
                >
                  <span
                    className="block h-full bg-white transition-[width] duration-150"
                    style={{ width: `${(avatar.state.status === "uploading" ? avatar.state.progress : 0) * 100}%` }}
                  />
                </span>
              )}
            </span>
            <div className="flex flex-col items-start gap-1.5">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  <UploadSimple size={18} weight="bold" aria-hidden="true" /> {me.avatarUrl ? "Change photo" : "Upload photo"}
                </Button>
                {me.avatarUrl && !uploading && (
                  <Button type="button" variant="ghost" onClick={() => void avatar.remove()}>
                    <Trash size={18} weight="bold" aria-hidden="true" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-fg-2">{uploading ? "Uploading…" : "Replaces your generated shape. Square-cropped, up to 5 MB."}</p>
              <input
                ref={fileInput}
                type="file"
                accept={AVATAR_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose a photo"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void avatar.upload(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {avatar.state.status === "error" && (
            <p role="alert" className="field-error -mt-3 text-xs font-medium text-alert">
              {avatar.state.message}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.name} className={labelClass}>
              Name
            </label>
            <input
              id={ids.name}
              value={displayName}
              maxLength={48}
              autoComplete="name"
              aria-invalid={!!nameError || undefined}
              aria-describedby={nameError ? ids.nameError : undefined}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameError(null);
              }}
              className={inputClass}
            />
            {nameError && (
              <p id={ids.nameError} className="field-error text-xs font-medium text-alert">
                {nameError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span id={ids.pronouns} className={labelClass}>
              Pronouns
            </span>
            <div role="radiogroup" aria-labelledby={ids.pronouns} className="flex flex-wrap gap-1.5 pt-0.5">
              {PRONOUN_OPTIONS.map((o) => (
                <label
                  key={o.label}
                  className={`${chipClass} cursor-pointer has-[:checked]:bg-hi has-[:checked]:font-bold has-[:checked]:text-on-hi has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fg`}
                >
                  <input
                    type="radio"
                    name="pronouns"
                    className="sr-only"
                    checked={pronouns === o.value}
                    onChange={() => setPronouns(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor={ids.bio} className={labelClass}>
                Bio
              </label>
              <span id={ids.bioCount} data-num className={`text-xs ${bioOver ? "font-semibold text-alert" : "text-fg-2"}`}>
                {bio.length}/{BIO_MAX}
              </span>
            </div>
            <textarea
              id={ids.bio}
              value={bio}
              rows={3}
              aria-describedby={ids.bioCount}
              aria-invalid={bioOver || undefined}
              onChange={(e) => setBio(e.target.value)}
              placeholder="What should the club know about you?"
              className={`${inputClass} h-auto resize-none py-2.5 leading-normal`}
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${labelClass} mb-1.5`}>Status</legend>
            <div className="flex gap-2">
              <EmojiPicker
                triggerLabel={emoji ? `Status emoji: ${emoji}. Change it` : "Pick a status emoji"}
                onPick={setEmoji}
                trigger={
                  <button
                    type="button"
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-chip text-xl transition-[scale] duration-200 ease-out-expo hover:scale-105"
                  />
                }
                triggerContent={emoji ?? <Smiley size={20} weight="bold" aria-hidden="true" className="text-fg-2" />}
              />
              <input
                id={ids.status}
                aria-label="Status text"
                value={statusText}
                maxLength={80}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="At the crag, Reading, Back Monday…"
                className={inputClass}
              />
              {hasStatus && (
                <button
                  type="button"
                  aria-label="Clear status"
                  onClick={() => {
                    setEmoji(null);
                    setStatusText("");
                  }}
                  className="grid size-12 shrink-0 place-items-center rounded-full text-fg-2 transition-colors hover:bg-chip hover:text-fg"
                >
                  <X size={18} weight="bold" aria-hidden="true" />
                </button>
              )}
            </div>
            {hasStatus && (
              <div role="radiogroup" aria-labelledby={ids.clear} className="flex flex-wrap items-center gap-1.5 pt-1">
                <span id={ids.clear} className="mr-1 text-xs text-fg-2">
                  Clear after
                </span>
                {current?.expiresAt && (
                  <label
                    className={`${chipClass} cursor-pointer has-[:checked]:bg-hi has-[:checked]:font-bold has-[:checked]:text-on-hi has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fg`}
                  >
                    <input
                      type="radio"
                      name="clear"
                      className="sr-only"
                      checked={clearAfter === "keep"}
                      onChange={() => setClearAfter("keep")}
                    />
                    {untilLabel(current.expiresAt).replace(/^until/, "As set, until")}
                  </label>
                )}
                {CLEAR_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`${chipClass} cursor-pointer has-[:checked]:bg-hi has-[:checked]:font-bold has-[:checked]:text-on-hi has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fg`}
                  >
                    <input
                      type="radio"
                      name="clear"
                      className="sr-only"
                      checked={clearAfter === o.value}
                      onChange={() => setClearAfter(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <FormAlert message={error} />
        </div>

        <section aria-labelledby="profile-preview-heading" className="order-first md:order-none">
          <h3 id="profile-preview-heading" className="mb-2.5 text-sm font-bold text-fg-2">
            How others see you
          </h3>
          <div className="overflow-hidden rounded-card bg-bg shadow-card ring-1 ring-line">
            <PersonCard person={shownAvatar} presence="online" className="w-full" />
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-2 px-5 pt-3 pb-6 sm:px-7">
        <Dialog.Close render={<Button type="button" variant="ghost" />}>Cancel</Dialog.Close>
        <Button type="submit" pending={update.isPending} pendingLabel="Saving…" disabled={uploading} className="px-5">
          Save
        </Button>
      </div>
    </form>
  );
}
