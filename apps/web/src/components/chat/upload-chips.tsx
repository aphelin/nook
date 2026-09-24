"use client";

import { WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { formatBytes, type Uploads } from "@/lib/uploads";

/** Files attached to the message being written, each with its own progress and state. */
export function UploadChips({ uploads }: { uploads: Uploads }) {
  if (uploads.items.length === 0) return null;
  return (
    <ul aria-label="Attached files" className="flex flex-wrap gap-2 px-2 pt-2">
      {uploads.items.map((u) => (
        <li
          key={u.localId}
          className={`pop-in relative flex w-[14rem] items-center gap-2.5 overflow-hidden rounded-field bg-chip p-1.5 pr-9 ${u.status === "error" ? "inset-ring-2 inset-ring-alert" : ""}`}
        >
          {u.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={u.previewUrl} alt="" className="size-11 shrink-0 rounded-chip object-cover" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-chip bg-hi text-2xs font-extrabold text-on-hi uppercase">
              {u.file.name.split(".").pop()?.slice(0, 4) ?? "file"}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{u.file.name}</span>
            <span
              title={u.status === "error" ? (u.error ?? undefined) : undefined}
              className={`flex items-center gap-1 text-sm ${u.status === "error" ? "text-alert" : "text-fg-2"}`}
            >
              {u.status === "error" && <WarningCircle size={14} weight="bold" aria-hidden="true" className="shrink-0" />}
              <span className="truncate">
                {u.status === "error" ? (
                  <>
                    Upload failed<span className="sr-only">: {u.error}</span>
                  </>
                ) : u.status === "uploading" ? (
                  `Uploading ${Math.round(u.progress * 100)}%`
                ) : (
                  formatBytes(u.file.size)
                )}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => uploads.remove(u.localId)}
            aria-label={`Remove ${u.file.name}`}
            className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full text-fg-2 hover:bg-hover-strong hover:text-fg"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
          {u.status === "uploading" && (
            <span
              role="progressbar"
              aria-label={`Uploading ${u.file.name}`}
              aria-valuenow={Math.round(u.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="absolute inset-x-0 bottom-0 h-[3px] bg-hover"
            >
              <span className="block h-full rounded-full bg-hi transition-[width] duration-150" style={{ width: `${u.progress * 100}%` }} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
