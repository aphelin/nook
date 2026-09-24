"use client";

import { type LoginInput, type PublicUser, type RegisterInput, Session } from "@nook/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, refreshSession, setAccessToken } from "./api";

type SessionState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: PublicUser; expiresIn: number }
  | { status: "anonymous"; user: null; signedOut?: boolean };

interface SessionContextValue {
  state: SessionState;
  signIn(input: LoginInput): Promise<void>;
  signUp(input: RegisterInput): Promise<void>;
  signOut(): Promise<void>;
  /** The landing page's "Try the demo": signs in as the fictional demo member. */
  signInDemo(): Promise<void>;
  /** Your own profile changed (here or in another tab). */
  updateUser(user: PublicUser): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The API sets this readable hint cookie alongside the httpOnly refresh cookie. */
const hasSessionHint = () => document.cookie.split("; ").some((c) => c === "nook_session=1");

// Refresh a minute before the access token lapses so requests never hit a 401 in normal use.
const REFRESH_LEAD_S = 60;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });

  const adopt = useCallback((session: Session | null) => {
    setAccessToken(session?.accessToken ?? null);
    setState(session ? { status: "authenticated", user: session.user, expiresIn: session.expiresIn } : { status: "anonymous", user: null });
  }, []);

  // Stable, so the socket (which depends on it) never reconnects because of it.
  const updateUser = useCallback(
    (user: PublicUser) => setState((s) => (s.status === "authenticated" && s.user.id === user.id ? { ...s, user } : s)),
    [],
  );

  // Restore the session on load: the httpOnly refresh cookie is invisible to JS, the hint is not.
  useEffect(() => {
    void (hasSessionHint() ? refreshSession() : Promise.resolve(null)).then(adopt);
  }, [adopt]);

  // Each new session schedules its own silent refresh.
  useEffect(() => {
    if (state.status !== "authenticated") return;
    const delay = Math.max(state.expiresIn - REFRESH_LEAD_S, 5) * 1000;
    const timer = setTimeout(() => void refreshSession().then(adopt), delay);
    return () => clearTimeout(timer);
  }, [state, adopt]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      signIn: async (input) => adopt(await api("/auth/login", { method: "POST", body: input, schema: Session })),
      signUp: async (input) => adopt(await api("/auth/register", { method: "POST", body: input, schema: Session })),
      signInDemo: async () => adopt(await api("/auth/demo", { method: "POST", schema: Session })),
      signOut: async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => undefined);
        setAccessToken(null);
        // Marked deliberate, so guards don't treat it as an expired session needing ?next.
        setState({ status: "anonymous", user: null, signedOut: true });
      },
      updateUser,
    }),
    [state, adopt, updateUser],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
