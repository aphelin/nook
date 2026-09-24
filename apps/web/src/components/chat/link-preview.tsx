import type { LinkPreview } from "@nook/contracts";

/** A preview card for a shared link. Its image is loaded without a referrer. */
export function LinkPreviews({ items }: { items: LinkPreview[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {items.map((p) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="surface-card tint flex max-w-[34rem] gap-4 rounded-field p-4 no-underline shadow-card transition-[scale] duration-200 ease-out-expo hover:scale-[1.01]"
        >
          <span className="min-w-0 flex-1">
            {p.siteName && <span className="block truncate text-sm font-semibold text-fg-2">{p.siteName}</span>}
            <span className="mt-0.5 block font-display text-lg leading-snug font-extrabold text-pretty">{p.title}</span>
            {p.description && <span className="mt-1 line-clamp-2 block text-base leading-snug text-fg-2">{p.description}</span>}
          </span>
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- third-party preview image, loaded without a referrer
            <img
              src={p.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="size-20 shrink-0 rounded-chip bg-chip object-cover"
            />
          )}
        </a>
      ))}
    </div>
  );
}
