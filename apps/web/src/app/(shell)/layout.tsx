"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ProfileEditorProvider } from "@/components/people/profile-dialog";
import { Wipe } from "@/components/shell/wipe";
import { useSession } from "@/lib/session";

/** Everything under /app needs a session; the proxy catches most visits before this renders. */
export default function ShellLayout({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace(state.signedOut ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [state, router, pathname]);

  if (state.status !== "authenticated") return <div aria-busy="true" className="h-dvh bg-stage" />;
  return (
    <ProfileEditorProvider>
      {children}
      <Wipe />
    </ProfileEditorProvider>
  );
}
