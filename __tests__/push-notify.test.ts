/**
 * enqueuePush digest throttling — a viral reel can drive up to 750 DM
 * sends/hour (Meta's private-reply cap), which would otherwise mean up to
 * 750 pushes/hour per workspace. The first 3 events in a 10-minute bucket
 * are pushed individually; the 4th+ collapse into one deterministic-jobId
 * delayed digest job for that bucket.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIncr, mockExpire, mockAdd } = vi.hoisted(() => ({
  mockIncr: vi.fn(),
  mockExpire: vi.fn(),
  mockAdd: vi.fn(),
}));

vi.mock("@/lib/queue/client", () => ({
  getRedisConnection: () => ({ incr: mockIncr, expire: mockExpire }),
  getPushQueue: () => ({ add: mockAdd }),
}));

import { enqueuePush, pushCountKey } from "../lib/push/notify";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueuePush — digest threshold", () => {
  it("sends the first 3 events in a bucket individually", async () => {
    mockIncr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    for (let i = 0; i < 3; i++) {
      await enqueuePush({
        kind: "new_lead",
        workspaceId: "ws_1",
        title: "New lead",
        body: "body",
      });
    }

    expect(mockAdd).toHaveBeenCalledTimes(3);
    for (const call of mockAdd.mock.calls) {
      expect(call[0]).toBe("push");
      expect(call[1]).toMatchObject({ mode: "individual", kind: "new_lead" });
      expect(call[2]).toBeUndefined(); // no delay/jobId for individual sends
    }
  });

  it("collapses the 4th+ event into one delayed digest job with a deterministic jobId", async () => {
    mockIncr.mockResolvedValueOnce(4).mockResolvedValueOnce(5);

    await enqueuePush({
      kind: "new_lead",
      workspaceId: "ws_1",
      title: "t",
      body: "b",
    });
    await enqueuePush({
      kind: "new_lead",
      workspaceId: "ws_1",
      title: "t",
      body: "b",
    });

    expect(mockAdd).toHaveBeenCalledTimes(2);
    const [name1, data1, opts1] = mockAdd.mock.calls[0];
    const [name2, data2, opts2] = mockAdd.mock.calls[1];

    expect(name1).toBe("push-digest");
    expect(name2).toBe("push-digest");
    expect(data1).toMatchObject({ mode: "digest", kind: "new_lead" });
    expect(data2).toMatchObject({ mode: "digest", kind: "new_lead" });
    // Same bucket -> same jobId, so BullMQ dedupes repeat calls into one job.
    expect(opts1.jobId).toBe(opts2.jobId);
    expect(opts1.delay).toEqual(expect.any(Number));
  });

  it("only expires the counter key on the first increment in a bucket", async () => {
    mockIncr.mockResolvedValueOnce(1);
    await enqueuePush({
      kind: "send_failure",
      workspaceId: "ws_1",
      title: "t",
      body: "b",
    });
    expect(mockExpire).toHaveBeenCalledTimes(1);

    mockIncr.mockResolvedValueOnce(2);
    await enqueuePush({
      kind: "send_failure",
      workspaceId: "ws_1",
      title: "t",
      body: "b",
    });
    expect(mockExpire).toHaveBeenCalledTimes(1);
  });

  it("keeps buckets separate per workspace and kind", async () => {
    mockIncr.mockResolvedValueOnce(1);
    await enqueuePush({
      kind: "new_lead",
      workspaceId: "ws_1",
      title: "t",
      body: "b",
    });

    mockIncr.mockResolvedValueOnce(1);
    await enqueuePush({
      kind: "send_failure",
      workspaceId: "ws_1",
      title: "t",
      body: "b",
    });

    expect(mockIncr.mock.calls[0][0]).not.toBe(mockIncr.mock.calls[1][0]);
  });
});

describe("enqueuePush — payload shape per kind", () => {
  it("carries workspaceId, title, body and data for new_lead", async () => {
    mockIncr.mockResolvedValueOnce(1);
    await enqueuePush({
      kind: "new_lead",
      workspaceId: "ws_1",
      title: "New lead",
      body: "Someone got a DM",
      data: { deepLink: "/logs?highlight=log_1" },
    });

    expect(mockAdd).toHaveBeenCalledWith(
      "push",
      expect.objectContaining({
        mode: "individual",
        kind: "new_lead",
        workspaceId: "ws_1",
        title: "New lead",
        body: "Someone got a DM",
        data: { deepLink: "/logs?highlight=log_1" },
      })
    );
  });

  it("carries targetRole: OWNER and a null workspaceId for worker_failure with no traceable workspace", async () => {
    mockIncr.mockResolvedValueOnce(1);
    await enqueuePush({
      kind: "worker_failure",
      workspaceId: null,
      targetRole: "OWNER",
      title: "Worker error",
      body: "The DM worker hit an error and needs attention.",
    });

    expect(mockAdd).toHaveBeenCalledWith(
      "push",
      expect.objectContaining({
        mode: "individual",
        kind: "worker_failure",
        workspaceId: null,
        targetRole: "OWNER",
      })
    );
  });
});

describe("pushCountKey", () => {
  it("namespaces by workspace, kind, and bucket", () => {
    expect(pushCountKey("ws_1", "new_lead", "100")).toBe(
      "push:count:ws_1:new_lead:100"
    );
  });

  it("defaults to 'global' when there is no workspace", () => {
    expect(pushCountKey(null, "worker_failure", "100")).toBe(
      "push:count:global:worker_failure:100"
    );
  });
});
