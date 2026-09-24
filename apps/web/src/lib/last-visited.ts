/** Remembers where you were so /app reopens the last nook and channel. Best-effort: storage may be unavailable. */
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: navigation still works, it just won't be remembered.
  }
};

export const lastVisited = {
  nook: () => read("nook:last"),
  channel: (slug: string) => read(`nook:last:${slug}`),
  remember(slug: string, channelId: string) {
    write("nook:last", slug);
    write(`nook:last:${slug}`, channelId);
  },
};
