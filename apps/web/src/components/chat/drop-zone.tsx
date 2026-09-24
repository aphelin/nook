"use client";

import { type DragEvent, type ReactNode, useRef, useState } from "react";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/** Accepts files dropped anywhere over the conversation. */
export function DropZone({ label, onFiles, children }: { label: string; onFiles: (files: FileList) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  // dragenter/dragleave fire for every child; count them so the overlay doesn't flicker.
  const depth = useRef(0);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {over && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-card border-[3px] border-dashed border-fg bg-[color-mix(in_oklab,var(--bg)_92%,transparent)]"
        >
          <p className="pop-in max-w-[20ch] text-center font-display text-3xl font-extrabold tracking-[-0.03em] text-balance">{label}</p>
        </div>
      )}
    </div>
  );
}
