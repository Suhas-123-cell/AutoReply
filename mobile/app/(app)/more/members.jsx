import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
  );
}
