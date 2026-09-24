"use client";

import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  AvatarTicket,
  type NookDetail,
  PublicUser,
  type UpdateProfile,
  type UserStatus,
} from "@nook/contracts";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api";
import { useSession } from "./session";
import { put } from "./uploads";

/** Someone's profile changed: patch every place the app holds a copy of them. */
export function applyUser(qc: QueryClient, user: PublicUser) {
  qc.setQueriesData<NookDetail>({ queryKey: ["nook"] }, (detail) => {
    if (!detail || !detail.members.some((m) => m.id === user.id || detail.channels.some((c) => c.dmUser?.id === user.id))) return detail;
    return {
      ...detail,
      members: detail.members.map((m) => (m.id === user.id ? { ...m, ...user } : m)),
      channels: detail.channels.map((c) => (c.dmUser?.id === user.id ? { ...c, dmUser: user } : c)),
    };
  });
}

/** A status that has passed its expiry reads as none, even before the server says so. */
export function liveStatus(status: UserStatus, now = Date.now()): UserStatus | null {
  if (!status.emoji && !status.text) return null;
  if (status.expiresAt && new Date(status.expiresAt).getTime() <= now) return null;
  return status;
}

function useApplyMine() {
  const qc = useQueryClient();
  const { updateUser } = useSession();
  return (user: PublicUser) => {
    updateUser(user);
    applyUser(qc, user);
  };
}

export function useUpdateProfile() {
  const apply = useApplyMine();
  return useMutation({
    mutationFn: (input: UpdateProfile) => api("/users/me", { method: "PATCH", body: input, schema: PublicUser }),
    onSuccess: apply,
  });
}

export type AvatarState =
  { status: "idle" } | { status: "uploading"; progress: number; preview: string } | { status: "error"; message: string };

/** Checks the file, PUTs it straight to storage with progress, then asks the api to crop it. */
export function useAvatar() {
  const apply = useApplyMine();
  const [state, setState] = useState<AvatarState>({ status: "idle" });

  async function upload(file: File) {
    if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
      setState({ status: "error", message: "Use a PNG, JPEG, WebP or GIF image." });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setState({ status: "error", message: `That image is over ${AVATAR_MAX_BYTES / 1024 / 1024} MB.` });
      return;
    }
    const preview = URL.createObjectURL(file);
    setState({ status: "uploading", progress: 0, preview });
    try {
      const ticket = await api("/users/me/avatar", {
        method: "POST",
        body: { mimeType: file.type, size: file.size },
        schema: AvatarTicket,
      });
      await put(
        ticket.uploadUrl,
        file,
        ticket.headers,
        (p) => setState({ status: "uploading", progress: p, preview }),
        new AbortController().signal,
      );
      apply(await api(`/users/me/avatar/${ticket.uploadId}/complete`, { method: "POST", schema: PublicUser }));
      setState({ status: "idle" });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error && err.message !== "network" ? err.message : "Couldn’t upload that. Try again.",
      });
    } finally {
      URL.revokeObjectURL(preview);
    }
  }

  async function remove() {
    try {
      apply(await api("/users/me/avatar", { method: "DELETE", schema: PublicUser }));
      setState({ status: "idle" });
    } catch {
      setState({ status: "error", message: "Couldn’t remove it. Try again." });
    }
  }

  return { state, upload, remove };
}
