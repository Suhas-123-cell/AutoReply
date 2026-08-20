/**
 * Rate Limiter — Unit Tests
 *
 * Tests the hourly private-reply cap enforcement using mocked Redis.
 * Assertions derive from RATE_LIMIT_MAX so they survive a change to the cap.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockEval, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockEval: vi.fn(),
  mockDel: vi.fn(),
}));

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (
    this: Record<string, unknown>
  ) {
    this.get = mockGet;
    this.eval = mockEval;
    this.del = mockDel;
    return this;
  });
  return { default: MockRedis };
});

vi.stubEnv("REDIS_URL", "redis://localhost:6379");

import {
  checkRateLimit,
  incrementDMCounter,
  reserveDMSlot,
  RATE_LIMIT_MAX,
} from "../lib/utils/rate-limiter";

const OVER_HOURLY_CAP: [string, string, string] = ["0", String(RATE_LIMIT_MAX), "0"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("should allow when count is below limit", async () => {
    mockGet.mockResolvedValue("50");

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(50);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX - 50);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(false);
    expect(result.reserved).toBe(false);
  });

  it("should allow when no previous count exists", async () => {
    mockGet.mockResolvedValue(null);

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(0);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX);
  });

  it("should deny when count reaches the limit", async () => {
    mockGet.mockResolvedValue(String(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("never gives up on an hourly-cap block, no matter how many prior attempts", async () => {
    // A block from this cap always clears within the hour, so there is no
    // attempt ceiling — see the module docstring for why an earlier version's
    // 3-attempt cap silently dropped DMs during a large comment burst.
    mockGet.mockResolvedValue(String(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });
});

describe("reserveDMSlot", () => {
  // reserveDMSlot now checks a short-window burst cap (eval call #1) before
  // the hourly cap (eval call #2) — see lib/utils/rate-limiter.ts. Every
  // test below mocks the burst check as passing first, so it's actually
  // exercising the hourly-cap behavior it names, not silently short-circuiting
  // on the burst check instead.
  const BURST_ALLOWED: [number, number, number] = [1, 1, 1];

  it("should atomically reserve a slot when below the hourly cap", async () => {
    mockEval
      .mockResolvedValueOnce(BURST_ALLOWED)
      .mockResolvedValueOnce([1, 51, 139]);

    const result = await reserveDMSlot("account_123");

    expect(mockEval).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      1,
      "rate:dm:account_123",
      RATE_LIMIT_MAX,
      3600
    );
    expect(result.allowed).toBe(true);
    expect(result.reserved).toBe(true);
    expect(result.currentCount).toBe(51);
    expect(result.remainingDMs).toBe(139);
  });

  it("should recommend requeue when the atomic reserve is denied", async () => {
    mockEval
      .mockResolvedValueOnce(BURST_ALLOWED)
      .mockResolvedValueOnce([0, RATE_LIMIT_MAX, 0]);

    const result = await reserveDMSlot("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.reserved).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("never gives up on an hourly-cap block, regardless of prior attempts", async () => {
    mockEval
      .mockResolvedValueOnce(BURST_ALLOWED)
      .mockResolvedValueOnce(OVER_HOURLY_CAP);

    // reserveDMSlot no longer takes a requeueAttempt param at all (there's
    // nothing left for it to gate) — an hourly-cap block always requeues
    // instead of ever giving up, since the window clears on its own.
    const result = await reserveDMSlot("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
    expect(result.requeueDelayMs).toBeGreaterThan(0);
  });

  it("requeues quickly, without touching the hourly slot, when only the burst cap is hit", async () => {
    mockEval.mockResolvedValueOnce([0, 2, 0]);

    const result = await reserveDMSlot("account_123", 0);

    expect(mockEval).toHaveBeenCalledTimes(1);
    expect(result.allowed).toBe(false);
    expect(result.reserved).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
    expect(result.requeueDelayMs).toBeLessThan(3600 * 1000);
  });
});

describe("incrementDMCounter", () => {
  it("should use the atomic reservation path", async () => {
    mockEval
      .mockResolvedValueOnce([1, 1, 1])
      .mockResolvedValueOnce([1, 51, 139]);

    const count = await incrementDMCounter("account_123");

    expect(mockEval).toHaveBeenCalled();
    expect(count).toBe(51);
  });
});
