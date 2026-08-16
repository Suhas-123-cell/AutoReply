/**
 * Phone-number OTP codes for the mobile app's sign-in flow.
 *
 * Direct mirror of lib/auth/mobile-codes.ts (email codes) — same reasoning
 * for why this has its own table/secret, same timing-safe compare, same
 * single-use/attempt-limited semantics. See that file's docstring for the
 * full rationale.
 */

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

/** E.164: a leading "+" then 8-15 digits. Rejects anything else outright. */
export function normalizePhone(phone: string): string | null {
  const trimmed = phone.trim().replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null;
}

function hashCode(phone: string, code: string): string {
  return createHmac("sha256", requireEnv("MOBILE_OTP_SECRET"))
    .update(`phone:${phone}:${code}`)
    .digest("hex");
}

export async function issueMobilePhoneAuthCode(
  phone: string,
  requestIp?: string | null
): Promise<{ code: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = hashCode(phone, code);

  await prisma.$transaction([
    prisma.mobilePhoneAuthCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.mobilePhoneAuthCode.create({
      data: {
        phone,
        codeHash,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        requestIp: requestIp ?? null,
      },
    }),
  ]);

  // No SMS provider is wired up — the phone sign-in UI was already removed
  // (see mobile/app/(auth)/sign-in.jsx), so this code is only ever read via
  // MOBILE_OTP_DEV_ECHO, ie the API response below, not a real text message.
  return { code };
}

export type VerifyPhoneCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

export async function verifyMobilePhoneAuthCode(
  phone: string,
  code: string
): Promise<VerifyPhoneCodeResult> {
  const candidate = await prisma.mobilePhoneAuthCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!candidate) return { ok: false, reason: "invalid" };

  if (candidate.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (candidate.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  await prisma.mobilePhoneAuthCode.update({
    where: { id: candidate.id },
    data: { attempts: { increment: 1 } },
  });

  const expected = Buffer.from(hashCode(phone, code));
  const actual = Buffer.from(candidate.codeHash);

  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) return { ok: false, reason: "invalid" };

  const consumed = await prisma.mobilePhoneAuthCode.updateMany({
    where: { id: candidate.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (consumed.count !== 1) return { ok: false, reason: "invalid" };

  return { ok: true };
}
