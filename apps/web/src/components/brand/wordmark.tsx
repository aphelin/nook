import Link from "next/link";
import { Mark } from "./mark";

interface WordmarkProps {
  href?: string;
  className?: string;
  /** `md` for a page's top bar, `lg` for the landing page. */
  size?: "md" | "lg";
}

/**
 * "Nook", with its two o's drawn as the two shapes of the mark.
 *
 * The letters are real text in the display face and the shapes are sized in em and sit on the
 * baseline, so the wordmark is set like a word at every size rather than scaled like a picture.
 * The shapes take the surface's face colours, so the wordmark is always in the club's colours.
 */
export function Wordmark({ href = "/", className = "", size = "md" }: WordmarkProps) {
  return (
    <Link
      href={href}
      aria-label="Nook"
      className={`inline-flex items-baseline rounded-chip font-display leading-none font-extrabold tracking-[-0.03em] text-fg no-underline ${
        size === "lg" ? "text-2xl" : "text-xl"
      } ${className}`}
    >
      <span aria-hidden="true">N</span>
      <Mark variant="kit" size={40} className="mx-[0.05em] h-[0.6em] w-[1.1em]" />
      <span aria-hidden="true">k</span>
    </Link>
  );
}
