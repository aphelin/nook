"use client";

import { WifiSlash } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { useRealtime } from "@/lib/realtime";

/** Appears only after a couple of seconds offline, so brief blips don't flash a warning. */
export function ConnectionBanner() {
  const { status } = useRealtime();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status !== "reconnecting") {
      const t = setTimeout(() => setShow(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, [status]);
  if (!show) return null;
  return (
    <p
      role="status"
      className="surface-card pop-in mx-4 mt-1 flex w-fit shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-base font-semibold text-alert shadow-card md:mx-8"
    >
      <WifiSlash size={18} weight="bold" aria-hidden="true" className="shrink-0" />
      Reconnecting. Messages you send will go out once you’re back.
    </p>
  );
}
