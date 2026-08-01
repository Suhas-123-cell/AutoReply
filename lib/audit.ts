/**
 * Audit trail for destructive, hard-to-undo actions (disconnecting an
 * Instagram account, deleting a campaign, removing a workspace member).
 * Reuses the existing OperationalEvent table (source: SYSTEM, level: INFO)
 * rather than adding a new model — it already has the right shape
 * (workspaceId, message, payload, createdAt) and is already surfaced in the
 * diagnostics screen.
 */

import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";

export async function logAuditEvent(
  workspaceId: string | null,
  message: string,
  payload?: Prisma.InputJsonValue
): Promise<void> {
  // Never let an audit-log failure block the action it's describing.
  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: "INFO",
        workspaceId,
        message,
        payload: payload ?? undefined,
      },
    })
    .catch((error) => {
      console.error("[Audit] Failed to log event:", message, error);
    });
}
