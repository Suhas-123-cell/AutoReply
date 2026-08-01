import { Text, View } from "react-native";
import { colors } from "./tokens";

// Mirrors the web app's DmStatus enum (app/generated/prisma/client).
const STATUS_MAP = {
  PENDING: { label: "Pending", color: colors.warning },
  SENT: { label: "Sent", color: colors.success },
  FAILED: { label: "Failed", color: colors.error },
  SKIPPED_DEDUP: { label: "Skipped · duplicate", color: colors.muted },
  SKIPPED_RATE_LIMIT: { label: "Skipped · rate limit", color: colors.muted },
  SKIPPED_PLAN_LIMIT: { label: "Skipped · plan limit", color: colors.muted },
  SKIPPED_NO_MATCH: { label: "Skipped · no match", color: colors.muted },
};

export default function StatusBadge({ status }) {
  const entry = STATUS_MAP[status] ?? { label: status ?? "Unknown", color: colors.muted };
  return (
    <View
      style={{ borderColor: entry.color }}
      className="shrink-0 rounded-full border px-2 py-0.5"
    >
      <Text style={{ color: entry.color }} className="text-xs font-medium">
        {entry.label}
      </Text>
    </View>
  );
}
