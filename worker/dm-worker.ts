import "./load-env";
import { createDMWorker } from "@/lib/queue/dm-worker";
import { createPushWorker } from "@/lib/queue/push-worker";
import { recordWorkerHeartbeat } from "@/lib/ops/worker-health";
import { reconcileComments } from "@/lib/polling/comment-reconciler";
import os from "node:os";
import { attachNextPosts } from "@/lib/polling/next-post";

const worker = createDMWorker();
const pushWorker = createPushWorker();
const startedAt = new Date().toISOString();
const HEARTBEAT_INTERVAL_MS = 30_000;
// Polling safety net for comments that webhooks miss. Runs in the worker because
// it must fire every few minutes and Vercel's free crons only run once a day.
const POLL_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_INTERVAL_MS ?? 5 * 60_000
);

console.log("[DM Worker] Started");

async function heartbeat() {
  try {
    await recordWorkerHeartbeat({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Heartbeat failed:", message);
  }
}

void heartbeat();
const heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

let pollRunning = false;
async function poll() {
  if (pollRunning) return;
  pollRunning = true;
  try {
    await attachNextPosts();
    await reconcileComments();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Comment reconciliation failed:", message);
  } finally {
    pollRunning = false;
  }
}

// Check new posts every minute; catch early comments immediately after binding.
let attachmentRunning = false;
async function attach() {
  if (attachmentRunning || pollRunning) return;
  attachmentRunning = true;
  try {
    const result = await attachNextPosts();
    if (result.bound > 0) await poll();
  } catch (error) {
    console.error("[DM Worker] Next-post check failed:", error);
  } finally {
    attachmentRunning = false;
  }
}
const attachmentTimer = setInterval(() => void attach(), 60_000);
const startupTimer = setTimeout(() => void poll(), 1_000);
const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`[DM Worker] ${signal} received, closing worker`);
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  clearInterval(attachmentTimer);
  clearTimeout(startupTimer);
  await worker.close();
  await pushWorker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
