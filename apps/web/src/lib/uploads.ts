"use client";

import { type Attachment, MAX_ATTACHMENTS, MAX_UPLOAD_BYTES, UPLOAD_TYPES, UploadTicket } from "@nook/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "./api";

export interface PendingUpload {
  localId: string;
  file: File;
  /** A local object URL for images, so previews show instantly. */
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  progress: number;
  status: "uploading" | "ready" | "error";
  error: string | null;
  attachmentId: string | null;
}

const isImage = (type: string) => UPLOAD_TYPES[type as keyof typeof UPLOAD_TYPES] === "image";

/** Reads an image's pixel size locally, so even unsent previews reserve the right space. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** PUT straight to storage with real progress (fetch can't report upload progress). */
export function put(url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage said ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

function problem(file: File, count: number): string | null {
  if (count >= MAX_ATTACHMENTS) return `Up to ${MAX_ATTACHMENTS} files per message.`;
  if (!(file.type in UPLOAD_TYPES)) return `${file.name} can’t be shared here. Images, PDFs, text, zip and MP3 files work.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** The files attached to the message being written: uploading as soon as they're added. */
export function useUploads() {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  // add() needs the current count without re-creating itself on every change.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((localId: string, change: Partial<PendingUpload>) => {
    setItems((all) => all.map((u) => (u.localId === localId ? { ...u, ...change } : u)));
  }, []);

  const start = useCallback(
    async (item: PendingUpload) => {
      const controller = new AbortController();
      controllers.current.set(item.localId, controller);
      try {
        const ticket = await api("/uploads", {
          method: "POST",
          body: { fileName: item.file.name, mimeType: item.file.type, size: item.file.size },
          schema: UploadTicket,
        });
        await put(ticket.uploadUrl, item.file, ticket.headers, (p) => patch(item.localId, { progress: p }), controller.signal);
        await api(`/uploads/${ticket.attachmentId}/complete`, { method: "POST" });
        patch(item.localId, { status: "ready", progress: 1, attachmentId: ticket.attachmentId });
      } catch (err) {
        if (controller.signal.aborted) return;
        patch(item.localId, {
          status: "error",
          error: err instanceof ApiRequestError ? err.message : "Upload failed. Remove it and try again.",
        });
      } finally {
        controllers.current.delete(item.localId);
      }
    },
    [patch],
  );

  const add = useCallback(
    async (files: FileList | File[]) => {
      setNotice(null);
      let count = itemsRef.current.length;
      const accepted: PendingUpload[] = [];
      for (const file of Array.from(files)) {
        const reason = problem(file, count);
        if (reason) {
          setNotice(reason);
          continue;
        }
        const previewUrl = isImage(file.type) ? URL.createObjectURL(file) : null;
        const size = previewUrl ? await measure(previewUrl) : null;
        accepted.push({
          localId: crypto.randomUUID(),
          file,
          previewUrl,
          width: size?.width ?? null,
          height: size?.height ?? null,
          progress: 0,
          status: "uploading",
          error: null,
          attachmentId: null,
        });
        count++;
      }
      setItems((all) => [...all, ...accepted]);
      for (const item of accepted) void start(item);
    },
    [start],
  );

  const remove = useCallback((localId: string) => {
    controllers.current.get(localId)?.abort();
    setItems((all) => {
      const gone = all.find((u) => u.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return all.filter((u) => u.localId !== localId);
    });
  }, []);

  /** After sending: the message now owns the files. Object URLs stay alive for the optimistic copy. */
  const clear = useCallback(() => setItems([]), []);

  useEffect(() => {
    const map = controllers.current;
    return () => {
      for (const c of map.values()) c.abort();
    };
  }, []);

  return {
    items,
    notice,
    dismissNotice: () => setNotice(null),
    add,
    remove,
    clear,
    uploading: items.some((u) => u.status === "uploading"),
    readyIds: items.filter((u) => u.status === "ready").map((u) => u.attachmentId!),
    hasErrors: items.some((u) => u.status === "error"),
  };
}

export type Uploads = ReturnType<typeof useUploads>;

/** What an optimistic message shows for a file it's sending. */
export function optimisticAttachment(u: PendingUpload): Attachment {
  return {
    id: u.attachmentId!,
    fileName: u.file.name,
    mimeType: u.file.type,
    size: u.file.size,
    status: "pending",
    url: u.previewUrl ?? "about:blank",
    thumbUrl: u.previewUrl,
    width: u.width,
    height: u.height,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
