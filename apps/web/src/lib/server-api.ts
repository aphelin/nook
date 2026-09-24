import "server-only";
import { Health } from "@nook/contracts";

/** Server-side base URL: inside Docker this is the nginx service, locally the api dev server. */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return Health.parse(await res.json());
  } catch {
    return null;
  }
}
