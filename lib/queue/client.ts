/**
 * BullMQ Queue Client
 *
 * Provides the DM processing queue and Redis connection for BullMQ.
 */

import { Queue } from "bullmq";
import Redis from "ioredis";

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return connection;
}

// ─── DM Queue ───────────────────────────────────────────────────────────────────

export type CommentSource = "WEBHOOK" | "POLLING";

export interface ProcessCommentJob {
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  requeueAttempt?: number;
  burstRequeueAttempt?: number;
  // Unix seconds. Optional so existing/older enqueued jobs and any caller
  // that doesn't have it degrade gracefully — the worker's age check is
  // simply skipped when this is absent, never treated as "instantly stale".
  commentTimestamp?: number;
  // Which path enqueued this comment. Recorded in the shared ProcessedComment
  // dedup store so the reconciler can tell webhook- from polling-caught comments.
  source?: CommentSource;
}

// Delivered when a user taps an opening DM's button — carries the reveal target.
export interface ProcessPostbackJob {
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
  fallback?: boolean;
}

export type DmQueueJob = ProcessCommentJob | ProcessPostbackJob;

export const POSTBACK_JOB_NAME = "process-postback";

let dmQueue: Queue<DmQueueJob> | null = null;

export function getDMQueue(): Queue<DmQueueJob> {
  if (!dmQueue) {
    dmQueue = new Queue<DmQueueJob>("dm-processing", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
        // Clear failed jobs shortly after they exhaust retries. Job ids are
        // deterministic (comment_<acct>_<id>), so a retained failed job would
        // block the polling reconciler from ever retrying that comment. Clearing
        // them lets a later sweep re-enqueue and try again once a transient
        // failure (e.g. an Instagram rate-limit window) has passed. Failure
        // detail is still preserved in DmLog.
        removeOnFail: { age: 300, count: 2000 },
        attempts: 3,
        backoff: {
          type: "custom",
        },
      },
    });
  }
  return dmQueue;
}

// ─── Push Notification Queue ───────────────────────────────────────────────

export type PushKind =
  | "new_lead"
  | "send_failure"
  | "worker_failure"
  | "token_expiring";

interface BasePushJob {
  kind: PushKind;
  // null for a worker_failure whose Instagram account couldn't be traced back
  // to a workspace — the job resolves to zero targets and is a no-op.
  workspaceId: string | null;
  // Restricts targeting to a single WorkspaceMember role (e.g. "OWNER" for
  // worker_failure). Omitted means "every member with the relevant
  // preference enabled".
  targetRole?: "OWNER";
}

// A single push, sent as-is (the first few events in a 10-minute bucket).
export interface IndividualPushJob extends BasePushJob {
  mode: "individual";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// A collapsed notification for a bucket that crossed the digest threshold.
// Carries no canned copy — the worker re-reads the live Redis counter for
// this bucket at fire time and builds the message from the current count.
export interface DigestPushJob extends BasePushJob {
  mode: "digest";
  bucketId: string;
}

export type PushQueueJob = IndividualPushJob | DigestPushJob;

let pushQueue: Queue<PushQueueJob> | null = null;

export function getPushQueue(): Queue<PushQueueJob> {
  if (!pushQueue) {
    pushQueue = new Queue<PushQueueJob>("push-notifications", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // Small, ephemeral payloads on a shared 30MB Redis budget — keep
        // very little history compared to the DM queue.
        removeOnComplete: { count: 200 },
        removeOnFail: { age: 300, count: 200 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return pushQueue;
}
