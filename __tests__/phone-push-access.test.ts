import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushQueueJob } from "@/lib/queue/client";

type PushProcessor = (job: { data: PushQueueJob }) => Promise<void>;

const mocks = vi.hoisted(() => ({
  processor: null as PushProcessor | null,
  findMembers: vi.fn(),
  findDevices: vi.fn(),
  updateDevices: vi.fn(),
  sendPush: vi.fn(),
  redisGet: vi.fn(),
  workerOn: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(_queueName: string, processor: PushProcessor) {
      mocks.processor = processor;
    }
    on = mocks.workerOn;
  },
}));
vi.mock("@/lib/queue/client", () => ({
  getRedisConnection: () => ({ get: mocks.redisGet }),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    workspaceMember: { findMany: mocks.findMembers },
    pushDevice: { findMany: mocks.findDevices, updateMany: mocks.updateDevices },
  },
}));
vi.mock("@/lib/push/fcm", () => ({ sendFcmPushNotifications: mocks.sendPush }));

import { createPushWorker } from "@/lib/queue/push-worker";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMembers.mockResolvedValue([{ userId: "member_1" }]);
  mocks.findDevices.mockResolvedValue([]);
  mocks.sendPush.mockResolvedValue([]);
  createPushWorker();
});

async function processPush(data: PushQueueJob) {
  if (!mocks.processor) throw new Error("Worker processor was not registered");
  await mocks.processor({ data });
}

describe("phone verification for push recipients", () => {
  it("excludes unverified users' existing devices before delivering lead activity", async () => {
    await processPush({
      mode: "individual", kind: "new_lead", workspaceId: "workspace_1",
      title: "New lead", body: "Someone received a DM", data: { logId: "log_1" },
    });

    expect(mocks.findDevices).toHaveBeenCalledWith({
      where: {
        userId: { in: ["member_1"] },
        user: { phone: { not: null }, phoneVerified: { not: null } },
        disabledAt: null,
        leadAlerts: true,
      },
      select: { fcmToken: true },
    });
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("suppresses owner digests when no owner device belongs to a verified phone user", async () => {
    await processPush({
      mode: "digest", kind: "token_expiring", workspaceId: "workspace_1",
      targetRole: "OWNER", bucketId: "100",
    });

    expect(mocks.findMembers).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1", role: "OWNER" }, select: { userId: true },
    });
    expect(mocks.findDevices).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user: { phone: { not: null }, phoneVerified: { not: null } },
      }),
    }));
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("continues delivering activity to eligible verified users", async () => {
    mocks.findDevices.mockResolvedValue([{ fcmToken: "verified-device-token" }]);

    await processPush({
      mode: "individual", kind: "send_failure", workspaceId: "workspace_1",
      title: "DM failed", body: "Please check your connection", data: { logId: "log_1" },
    });

    expect(mocks.findDevices).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user: { phone: { not: null }, phoneVerified: { not: null } },
        failureAlerts: true,
      }),
    }));
    expect(mocks.sendPush).toHaveBeenCalledWith([{
      to: "verified-device-token", title: "DM failed", body: "Please check your connection",
      data: { logId: "log_1" },
    }]);
  });
});
