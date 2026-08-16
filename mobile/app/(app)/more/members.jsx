import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../src/lib/workspace-access";
import { confirmAsync } from "../../../src/lib/confirm";
import Card from "../../../src/ui/Card";
import Skeleton from "../../../src/ui/Skeleton";

export default function MembersScreen() {
  const { user, role } = useAuth();
  const canManage = canManageWorkspace(role);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-members"],
    queryFn: () => apiFetch("/api/workspace/members"),
  });

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [error, setError] = useState(null);
  const [accessTarget, setAccessTarget] = useState(null);
  const [accessSelection, setAccessSelection] = useState({ ig: new Set(), tg: new Set() });

  const { data: igData } = useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiFetch("/api/instagram/accounts"),
    enabled: canManage,
  });
  const { data: tgData } = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: () => apiFetch("/api/telegram/connect"),
    enabled: canManage,
  });
  const instagramAccounts = igData?.instagramAccounts ?? [];
  const telegramAccounts = tgData ?? [];

  const setMembersData = (payload) => queryClient.setQueryData(["workspace-members"], payload);

  const invite = useMutation({
    mutationFn: (body) => apiFetch("/api/workspace/members", { method: "POST", body }),
    onSuccess: (payload) => {
      setMembersData(payload);
      setEmail("");
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not invite member"),
  });

  const changeRole = useMutation({
    mutationFn: ({ memberId, role: newRole }) =>
      apiFetch("/api/workspace/members", { method: "PATCH", body: { memberId, role: newRole } }),
    onSuccess: (payload) => setMembersData(payload),
    onError: () => Alert.alert("Couldn't update role", "Please try again."),
  });

  const removeMember = useMutation({
    mutationFn: (memberId) =>
      apiFetch("/api/workspace/members", { method: "DELETE", body: { memberId } }),
    onSuccess: (payload) => setMembersData(payload),
    onError: () => Alert.alert("Couldn't remove member", "Please try again."),
  });

  const revokeInvitation = useMutation({
    mutationFn: (invitationId) =>
      apiFetch("/api/workspace/members", { method: "DELETE", body: { invitationId } }),
    onSuccess: (payload) => setMembersData(payload),
    onError: () => Alert.alert("Couldn't revoke invite", "Please try again."),
  });

  const setAccountAccess = useMutation({
    mutationFn: ({ memberId, instagramAccountIds, telegramAccountIds }) =>
      apiFetch("/api/workspace/members/account-access", {
        method: "PUT",
        body: { memberId, instagramAccountIds, telegramAccountIds },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      setAccessTarget(null);
    },
    onError: () => Alert.alert("Couldn't update access", "Please try again."),
  });

  const openAccess = (member) => {
    const ig = new Set(
      (member.accountAccess ?? []).flatMap((a) => (a.instagramAccountId ? [a.instagramAccountId] : []))
    );
    const tg = new Set(
      (member.accountAccess ?? []).flatMap((a) => (a.telegramAccountId ? [a.telegramAccountId] : []))
    );
    setAccessSelection({ ig, tg });
    setAccessTarget(member);
  };

  const toggleAccess = (kind, id) => {
    setAccessSelection((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });
  };

  const saveAccess = () => {
    if (!accessTarget) return;
    setAccountAccess.mutate({
      memberId: accessTarget.id,
      instagramAccountIds: [...accessSelection.ig],
      telegramAccountIds: [...accessSelection.tg],
    });
  };

  const handleInvite = () => {
    if (!email.trim()) return setError("Email is required");
    invite.mutate({ email: email.trim(), role: inviteRole });
  };

  const handleRemove = async (member) => {
    const ok = await confirmAsync(
      "Remove member?",
      `${member.user.email ?? "This member"} will lose access.`
    );
    if (ok) removeMember.mutate(member.id);
  };

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </View>
    );
  }

  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];

  return (
    <>
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Text className="mb-3 text-sm font-semibold text-foreground">Members</Text>
        {members.map((member) => {
          const isSelf = member.user.id === user?.id;
          const isOwner = member.role === "OWNER";
          return (
            <View
              key={member.id}
              className="mb-3 flex-row items-center justify-between border-b border-border pb-3"
            >
              <View className="flex-1 pr-2">
                <Text className="text-sm text-foreground" numberOfLines={1}>
                  {member.user.name ?? member.user.email ?? "Unknown member"}
                </Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {member.user.email}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                {canManage && !isOwner ? (
                  <Pressable
                    onPress={() =>
                      changeRole.mutate({
                        memberId: member.id,
                        role: member.role === "ADMIN" ? "MEMBER" : "ADMIN",
                      })
                    }
                  >
                    <Text className="text-xs font-medium text-accent">{member.role}</Text>
                  </Pressable>
                ) : (
                  <Text className="text-xs font-medium text-muted">{member.role}</Text>
                )}
                {canManage && member.role === "MEMBER" ? (
                  <Pressable onPress={() => openAccess(member)}>
                    <Text className="text-xs font-medium text-accent">Access</Text>
                  </Pressable>
                ) : null}
                {canManage && !isOwner && !isSelf ? (
                  <Pressable onPress={() => handleRemove(member)}>
                    <Text className="text-xs font-medium text-error">Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <Text className="mb-3 text-sm font-semibold text-foreground">Pending invites</Text>
          {invitations.map((invitation) => (
            <View
              key={invitation.id}
              className="mb-3 flex-row items-center justify-between border-b border-border pb-3"
            >
              <View className="flex-1 pr-2">
                <Text className="text-sm text-foreground" numberOfLines={1}>
                  {invitation.email}
                </Text>
                <Text className="text-xs text-muted">{invitation.role}</Text>
              </View>
              {canManage ? (
                <Pressable onPress={() => revokeInvitation.mutate(invitation.id)}>
                  <Text className="text-xs font-medium text-error">Revoke</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <Text className="mb-3 text-sm font-semibold text-foreground">Invite someone</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="teammate@agency.com"
            placeholderTextColor="#9b9ba3"
            autoCapitalize="none"
            keyboardType="email-address"
            className="mb-3 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
          <View className="mb-3 flex-row gap-2">
            {["MEMBER", "ADMIN"].map((r) => (
              <Pressable
                key={r}
                onPress={() => setInviteRole(r)}
                className={`rounded-full border px-3 py-1.5 ${
                  inviteRole === r ? "border-accent bg-accent" : "border-border bg-background"
                }`}
              >
                <Text
                  className={inviteRole === r ? "text-xs font-medium text-background" : "text-xs text-muted"}
                >
                  {r === "ADMIN" ? "Admin" : "Member"}
                </Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text className="mb-2 text-xs text-error">{error}</Text> : null}
          <Pressable
            onPress={handleInvite}
            disabled={invite.isPending}
            className={`rounded-lg px-4 py-3 ${invite.isPending ? "bg-accent-hover opacity-60" : "bg-accent"}`}
          >
            <Text className="text-center text-sm font-semibold text-background">
              {invite.isPending ? "Inviting..." : "Invite"}
            </Text>
          </Pressable>
        </Card>
      ) : null}
    </ScrollView>

    <Modal
      visible={Boolean(accessTarget)}
      animationType="slide"
      transparent
      onRequestClose={() => setAccessTarget(null)}
    >
      <Pressable className="flex-1 bg-black/50" onPress={() => setAccessTarget(null)} />
      <View
        className="max-h-[80%] rounded-t-2xl border border-border bg-background"
        style={{ shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12 }}
      >
        <View className="items-center py-2.5">
          <View className="h-1 w-10 rounded-full bg-border-hover" />
        </View>
        <View className="px-4 pb-3">
          <Text className="text-base font-semibold text-foreground">
            {accessTarget?.user.name ?? accessTarget?.user.email}&apos;s access
          </Text>
          <Text className="mt-1 text-xs text-muted">
            Leave everything unchecked to give this member every account, same as today. Check one
            or more to restrict them to only those clients.
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 4 }}>
          {instagramAccounts.length > 0 ? (
            <Text className="mb-1 mt-2 text-[11px] uppercase tracking-wide text-muted">
              Instagram
            </Text>
          ) : null}
          {instagramAccounts.map((account) => {
            const checked = accessSelection.ig.has(account.id);
            return (
              <Pressable
                key={account.id}
                onPress={() => toggleAccess("ig", account.id)}
                className="flex-row items-center gap-3 rounded-lg px-2 py-2.5"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    checked ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  {checked ? <Text className="text-xs font-bold text-background">✓</Text> : null}
                </View>
                <Text className="text-sm text-foreground">@{account.username}</Text>
              </Pressable>
            );
          })}

          {telegramAccounts.length > 0 ? (
            <Text className="mb-1 mt-3 text-[11px] uppercase tracking-wide text-muted">
              Telegram
            </Text>
          ) : null}
          {telegramAccounts.map((account) => {
            const checked = accessSelection.tg.has(account.id);
            return (
              <Pressable
                key={account.id}
                onPress={() => toggleAccess("tg", account.id)}
                className="flex-row items-center gap-3 rounded-lg px-2 py-2.5"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    checked ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  {checked ? <Text className="text-xs font-bold text-background">✓</Text> : null}
                </View>
                <Text className="text-sm text-foreground">@{account.botUsername}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="flex-row gap-3 px-4 pb-6 pt-2">
          <Pressable
            onPress={() => setAccessTarget(null)}
            className="flex-1 items-center rounded-lg border border-border px-4 py-3"
          >
            <Text className="text-sm font-medium text-foreground">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={saveAccess}
            disabled={setAccountAccess.isPending}
            className={`flex-1 items-center rounded-lg px-4 py-3 ${
              setAccountAccess.isPending ? "bg-accent-hover opacity-60" : "bg-accent"
            }`}
          >
            <Text className="text-sm font-semibold text-background">
              {setAccountAccess.isPending ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}
