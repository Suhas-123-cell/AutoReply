import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import InAppBrowser from "react-native-inappbrowser-reborn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { canManageBilling } from "../../../src/lib/workspace-access";
import Card from "../../../src/ui/Card";
import Skeleton from "../../../src/ui/Skeleton";
import { colors } from "../../../src/ui/tokens";

// Self-hosted deployments (no STRIPE_SECRET_KEY set server-side) get exactly
// the original "no plan limits" card and nothing else — /api/billing/status
// returns { configured: false } and none of the plan/upgrade UI below
// renders. This screen only grows once billing is actually turned on.
async function openInAppBrowser(url) {
  if (await InAppBrowser.isAvailable()) {
    await InAppBrowser.open(url, { ephemeralWebSession: false });
  } else {
    await InAppBrowser.open(url);
  }
}

function PlanCard({ plan, isCurrent, canManage, onUpgrade, upgrading }) {
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-semibold text-foreground">{plan.name}</Text>
          <Text className="mt-0.5 text-xs text-muted">
            {plan.priceUsd === 0
              ? `${plan.monthlyDmLimit.toLocaleString()} DMs / month · `
              : "Unlimited DMs · "}
            {plan.maxConnectedAccounts} account{plan.maxConnectedAccounts === 1 ? "" : "s"}
          </Text>
        </View>
        <Text className="text-lg font-semibold text-foreground">
          {plan.priceUsd === 0 ? "Free" : `$${plan.priceUsd}/mo`}
        </Text>
      </View>
      {isCurrent ? (
        <View className="mt-3 self-start rounded-full border border-accent px-3 py-1">
          <Text className="text-xs font-medium text-accent">Current plan</Text>
        </View>
      ) : plan.priceUsd > 0 && canManage ? (
        <Pressable
          onPress={() => onUpgrade(plan.id)}
          disabled={upgrading}
          className={`mt-3 rounded-lg px-4 py-2.5 ${upgrading ? "bg-accent-hover opacity-60" : "bg-accent"}`}
        >
          <Text className="text-center text-sm font-semibold text-background">
            {upgrading ? "Opening..." : "Upgrade"}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export default function UsageScreen() {
  const { role } = useAuth();
  const canManage = canManageBilling(role);
  const queryClient = useQueryClient();
  const [pendingPlan, setPendingPlan] = useState(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const {
    data: billing,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => apiFetch("/api/billing/status"),
  });

  const checkout = useMutation({
    mutationFn: (plan) => apiFetch("/api/billing/checkout", { method: "POST", body: { plan } }),
    onMutate: (plan) => setPendingPlan(plan),
    onSuccess: async (data) => {
      await openInAppBrowser(data.url);
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
    onError: (err) => {
      Alert.alert(
        "Couldn't start checkout",
        err instanceof ApiError ? err.message : "Please try again."
      );
    },
    onSettled: () => setPendingPlan(null),
  });

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const data = await apiFetch("/api/billing/portal", { method: "POST" });
      await openInAppBrowser(data.url);
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    } catch (err) {
      Alert.alert(
        "Couldn't open billing portal",
        err instanceof ApiError ? err.message : "Please try again."
      );
    } finally {
      setOpeningPortal(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-20" />
      </View>
    );
  }

  const refreshControl = (
    <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
  );

  if (!billing?.configured) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={refreshControl}
      >
        <Card>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-medium text-foreground">DMs sent this month</Text>
              <Text className="mt-0.5 text-xs text-muted">Self-hosted — no plan limits.</Text>
            </View>
            <Text className="text-lg font-semibold text-foreground">
              {billing?.usage?.sent ?? 0}
            </Text>
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={refreshControl}
    >
      <Card>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-medium text-foreground">{billing.planName} plan</Text>
            {billing.planStatus && billing.planStatus !== "active" ? (
              <Text className="mt-0.5 text-xs text-warning">{billing.planStatus}</Text>
            ) : null}
          </View>
          <Text className="text-lg font-semibold text-foreground">
            {billing.accounts.connected} / {billing.accounts.limit} accounts
          </Text>
        </View>
        <Text className="mt-2 text-xs text-muted">
          {billing.usage.sent.toLocaleString()}
          {billing.plan === "free" ? ` / ${billing.usage.limit.toLocaleString()}` : ""} DMs sent
          this month
        </Text>
      </Card>

      <Text className="text-sm font-semibold text-foreground">Plans</Text>
      {billing.plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          isCurrent={plan.id === billing.plan}
          canManage={canManage}
          onUpgrade={(planId) => checkout.mutate(planId)}
          upgrading={pendingPlan === plan.id}
        />
      ))}

      {canManage && billing.hasBillingAccount ? (
        <Pressable
          onPress={openPortal}
          disabled={openingPortal}
          className={`rounded-lg border border-border px-4 py-3 ${openingPortal ? "opacity-60" : ""}`}
        >
          <Text className="text-center text-sm font-medium text-foreground">
            {openingPortal ? "Opening..." : "Manage billing"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
