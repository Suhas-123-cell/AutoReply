import { describe, expect, it, vi } from "vitest";

const deletes = vi.hoisted(() => ({
  webhook: vi.fn(),
  email: vi.fn(),
  operational: vi.fn(),
  telegram: vi.fn(),
  sessionMeta: vi.fn(),
  session: vi.fn(),
  sessionFind: vi.fn(),
  claims: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    webhookEvent: { deleteMany: deletes.webhook },
    mobileAuthCode: { deleteMany: deletes.email },
    operationalEvent: { deleteMany: deletes.operational },
    telegramMessageLog: { deleteMany: deletes.telegram },
    mobileSessionMeta: { deleteMany: deletes.sessionMeta },
    session: { findMany: deletes.sessionFind, deleteMany: deletes.session },
    identityUsageClaim: { deleteMany: deletes.claims },
  },
}));
vi.mock("@/lib/meta/oauth", () => ({}));
vi.mock("@/lib/meta/client", () => ({}));
vi.mock("@/lib/push/notify", () => ({}));

import { pruneOldEvents } from "../app/api/cron/refresh-tokens/route";

describe("daily retention", () => {
  it("deletes old webhook payloads and consumed or expired email codes", async () => {
    deletes.webhook.mockResolvedValue({ count: 1 });
    deletes.sessionFind.mockResolvedValue([{ id: "session_old" }]);
    deletes.email.mockResolvedValue({ count: 2 });

    await pruneOldEvents(new Date("2026-10-03T12:00:00.000Z"));

    expect(deletes.webhook).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-09-03T12:00:00.000Z") } },
    });
    const authCodeWhere = {
      where: { OR: [
        { consumedAt: { lt: new Date("2026-10-02T12:00:00.000Z") } },
        { expiresAt: { lt: new Date("2026-10-02T12:00:00.000Z") } },
      ] },
    };
    expect(deletes.email).toHaveBeenCalledWith(authCodeWhere);
  
    expect(deletes.operational).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-07-05T12:00:00.000Z") } },
    });
    expect(deletes.telegram).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: "SKIPPED_NO_MATCH" },
          { createdAt: { lt: new Date("2026-07-05T12:00:00.000Z") } },
        ],
      },
    });
    expect(deletes.sessionMeta).toHaveBeenCalledWith({
      where: { sessionId: { in: ["session_old"] } },
    });
    expect(deletes.session).toHaveBeenCalledWith({
      where: { id: { in: ["session_old"] } },
    });
    expect(deletes.claims).toHaveBeenCalledWith({
      where: { usagePeriodStart: { lt: new Date("2026-10-01T00:00:00.000Z") } },
    });
  });
});
