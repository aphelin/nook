"use client";

import { Channel, type CreateChannel, type CreateInvite, type CreateNook, Invite, InvitePreview, Nook, NookDetail } from "@nook/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./api";
import { useSession } from "./session";

export const keys = {
  nooks: ["nooks"] as const,
  nook: (slug: string) => ["nook", slug] as const,
  invites: (slug: string) => ["invites", slug] as const,
  invite: (code: string) => ["invite", code] as const,
};

function useSignedIn() {
  return useSession().state.status === "authenticated";
}

export function useNooks() {
  return useQuery({
    queryKey: keys.nooks,
    queryFn: () => api("/nooks", { schema: z.array(Nook) }),
    enabled: useSignedIn(),
  });
}

/** A nook's channels and members, as a query anything can load ahead of time. */
export const nookDetailQuery = (slug: string) => ({
  queryKey: keys.nook(slug),
  queryFn: () => api(`/nooks/${slug}`, { schema: NookDetail }),
});

export function useNookDetail(slug: string) {
  return useQuery({ ...nookDetailQuery(slug), enabled: useSignedIn() });
}

export function useCreateNook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNook) => api("/nooks", { method: "POST", body: input, schema: NookDetail }),
    onSuccess: (detail) => {
      qc.setQueryData(keys.nook(detail.nook.slug), detail);
      void qc.invalidateQueries({ queryKey: keys.nooks });
    },
  });
}

export function useCreateChannel(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannel) => api(`/nooks/${slug}/channels`, { method: "POST", body: input, schema: Channel }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.nook(slug) }),
  });
}

export function useOpenDirect(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/nooks/${slug}/directs`, { method: "POST", body: { userId }, schema: Channel }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.nook(slug) }),
  });
}

export function useInvites(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invites(slug),
    queryFn: () => api(`/nooks/${slug}/invites`, { schema: z.array(Invite) }),
    enabled: useSignedIn() && enabled,
  });
}

export function useCreateInvite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvite) => api(`/nooks/${slug}/invites`, { method: "POST", body: input, schema: Invite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(slug) }),
  });
}

export function useRevokeInvite(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api(`/invites/${code}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(slug) }),
  });
}

/** Public: works signed out, so the join page can show the nook before anyone has an account. */
export function useInvitePreview(code: string) {
  return useQuery({
    queryKey: keys.invite(code),
    queryFn: () => api(`/invites/${code}`, { schema: InvitePreview }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api(`/invites/${code}/accept`, { method: "POST", schema: Nook }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.nooks }),
  });
}
