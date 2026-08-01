import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../src/api/client";
import Card from "../../../src/ui/Card";
import EmptyState from "../../../src/ui/EmptyState";
import Skeleton from "../../../src/ui/Skeleton";
import { colors } from "../../../src/ui/tokens";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function SectionTitle({ children }) {
  return <Text className="mb-2 text-sm font-semibold text-foreground">{children}</Text>;
}

function Row({ title, subtitle, meta, tone = "muted" }) {
  const toneColor = { muted: colors.muted, error: colors.error, warning: colors.warning }[tone];
  return (
    <View className="border-b border-border py-2 last:border-0">
      <Text className="text-sm text-foreground" numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-0.5 text-xs" style={{ color: toneColor }} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
      {meta ? <Text className="mt-0.5 text-[10px] text-muted">{meta}</Text> : null}
    </View>
  );
}

// Ops/internal screen — this is a secondary, "advanced" view, not a primary
// user-facing dashboard, so it's straightforward list/card rendering with no
// chart, matching app/api/admin/diagnostics's shape one-to-one.
export default function DiagnosticsScreen() {
  const {
    data,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => apiFetch("/api/admin/diagnostics"),
  });

  if (isLoading) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background p-4">
        <EmptyState title="Couldn't load diagnostics" subtitle={error.message ?? "Please try again."} />
      </View>
    );
  }

  const {
    queueCounts,
    workerHealth,
    workerAlerts = [],
    webhookFailures = [],
    dmFailures = [],
    tokenRefreshFailures = [],
    operationalEvents = [],
  } = data ?? {};

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
      }
    >
      <Card>
        <SectionTitle>Queue</SectionTitle>
        <View className="flex-row flex-wrap gap-3">
          {["waiting", "active", "delayed", "failed"].map((key) => (
            <View key={key} className="min-w-[22%] flex-1">
              <Text className="text-lg font-bold text-foreground">{queueCounts?.[key] ?? 0}</Text>
              <Text className="text-xs capitalize text-muted">{key}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>Worker health</SectionTitle>
        <View className="flex-row items-center gap-2">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: workerHealth?.healthy ? colors.success : colors.error }}
          />
          <Text className="text-sm text-foreground">
            {workerHealth?.healthy ? "Healthy" : "Unhealthy / no heartbeat"}
          </Text>
        </View>
        {workerHealth?.heartbeat ? (
          <Text className="mt-1 text-xs text-muted">
            PID {workerHealth.heartbeat.pid}
            {workerHealth.heartbeat.hostname ? ` on ${workerHealth.heartbeat.hostname}` : ""} · last
            seen {formatDate(workerHealth.heartbeat.checkedAt)}
          </Text>
        ) : (
          <Text className="mt-1 text-xs text-muted">No heartbeat recorded.</Text>
        )}
      </Card>

      <Card>
        <SectionTitle>Recent worker alerts</SectionTitle>
        {workerAlerts.length === 0 ? (
          <EmptyState title="No recent alerts" />
        ) : (
          workerAlerts.map((alert, i) => (
            <Row
              key={`${alert.createdAt}-${i}`}
              title={alert.message}
              tone={alert.level === "error" ? "error" : "warning"}
              meta={formatDate(alert.createdAt)}
            />
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Failed webhook events</SectionTitle>
        {webhookFailures.length === 0 ? (
          <EmptyState title="No failed webhooks" />
        ) : (
          webhookFailures.map((event) => (
            <Row
              key={event.id}
              title={`${event.object} webhook`}
              subtitle={event.errorMessage}
              tone="error"
              meta={`${formatDate(event.createdAt)} → processed ${formatDate(event.processedAt)}`}
            />
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Failed / skipped DMs</SectionTitle>
        {dmFailures.length === 0 ? (
          <EmptyState title="No failed or skipped DMs" />
        ) : (
          dmFailures.map((log) => (
            <Row
              key={log.id}
              title={`${log.status} · ${log.automation?.name ?? "Unknown automation"}`}
              subtitle={log.errorMessage ?? log.commentText}
              tone="error"
              meta={formatDate(log.updatedAt)}
            />
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Token refresh failures</SectionTitle>
        {tokenRefreshFailures.length === 0 ? (
          <EmptyState title="No token refresh failures" />
        ) : (
          tokenRefreshFailures.map((item) => (
            <Row key={item.id} title={item.message} tone="error" meta={formatDate(item.createdAt)} />
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Operational events</SectionTitle>
        {operationalEvents.length === 0 ? (
          <EmptyState title="No recent events" />
        ) : (
          operationalEvents.map((event) => (
            <Row
              key={event.id}
              title={`${event.source} · ${event.message}`}
              tone={event.level === "ERROR" ? "error" : event.level === "WARNING" ? "warning" : "muted"}
              meta={`${formatDate(event.createdAt)}${event.resolvedAt ? ` · resolved ${formatDate(event.resolvedAt)}` : ""}`}
            />
          ))
        )}
      </Card>
    </ScrollView>
  );
}
