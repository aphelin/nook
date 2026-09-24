"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { Attachment } from "@nook/contracts";
import { ArrowSquareOut, DownloadSimple, File, FilePdf, FileText, FileZip, MusicNote, X } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
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

function Lightbox({ image, onClose }: { image: Attachment | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!image} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 outline-none transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:p-10">
          {image && (
            <>
              <div className="flex w-full max-w-5xl items-center gap-3 text-white">
                <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">{image.fileName}</Dialog.Title>
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
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs from object storage */}
              <img
                src={image.url}
                alt={image.fileName}
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                className="max-h-[calc(100dvh-8rem)] w-auto max-w-full rounded-field object-contain"
              />
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Attachments({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (items.length === 0) return null;
  const images = items.filter(isImage);
  const files = items.filter((a) => !isImage(a));

  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.length === 1 && <SingleImage a={images[0]!} onOpen={() => setOpen(images[0]!)} />}
      {images.length > 1 && (
        <ul className="grid max-w-[26rem] grid-cols-2 gap-1.5" aria-label={`${images.length} images`}>
          {images.map((a) => (
            <li key={a.id}>
              {a.width ? (
                <button
                  type="button"
                  onClick={() => setOpen(a)}
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
      <Lightbox image={open} onClose={() => setOpen(null)} />
    </div>
  );
}
