"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { Attachment } from "@nook/contracts";
import {
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  File,
  FilePdf,
  FileText,
  FileZip,
  MusicNote,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/uploads";

const isImage = (a: Attachment) => a.mimeType.startsWith("image/") && a.status !== "failed";

function FileIcon({ mime }: { mime: string }) {
  const props = { size: 24, weight: "bold" as const, "aria-hidden": true };
  if (mime === "application/pdf") return <FilePdf {...props} />;
  if (mime === "application/zip") return <FileZip {...props} />;
  if (mime === "text/plain") return <FileText {...props} />;
  if (mime.startsWith("audio/")) return <MusicNote {...props} />;
  return <File {...props} />;
}

function FileCard({ a }: { a: Attachment }) {
  return (
    <a
      href={a.status === "pending" && a.url.startsWith("blob:") ? undefined : a.url}
      download={a.fileName}
      className="group/file surface-card tint flex w-full max-w-[22rem] items-center gap-3 rounded-field px-3.5 py-3 no-underline shadow-card transition-[scale] duration-200 ease-out-expo hover:scale-[1.01]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-hi text-on-hi">
        <FileIcon mime={a.mimeType} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{a.fileName}</span>
        <span className="block text-sm text-fg-2">{formatBytes(a.size)}</span>
      </span>
      <DownloadSimple size={20} weight="bold" aria-hidden="true" className="shrink-0 text-fg-2 group-hover/file:text-fg" />
    </a>
  );
}

/** One image shown at its real proportions within a box; the space is reserved before it loads. */
function SingleImage({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  if (!a.width || !a.height) {
    return <div className="grid h-40 w-60 place-items-center rounded-field bg-hover text-sm font-semibold">Processing image…</div>;
  }
  const scale = Math.min(1, 420 / a.width, 320 / a.height);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${a.fileName}`}
      className="block self-start overflow-hidden rounded-field bg-hover shadow-card transition-[scale] duration-200 ease-out-expo hover:scale-[1.01]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from object storage */}
      <img
        src={a.thumbUrl ?? a.url}
        alt={a.fileName}
        width={Math.round(a.width * scale)}
        height={Math.round(a.height * scale)}
        loading="lazy"
        decoding="async"
        className="block h-auto max-w-full object-cover"
        style={{ aspectRatio: `${a.width} / ${a.height}` }}
      />
    </button>
  );
}

/*
 * The viewer. A message's pictures open over the room at full size, one at a time, with a way
 * round the others it came with: arrows at the sides, the arrow keys, a swipe on a touchscreen, and
 * a count of where you are. A click anywhere but the picture and its controls puts it away, as the
 * Escape key does; the neighbours are fetched ahead so the next one is already there.
 */
function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: Attachment[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const image = index === null ? null : (images[index] ?? null);
  const many = images.length > 1;
  // Which way the last move went, so the next picture comes in from that side.
  const [heading, setHeading] = useState<1 | -1>(1);
  const go = (step: 1 | -1) => {
    if (index === null || !many) return;
    setHeading(step);
    onIndex((index + step + images.length) % images.length);
  };
  // The arrow keys step wherever focus is while it is open. Caught on the way down: the dialog's popup
  // keeps arrow keys from bubbling out of it. Swapped in the commit itself, so a key pressed straight
  // after a click steps from the picture that click brought up.
  useLayoutEffect(() => {
    if (index === null || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setHeading(step);
      onIndex((index + step + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, many, images.length, onIndex]);
  // The ones either side, fetched ahead.
  useEffect(() => {
    if (index === null || !many) return;
    for (const step of [1, -1]) {
      const next = images[(index + step + images.length) % images.length];
      if (next) new Image().src = next.url;
    }
  }, [index, many, images]);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - from.y)) go(dx < 0 ? 1 : -1);
  };
  // The arrows sit at the screen's sides, level with the middle of the picture.
  const arrow =
    "absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/22 max-sm:hidden";

  return (
    <Dialog.Root open={!!image} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/85 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          onClick={(e) => {
            // Anywhere that is not the picture or a control: the dim around it.
            if (!(e.target as Element).closest("img, button, a")) onClose();
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)_2.5rem] px-4 pt-3 pb-2 outline-none transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:px-6 sm:pt-4"
        >
          {image && (
            <>
              {/* Across the top of the screen, whatever the picture's size: its name, where you are, the original, close. */}
              <div className="flex items-center gap-3 text-white">
                <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">{image.fileName}</Dialog.Title>
                {many && (
                  <span className="shrink-0 text-sm font-semibold text-white/75" data-num aria-live="polite">
                    {index! + 1} of {images.length}
                  </span>
                )}
                <a
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-md font-semibold text-white no-underline hover:bg-white/10"
                >
                  <ArrowSquareOut size={18} weight="bold" aria-hidden="true" /> Original
                </a>
                <Dialog.Close aria-label="Close" className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10">
                  <X size={22} weight="bold" aria-hidden="true" />
                </Dialog.Close>
              </div>
              <div className="relative flex min-h-0 items-center justify-center py-3 sm:px-20">
                {many && (
                  <button type="button" aria-label="Previous image" onClick={() => go(-1)} className={`${arrow} left-0`}>
                    <CaretLeft size={22} weight="bold" aria-hidden="true" />
                  </button>
                )}
                {/* Keyed on the picture, so each one arrives (from the side the move went) instead of swapping in place. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from object storage */}
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.fileName}
                  width={image.width ?? undefined}
                  height={image.height ?? undefined}
                  data-heading={heading}
                  className="lightbox-in h-auto max-h-[calc(100dvh-8.5rem)] w-auto max-w-full rounded-field object-contain select-none"
                  draggable={false}
                />
                {many && (
                  <button type="button" aria-label="Next image" onClick={() => go(1)} className={`${arrow} right-0`}>
                    <CaretRight size={22} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </div>
              {many ? (
                // Where you are among them, and a quick way to any one (the arrows are hidden on phones; swipe there).
                <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Images in this message">
                  {images.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      aria-label={`Image ${i + 1} of ${images.length}`}
                      aria-current={i === index || undefined}
                      onClick={() => {
                        setHeading(i > index! ? 1 : -1);
                        onIndex(i);
                      }}
                      className="size-2.5 rounded-full bg-white/35 transition-[background-color,scale] duration-200 hover:bg-white/60 aria-[current]:scale-125 aria-[current]:bg-white"
                    />
                  ))}
                </div>
              ) : (
                <span />
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Attachments({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;
  const images = items.filter(isImage);
  // The viewer steps through the pictures that are ready (one still processing has nothing to show yet).
  const viewable = images.filter((a) => a.width);
  const files = items.filter((a) => !isImage(a));

  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.length === 1 && <SingleImage a={images[0]!} onOpen={() => setOpen(0)} />}
      {images.length > 1 && (
        <ul className="grid max-w-[26rem] grid-cols-2 gap-1.5" aria-label={`${images.length} images`}>
          {images.map((a) => (
            <li key={a.id}>
              {a.width ? (
                <button
                  type="button"
                  onClick={() => setOpen(viewable.indexOf(a))}
                  aria-label={`Open ${a.fileName}`}
                  className="block aspect-square w-full overflow-hidden rounded-field bg-hover transition-[scale] duration-200 ease-out-expo hover:scale-[1.02]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from object storage */}
                  <img src={a.thumbUrl ?? a.url} alt={a.fileName} loading="lazy" decoding="async" className="size-full object-cover" />
                </button>
              ) : (
                <div className="grid aspect-square place-items-center rounded-field bg-hover text-sm font-semibold">Processing…</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {files.map((a) => (
        <FileCard key={a.id} a={a} />
      ))}
      <Lightbox images={viewable} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </div>
  );
}
