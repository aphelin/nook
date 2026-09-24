import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupFlow } from "./signup-flow";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupFlow />
    </Suspense>
  );
}
