import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell
      compactPanelOnMobile
      panel={
        <div className="w-full max-w-[34rem]">
          <p className="font-display text-4xl font-extrabold tracking-[-0.04em] text-balance">Your clubs are still talking.</p>
          <p className="mt-7 max-w-[34ch] text-xl text-pretty">Climbing nights, book picks, synth patches. Pick up where you left off.</p>
        </div>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
