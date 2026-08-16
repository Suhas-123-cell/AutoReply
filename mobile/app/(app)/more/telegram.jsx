import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../src/lib/workspace-access";
import { confirmAsync } from "../../../src/lib/confirm";
import Card from "../../../src/ui/Card";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";
import Toggle from "../../../src/ui/Toggle";

// Combines bot connect/disconnect (settings) and keyword-reply automations
// (content) into one screen, unlike the web app's split between /settings
// and /telegram — mobile only has room for one "Telegram" row under More,
// and Telegram is a secondary channel next to the main Campaigns tab's
// Instagram focus, so one screen is simpler than a second tab-level stack.
export default function TelegramScreen() {
  const { role } = useAuth();
  const canManage = canManageWorkspace(role);
  const queryClient = useQueryClient();

  const [botToken, setBotToken] = useState("");
  const [connectError, setConnectError] = useState(null);

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [formError, setFormError] = useState(null);

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: () => apiFetch("/api/telegram/connect"),
  });
  const accounts = accountsData ?? [];
  const activeAccountId = selectedAccountId || accounts[0]?.id || "";

  const { data: automationsData, isLoading: automationsLoading } = useQuery({
    queryKey: ["telegram-automations"],
    queryFn: () => apiFetch("/api/telegram/automations"),
    enabled: accounts.length > 0,
  });
  const automations = automationsData ?? [];

  const connect = useMutation({
    mutationFn: (token) =>
      apiFetch("/api/telegram/connect", { method: "POST", body: { botToken: token } }),
    onSuccess: () => {
      setBotToken("");
      setConnectError(null);
      queryClient.invalidateQueries({ queryKey: ["telegram-accounts"] });
    },
    onError: (err) =>
      setConnectError(err instanceof ApiError ? err.message : "Could not connect bot"),
  });

  const disconnect = useMutation({
    mutationFn: (telegramAccountId) =>
      apiFetch("/api/telegram/connect", { method: "DELETE", body: { telegramAccountId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["telegram-automations"] });
    },
    onError: () => Alert.alert("Couldn't disconnect", "Please try again."),
  });

  const createAutomation = useMutation({
    mutationFn: (body) => apiFetch("/api/telegram/automations", { method: "POST", body }),
    onSuccess: () => {
      setName("");
      setKeywords("");
      setReplyMessage("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["telegram-automations"] });
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : "Could not create automation"),
  });

  const toggleAutomation = useMutation({
    mutationFn: ({ id, isActive }) =>
      apiFetch(`/api/telegram/automations?id=${id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["telegram-automations"] }),
    onError: () => Alert.alert("Couldn't update automation", "Please try again."),
  });

  const deleteAutomation = useMutation({
    mutationFn: (id) => apiFetch(`/api/telegram/automations?id=${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["telegram-automations"] }),
    onError: () => Alert.alert("Couldn't delete automation", "Please try again."),
  });

  const handleConnect = () => {
    if (!botToken.trim()) return setConnectError("Paste a bot token first");
    connect.mutate(botToken.trim());
  };

  const handleDisconnect = async (account) => {
    const ok = await confirmAsync(
      "Disconnect bot?",
      `@${account.botUsername}'s automations will stop replying.`
    );
    if (ok) disconnect.mutate(account.id);
  };

  const handleCreate = () => {
    const parsedKeywords = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!activeAccountId) return setFormError("Connect a Telegram bot first.");
    if (parsedKeywords.length === 0) return setFormError("Add at least one keyword.");
    setFormError(null);
    createAutomation.mutate({
      telegramAccountId: activeAccountId,
      name: name.trim() || `Keyword reply: ${parsedKeywords[0]}`,
      keywords: parsedKeywords,
      replyMessage,
    });
  };

  const handleDeleteAutomation = async (automation) => {
    const ok = await confirmAsync(
      "Delete keyword reply?",
      `"${automation.name}" will stop replying.`
    );
    if (ok) deleteAutomation.mutate(automation.id);
  };

  if (accountsLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-20" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text className="mb-1 text-sm font-semibold text-foreground">Telegram bots</Text>
        <Text className="mb-3 text-xs text-muted">
          No app review, no gate — a bot token from @BotFather is live in about two minutes.
        </Text>

        {accounts.length === 0 ? (
          <EmptyState
            title="No bots connected"
            subtitle={canManage ? undefined : "Ask an owner or admin to connect a bot."}
          />
        ) : (
          accounts.map((account) => (
            <View
              key={account.id}
              className="mb-2 flex-row items-center justify-between border-b border-border pb-2"
            >
              <Text className="text-sm text-foreground">@{account.botUsername}</Text>
              {canManage ? (
                <Pressable onPress={() => handleDisconnect(account)}>
                  <Text className="text-xs font-medium text-error">Disconnect</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        {canManage ? (
          <View className="mt-3 gap-2">
            <TextInput
              value={botToken}
              onChangeText={setBotToken}
              placeholder="Bot token from @BotFather"
              placeholderTextColor="#9b9ba3"
              autoCapitalize="none"
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            />
            {connectError ? <Text className="text-xs text-error">{connectError}</Text> : null}
            <Pressable
              onPress={handleConnect}
              disabled={connect.isPending}
              className={`rounded-lg px-4 py-3 ${connect.isPending ? "bg-accent-hover opacity-60" : "bg-accent"}`}
            >
              <Text className="text-center text-sm font-semibold text-background">
                {connect.isPending ? "Connecting..." : "Connect bot"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      {accounts.length > 0 && canManage ? (
        <Card>
          <Text className="mb-3 text-sm font-semibold text-foreground">New keyword reply</Text>

          {accounts.length > 1 ? (
            <View className="mb-3 flex-row flex-wrap gap-2">
              {accounts.map((account) => {
                const active = activeAccountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => setSelectedAccountId(account.id)}
                    className={`rounded-full border px-3 py-1.5 ${
                      active ? "border-accent bg-accent" : "border-border bg-background"
                    }`}
                  >
                    <Text className={active ? "text-xs font-medium text-background" : "text-xs text-muted"}>
                      @{account.botUsername}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name (optional)"
            placeholderTextColor="#9b9ba3"
            className="mb-2 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
          <TextInput
            value={keywords}
            onChangeText={setKeywords}
            placeholder="Keywords, comma-separated"
            placeholderTextColor="#9b9ba3"
            autoCapitalize="none"
            className="mb-2 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
          />
          <TextInput
            value={replyMessage}
            onChangeText={setReplyMessage}
            placeholder="Reply message"
            placeholderTextColor="#9b9ba3"
            multiline
            numberOfLines={3}
            className="mb-2 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            style={{ textAlignVertical: "top" }}
          />
          {formError ? <Text className="mb-2 text-xs text-error">{formError}</Text> : null}
          <Pressable
            onPress={handleCreate}
            disabled={createAutomation.isPending}
            className={`rounded-lg px-4 py-3 ${createAutomation.isPending ? "bg-accent-hover opacity-60" : "bg-accent"}`}
          >
            <Text className="text-center text-sm font-semibold text-background">
              {createAutomation.isPending ? "Creating..." : "Create automation"}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {accounts.length > 0 ? (
        <Card>
          <Text className="mb-3 text-sm font-semibold text-foreground">
            Keyword replies ({automations.length})
          </Text>
          {automationsLoading ? (
            <Skeleton className="h-16" />
          ) : automations.length === 0 ? (
            <EmptyState title="No automations yet" />
          ) : (
            automations.map((automation) => (
              <View key={automation.id} className="mb-3 border-b border-border pb-3">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 pr-2 text-sm font-semibold text-foreground" numberOfLines={1}>
                    {automation.name}
                  </Text>
                  <Toggle
                    value={automation.isActive}
                    disabled={!canManage || toggleAutomation.isPending}
                    onValueChange={(value) =>
                      toggleAutomation.mutate({ id: automation.id, isActive: value })
                    }
                  />
                </View>
                <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                  @{automation.telegramAccount.botUsername} · keywords: {automation.keywords.join(", ")}
                </Text>
                <Text className="mt-1 text-sm text-foreground/80" numberOfLines={2}>
                  {automation.replyMessage}
                </Text>
                {canManage ? (
                  <Pressable onPress={() => handleDeleteAutomation(automation)} className="mt-2 self-start">
                    <Text className="text-xs font-medium text-error">Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}
