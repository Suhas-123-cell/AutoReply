import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../src/api/client";
import { useAuth } from "../../../../src/auth/AuthContext";
import { canManageWorkspace } from "../../../../src/lib/workspace-access";
import { validateStep1 } from "../../../../src/lib/campaign-validation";
import { useCampaignWizardStore } from "../../../../src/store/campaignWizardStore";
import EmptyState from "../../../../src/ui/EmptyState";
import WizardFooter from "../../../../src/ui/WizardFooter";

const SCOPES = [
  { value: "specific", label: "A specific post or reel" },
  { value: "any", label: "Any post or reel" },
  { value: "next", label: "The next post or reel" },
];

export default function WizardStep1() {
  const router = useRouter();
  const { role } = useAuth();
  const canManage = canManageWorkspace(role);
  const draft = useCampaignWizardStore((s) => s.draft);
  const setFields = useCampaignWizardStore((s) => s.setFields);
  const [error, setError] = useState(null);

  const { data: accountsData } = useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: () => apiFetch("/api/instagram/accounts"),
  });
  const accounts = accountsData?.instagramAccounts ?? [];

  // Default to the first connected account once accounts load, if the
  // (persisted) draft doesn't already have one.
  useEffect(() => {
    if (!draft.instagramAccountId && accounts.length > 0) {
      setFields({ instagramAccountId: accounts[0].id });
    }
  }, [accounts, draft.instagramAccountId, setFields]);

  // Re-validate the picked post is still selected when returning from the
  // post-picker modal (it writes directly into the store).
  useFocusEffect(
    useCallback(() => {
      setError(null);
    }, [])
  );

  const handleNext = () => {
    const err = validateStep1(draft);
    if (err) return setError(err);
    router.push("/campaigns/new/step-2");
  };

  if (!canManage) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-center text-sm text-muted">
          Only workspace owners and admins can create campaigns.
        </Text>
      </View>
    );
  }

  if (accounts.length === 0) {
    return (
      <View className="flex-1 bg-background p-4">
        <EmptyState
          title="Connect Instagram first"
          subtitle="You need a connected Instagram account before creating a campaign."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        {accounts.length > 1 ? (
          <View className="gap-2">
            <Text className="text-xs font-medium text-muted">Instagram account</Text>
            <View className="flex-row flex-wrap gap-2">
              {accounts.map((account) => {
                const active = draft.instagramAccountId === account.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() =>
                      setFields({
                        instagramAccountId: account.id,
                        postId: null,
                        postUrl: null,
                        postThumb: null,
                        postCaption: "",
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 ${
                      active ? "border-accent bg-accent" : "border-border bg-surface"
                    }`}
                  >
                    <Text
                      className={active ? "text-xs font-medium text-background" : "text-xs text-muted"}
                    >
                      @{account.username}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">When someone comments on</Text>
          <View className="gap-2">
            {SCOPES.map((scope) => {
              const checked = draft.triggerScope === scope.value;
              return (
                <Pressable
                  key={scope.value}
                  onPress={() => setFields({ triggerScope: scope.value })}
                  className={`flex-row items-center gap-3 rounded-lg border px-3 py-3 ${
                    checked ? "border-accent bg-accent/5" : "border-border"
                  }`}
                >
                  <View
                    className={`h-4 w-4 items-center justify-center rounded-full border ${
                      checked ? "border-accent" : "border-muted"
                    }`}
                  >
                    {checked ? <View className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </View>
                  <Text className="flex-1 text-sm text-foreground">{scope.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {draft.triggerScope === "specific" ? (
            <Pressable
              onPress={() => router.push("/campaigns/new/post-picker")}
              className="mt-1 flex-row items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              {draft.postThumb ? (
                <Image source={{ uri: draft.postThumb }} className="h-14 w-14 rounded-md" />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-md bg-surface-hover">
                  <Text className="text-xs text-muted">None</Text>
                </View>
              )}
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {draft.postId ? "Post selected" : "Choose a post"}
                </Text>
                {draft.postCaption ? (
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {draft.postCaption}
                  </Text>
                ) : (
                  <Text className="text-xs text-muted">Tap to browse your posts</Text>
                )}
              </View>
              <Text className="text-accent">›</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <WizardFooter
        step={1}
        error={error}
        onBack={() => router.back()}
        backLabel="Cancel"
        onNext={handleNext}
      />
    </View>
  );
}
