"use client";

import { Form } from "@base-ui/react/form";
import { Handle, Password, RegisterInput } from "@nook/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeNext, useRedirectWhenSignedIn } from "@/components/auth/auth-redirect";
import { AuthShell } from "@/components/auth/auth-shell";
import { MemberCard } from "@/components/auth/member-card";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { ApiRequestError } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Suggests a handle from a display name: "Mara Okafor" → "mara_okafor". */
function toHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

const firstIssue = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : (result.error?.issues[0]?.message ?? "Check this field.");

type FieldErrors = Record<string, string>;

export function SignupFlow() {
  const { signUp } = useSession();
  const router = useRouter();
  const next = useRedirectWhenSignedIn();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const shownHandle = handleEdited ? handle : toHandle(displayName);

  async function submit(values: Record<string, string>) {
    const parsed = RegisterInput.safeParse({ ...values, handle: shownHandle });
    if (!parsed.success) return;
    setPending(true);
    setAlert(null);
    setErrors({});
    try {
      await signUp(parsed.data);
      router.replace(safeNext(next));
    } catch (err) {
      setPending(false);
      if (!(err instanceof ApiRequestError)) {
        setAlert("We couldn’t reach Nook. Check your connection and try again.");
        return;
      }
      if (err.status === 409) {
        setErrors(/handle/i.test(err.message) ? { handle: err.message } : { email: err.message });
      } else if (err.issues?.length) {
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      } else {
        setAlert(err.message);
      }
    }
  }

  return (
    <AuthShell
      panel={
        <div className="flex w-full flex-col items-center gap-8 lg:items-start">
          <MemberCard displayName={displayName} handle={shownHandle} />
          <p className="max-w-[34ch] text-lg font-medium text-pretty max-lg:text-center">
            Your member card fills in as you type. Pick a handle and you get a shape; every nook you join sees both.
          </p>
        </div>
      }
    >
      <h1 className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em]">Join Nook</h1>
      <p className="mt-4 text-lg text-pretty text-fg-2">One account for every club you’re part of.</p>

      <Form className="mt-9 flex flex-col gap-5" errors={errors} onFormSubmit={(v) => void submit(v as Record<string, string>)}>
        <FormAlert message={alert} />
        <TextField
          name="displayName"
          label="Display name"
          autoComplete="name"
          required
          maxLength={48}
          value={displayName}
          onValueChange={setDisplayName}
          validate={(v) => (v.trim() ? null : "Tell your clubs what to call you.")}
        />
        <TextField
          name="handle"
          label="Handle"
          prefix="@"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={24}
          value={shownHandle}
          onValueChange={(v) => {
            setHandleEdited(true);
            setHandle(v.toLowerCase());
          }}
          description="How people @mention you. Letters, numbers and underscores."
          validate={() => firstIssue(Handle.safeParse(shownHandle))}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          validate={(v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter an email address, like you@example.com.")}
        />
        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          required
          description="At least 8 characters."
          validate={(v) => firstIssue(Password.safeParse(v))}
        />
        <Button type="submit" pending={pending} pendingLabel="Joining…" className="mt-2 h-13 w-full text-md">
          Join Nook
        </Button>
      </Form>

      <p className="mt-8 text-base text-fg-2">
        Already a member?{" "}
        <Link
          href={`/login${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-extrabold text-fg underline decoration-2 underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
