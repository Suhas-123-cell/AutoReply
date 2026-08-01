/**
 * Push notification digest throttling.
 *
 * A viral reel can drive up to 750 DM sends/hour (Meta's private-reply cap —
 * see lib/utils/rate-limiter.ts), which would otherwise mean up to 750
 * pushes/hour to every workspace member. Instead, events are counted per
 * 10-minute bucket (Redis INCR+EXPIRE, key `push:count:{workspaceId}:{kind}:
 * {bucketId}`): the first 3 events in a bucket are pushed individually: the
 * 4th+ collapse into a single delayed "digest" job (deterministic jobId, so
 * repeated calls in the same bucket are a no-op after the first) that fires
 * at the bucket boundary and re-reads the live counter at that point — so it
 * reports however many events actually landed by the time it runs, not just
 * however many had landed when the 4th event triggered it.
 */

import { getPushQueue, getRedisConnection, type PushKind } from "@/lib/queue/client";

const BUCKET_MS = 10 * 60 * 1000;
const INDIVIDUAL_THRESHOLD = 3;
// Slightly longer than one bucket so a fire-time read that lands just after
// the boundary still finds the counter.
const COUNT_KEY_TTL_SECONDS = 15 * 60;

export interface EnqueuePushInput {
  kind: PushKind;
  workspaceId: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  targetRole?: "OWNER";
}

function bucketIdFor(nowMs: number): string {
  return String(Math.floor(nowMs / BUCKET_MS));
}

export function pushCountKey(
  workspaceId: string | null,
  kind: PushKind,
  bucketId: string
): string {
  return `push:count:${workspaceId ?? "global"}:${kind}:${bucketId}`;
}

export async function enqueuePush(input: EnqueuePushInput): Promise<void> {
  const bucketId = bucketIdFor(Date.now());
  const key = pushCountKey(input.workspaceId, input.kind, bucketId);

  const redis = getRedisConnection();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, COUNT_KEY_TTL_SECONDS);
  }

  if (count <= INDIVIDUAL_THRESHOLD) {
    await getPushQueue().add("push", {
      mode: "individual",
      kind: input.kind,
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body,
      data: input.data,
      targetRole: input.targetRole,
    });
    return;
  }

  const bucketEndMs = (Number(bucketId) + 1) * BUCKET_MS;
  const delay = Math.max(0, bucketEndMs - Date.now());
  const jobId = `digest:${input.workspaceId ?? "global"}:${input.kind}:${bucketId}`;

  await getPushQueue().add(
    "push-digest",
    {
      mode: "digest",
      kind: input.kind,
      workspaceId: input.workspaceId,
      bucketId,
      targetRole: input.targetRole,
    },
    { delay, jobId }
  );
}
