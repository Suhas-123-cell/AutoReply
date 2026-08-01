import { Worker, type Job } from "bullmq";
import {
  getRedisConnection,
  type PushKind,
  type PushQueueJob,
} from "./client";
import { pushCountKey } from "@/lib/push/notify";
import { prisma } from "@/lib/db/client";
import { sendExpoPushNotifications, type ExpoPushMessage } from "@/lib/push/expo";

// new_lead/send_failure are gated by the matching PushDevice preference flag;
// worker_failure and token_expiring have no dedicated flag, so any
// non-disabled device for a targeted member receives them.
const PREFERENCE_FIELD: Record<PushKind, "leadAlerts" | "failureAlerts" | null> = {
  new_lead: "leadAlerts",
  send_failure: "failureAlerts",
  worker_failure: null,
  token_expiring: null,
};

const DIGEST_LABEL: Record<PushKind, string> = {
  new_lead: "new leads",
  send_failure: "DM send failures",
  worker_failure: "worker errors",
  token_expiring: "Instagram connections needing attention",
};

async function resolveTargetDevices(
  workspaceId: string | null,
  kind: PushKind,
  targetRole?: "OWNER"
): Promise<{ expoPushToken: string }[]> {
  if (!workspaceId) return [];

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      ...(targetRole ? { role: targetRole } : {}),
    },
    select: { userId: true },
  });
  if (members.length === 0) return [];

  const preferenceField = PREFERENCE_FIELD[kind];

  return prisma.pushDevice.findMany({
    where: {
      userId: { in: members.map((m) => m.userId) },
      disabledAt: null,
      ...(preferenceField ? { [preferenceField]: true } : {}),
    },
    select: { expoPushToken: true },
  });
}

async function processPush(job: Job<PushQueueJob>): Promise<void> {
  const data = job.data;
  const devices = await resolveTargetDevices(
    data.workspaceId,
    data.kind,
    data.targetRole
  );
  if (devices.length === 0) return;

  let title: string;
  let body: string;
  let payloadData: Record<string, unknown> | undefined;

  if (data.mode === "individual") {
    title = data.title;
    body = data.body;
    payloadData = data.data;
  } else {
    const key = pushCountKey(data.workspaceId, data.kind, data.bucketId);
    const countRaw = await getRedisConnection().get(key);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (count === 0) return;

    title = "OpenReply";
    body = `${count} ${DIGEST_LABEL[data.kind]} in the last 10 minutes`;
    payloadData = { kind: data.kind };
  }

  const messages: ExpoPushMessage[] = devices.map((device) => ({
    to: device.expoPushToken,
    title,
    body,
    data: payloadData,
  }));

  const tickets = await sendExpoPushNotifications(messages);

  const staleTokens = tickets
    .filter(
      (ticket) =>
        ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
    )
    .map((ticket) => ticket.to);

  if (staleTokens.length > 0) {
    await prisma.pushDevice.updateMany({
      where: { expoPushToken: { in: staleTokens } },
      data: { disabledAt: new Date() },
    });
  }
}

export function createPushWorker(): Worker<PushQueueJob> {
  const worker = new Worker<PushQueueJob>("push-notifications", processPush, {
    connection: getRedisConnection(),
    concurrency: 5,
  });

  worker.on("failed", (job, err) => {
    console.error(`[Push Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Push Worker] Worker error:", err.message);
  });

  return worker;
}
