"use client";

import { Form } from "@base-ui/react/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeNext, useRedirectWhenSignedIn } from "@/components/auth/auth-redirect";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { PasswordField } from "@/components/ui/password-field";
import { TextField } from "@/components/ui/text-field";
import { ApiRequestError } from "@/lib/api";
import { useSession } from "@/lib/session";

export function LoginForm() {
  const { signIn } = useSession();
  const router = useRouter();
  const next = useRedirectWhenSignedIn();
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);

  async function submit(values: { email: string; password: string }) {
    setPending(true);
    setAlert(null);
    try {
      await signIn(values);
      router.replace(safeNext(next));
    } catch (err) {
      setAlert(err instanceof ApiRequestError ? err.message : "We couldn’t reach Nook. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-3xl leading-none font-extrabold tracking-[-0.03em]">Sign in</h1>
      <p className="mt-4 text-lg text-pretty text-fg-2">Welcome back. Your nooks kept your seat warm.</p>

      <Form className="mt-9 flex flex-col gap-5" onFormSubmit={(v) => void submit(v as { email: string; password: string })}>
        <FormAlert message={alert} />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          validate={(v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter the email you signed up with.")}
        />
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          required
          validate={(v) => (v ? null : "Enter your password.")}
        />
        <Button type="submit" pending={pending} pendingLabel="Signing in…" className="mt-2 h-13 w-full text-md">
          Sign in
        </Button>
      </Form>

      <p className="mt-8 text-base text-fg-2">
        New to Nook?{" "}
        <Link
          href={`/signup${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-extrabold text-fg underline decoration-2 underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
