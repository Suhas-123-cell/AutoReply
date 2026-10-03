import { describe, expect, it, vi } from "vitest";

const deletes = vi.hoisted(() => ({
  webhook: vi.fn(),
  email: vi.fn(),
  phone: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    webhookEvent: { deleteMany: deletes.webhook },
    mobileAuthCode: { deleteMany: deletes.email },
    mobilePhoneAuthCode: { deleteMany: deletes.phone },
  },
}));
vi.mock("@/lib/meta/oauth", () => ({}));
vi.mock("@/lib/meta/client", () => ({}));
vi.mock("@/lib/push/notify", () => ({}));

import { pruneOldEvents } from "../app/api/cron/refresh-tokens/route";

describe("daily retention", () => {
  it("deletes old webhook payloads and consumed or expired auth codes", async () => {
    deletes.webhook.mockResolvedValue({ count: 1 });
    deletes.email.mockResolvedValue({ count: 2 });
    deletes.phone.mockResolvedValue({ count: 3 });

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
    expect(deletes.phone).toHaveBeenCalledWith(authCodeWhere);
  });
});
