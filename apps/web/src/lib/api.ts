import { ApiError, Session } from "@nook/contracts";
import type { z } from "zod";

/** A failed API call, carrying the server's message and any per-field issues. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiError["issues"] = [],
  ) {
    super(message);
  }
}

// The access token lives only in memory: never in storage, so XSS can't lift it at rest.
let accessToken: string | null = null;
let inflightRefresh: Promise<Session | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function toError(res: Response): Promise<ApiRequestError> {
  const body = ApiError.safeParse(await res.json().catch(() => null));
  return body.success
    ? new ApiRequestError(res.status, body.data.message, body.data.issues)
    : new ApiRequestError(res.status, "Something went wrong. Try again in a moment.");
}

async function doRefresh(): Promise<Session | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const session = Session.parse(await res.json());
  accessToken = session.accessToken;
  return session;
}

/**
 * Exchanges the refresh cookie for a new session.
 * Single-flight within the tab, and serialised across tabs with a Web Lock: refresh tokens
 * are single-use, so two tabs rotating the same one at once would look like token theft.
 */
export function refreshSession(): Promise<Session | null> {
  inflightRefresh ??= (
    typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request("nook-refresh", doRefresh) : doRefresh()
  ).finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

interface RequestOptions<T extends z.ZodType> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  schema?: T;
}

/** Calls the API with the in-memory access token, refreshing once on 401. */
export async function api<T extends z.ZodType = z.ZodUnknown>(
  path: string,
  { method = "GET", body, schema }: RequestOptions<T> = {},
): Promise<z.infer<T>> {
  const send = () =>
    fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await send();
  if (res.status === 401 && accessToken && !path.startsWith("/auth/")) {
    if (await refreshSession()) res = await send();
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as z.infer<T>;
  const json: unknown = await res.json();
  return schema ? schema.parse(json) : (json as z.infer<T>);
}
