import { Avatar } from "@/components/ui/avatar";
import { Mark } from "@/components/brand/mark";

interface MemberCardProps {
  displayName: string;
  handle: string;
  since?: Date;
}

const monthYear = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

/**
 * The card that fills in as someone signs up.
 *
 * It exists to make the handle field feel like a decision rather than a form input: the shape is
 * derived from whatever you type, so the moment you settle on a handle you can see the person
 * everyone else will see. Nothing here is stored; it is the same Avatar the app renders.
 */
export function MemberCard({ displayName, handle, since = new Date() }: MemberCardProps) {
  const name = displayName.trim();
  return (
    <figure
      aria-label="Your member card, previewed from the details you enter"
      className="surface-card w-full max-w-[26rem] -rotate-2 overflow-hidden rounded-card shadow-float"
    >
      <div className="surface-wing tint flex h-24 items-start justify-end p-5">
        <Mark size={40} variant="kit" />
      </div>
      <div className="px-6 pb-6">
        <span className="-mt-12 inline-block p-1.5">
          <Avatar user={{ displayName: name, handle: handle || "nook", avatarUrl: null }} size={84} presence="online" halo={6} />
        </span>
        <figcaption className="mt-3 min-w-0">
          <p
            className={`line-clamp-2 font-display text-3xl leading-[1.02] font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere] ${name ? "text-fg" : "text-fg-2"}`}
          >
            {name || "Your name"}
          </p>
          <p className="mt-1.5 truncate text-md font-semibold text-fg-2">@{handle || "handle"}</p>
        </figcaption>
        <p className="mt-6 flex items-baseline justify-between gap-3 rounded-full bg-chip px-4 py-2.5 text-sm font-semibold text-on-chip">
          <span>Member since</span>
          <span className="font-extrabold" data-num>
            {monthYear.format(since)}
          </span>
        </p>
      </div>
    </figure>
  );
}
