import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import { getWorkerAlerts, getWorkerHealth } from "@/lib/ops/worker-health";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const runtime = "nodejs";

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can view diagnostics" },
      { status: 403 }
    );
  }
  const workspaceId = context.workspaceId;
  const instagramIds = new Set(
    (
      await prisma.instagramAccount.findMany({
        where: { workspaceId },
        select: { instagramId: true },
      })
    ).map((account) => account.instagramId)
  );

  const [
    queueCounts,
    workerHealth,
    workerAlerts,
    webhookFailures,
    dmFailures,
    tokenRefreshFailures,
    operationalEvents,
  ] = await Promise.all([
    getDMQueue().getJobCounts("waiting", "active", "delayed", "failed"),
    getWorkerHealth(),
    // Alerts are recorded process-wide; fetch the full ring buffer and keep
    // only this workspace's accounts.
    getWorkerAlerts(25),
    prisma.webhookEvent.findMany({
      where: { workspaceId, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        object: true,
        errorMessage: true,
        createdAt: true,
        processedAt: true,
      },
    }),
    prisma.dmLog.findMany({
      where: {
        workspaceId,
        status: {
          in: [
            "FAILED",
            "SKIPPED_RATE_LIMIT",
            "SKIPPED_PLAN_LIMIT",
            "SKIPPED_NO_MATCH",
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        commentId: true,
        commentText: true,
        errorMessage: true,
        updatedAt: true,
        automation: { select: { name: true } },
      },
    }),
    prisma.operationalEvent.findMany({
      where: { workspaceId, source: "TOKEN_REFRESH", level: "ERROR" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        message: true,
        createdAt: true,
        payload: true,
      },
    }),
    prisma.operationalEvent.findMany({
      where: {
        // Events without a workspace are platform-wide (other tenants' worker
        // errors, unauthenticated webhook attempts) and never shown here.
        workspaceId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        source: true,
        level: true,
        message: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      // Aggregate counts only — no tenant data.
      queueCounts,
      // The heartbeat's pid and hostname describe shared infrastructure.
      workerHealth: {
        healthy: workerHealth.healthy,
        ageMs: workerHealth.ageMs,
        heartbeat: workerHealth.heartbeat
          ? {
              checkedAt: workerHealth.heartbeat.checkedAt,
              startedAt: workerHealth.heartbeat.startedAt,
            }
          : null,
      },
      workerAlerts: workerAlerts
        .filter(
          (alert) =>
            alert.instagramAccountId && instagramIds.has(alert.instagramAccountId)
        )
        .slice(0, 10),
      webhookFailures,
      dmFailures,
      tokenRefreshFailures,
      operationalEvents,
    },
  });
}
