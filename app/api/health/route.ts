import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";

export const runtime = "nodejs";
// Health must reflect live state (worker heartbeat, queue depth), never a
// cached response, or it reports stale worker start times.
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

interface HealthCheck {
  status: CheckStatus;
}

// This endpoint is deliberately unauthenticated — it's what a load
// balancer / uptime monitor hits, and requiring a secret would defeat that.
// Because of that, its response must never carry anything beyond a per-check
// ok/error verdict: no raw error text, no hostnames/pids, no queue depth.
// Full diagnostics (including this same data with real detail) already
// exist at /api/admin/diagnostics, which requires ADMIN/OWNER auth.
async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (error) {
    console.error("[Health] Database check failed:", error);
    return { status: "error" };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  try {
    const pong = await getRedisConnection().ping();
    return { status: pong === "PONG" ? "ok" : "error" };
  } catch (error) {
    console.error("[Health] Redis check failed:", error);
    return { status: "error" };
  }
}

async function checkQueue(): Promise<HealthCheck> {
  try {
    await getDMQueue().getJobCounts("waiting", "active", "delayed", "failed");
    return { status: "ok" };
  } catch (error) {
    console.error("[Health] Queue check failed:", error);
    return { status: "error" };
  }
}

async function checkWorker(): Promise<HealthCheck> {
  try {
    const worker = await getWorkerHealth();
    return { status: worker.healthy ? "ok" : "error" };
  } catch (error) {
    console.error("[Health] Worker check failed:", error);
    return { status: "error" };
  }
}

export async function GET() {
  const [database, redis, queue, worker] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueue(),
    checkWorker(),
  ]);

  const healthy =
    database.status === "ok" &&
    redis.status === "ok" &&
    queue.status === "ok" &&
    worker.status === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: {
        database,
        redis,
        queue,
        worker,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
