/**
 * Email OTP codes for the mobile app's sign-in flow.
 *
 * Deliberately NOT stored in Auth.js's `VerificationToken` table: that table
 * is validated by an unthrottled Auth.js callback route
 * (`/api/auth/callback/resend`), so a 6-digit code stored there would be
 * brute-forceable in ~1e6 requests against a *web* login endpoint. Uses its
 * own model (MobileAuthCode) and its own secret (MOBILE_OTP_SECRET, distinct
 * from NEXTAUTH_SECRET) so nothing here can ever be replayed against an
 * Auth.js endpoint.
 */

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  return createHmac("sha256", requireEnv("MOBILE_OTP_SECRET"))
    .update(`${email}:${code}`)
    .digest("hex");
}

export async function issueMobileAuthCode(
  email: string,
  requestIp?: string | null
): Promise<{ code: string }> {
  const normalizedEmail = normalizeEmail(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = hashCode(normalizedEmail, code);

  // Invalidate any prior unconsumed codes for this email before issuing a
  // new one, so only the most recent code is ever valid.
  await prisma.$transaction([
    prisma.mobileAuthCode.updateMany({
      where: { email: normalizedEmail, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.mobileAuthCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        requestIp: requestIp ?? null,
      },
    }),
  ]);

  // The code is already valid and stored above — an email delivery failure
  // (a real Resend outage, or no RESEND_API_KEY configured in local dev)
  // must not prevent it from being returned to the caller, since the
  // MOBILE_OTP_DEV_ECHO path depends on getting `code` back even when the
  // send itself fails. Logged, not swallowed.
  try {
    const { sendEmail } = await import("@/lib/email/send");
    await sendEmail({
      to: normalizedEmail,
      subject: `${code} is your AutoReply sign-in code`,
      html: `<p>Your AutoReply sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    });
  } catch (error) {
    console.error("[Mobile OTP] Failed to send code email:", error);
  }

  return { code };
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

export async function verifyMobileAuthCode(
  email: string,
  code: string
): Promise<VerifyCodeResult> {
  const normalizedEmail = normalizeEmail(email);
  const candidate = await prisma.mobileAuthCode.findFirst({
    where: { email: normalizedEmail, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!candidate) return { ok: false, reason: "invalid" };

  if (candidate.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (candidate.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  // Count this attempt before comparing, so a crash mid-verify can't grant
  // unlimited retries.
  await prisma.mobileAuthCode.update({
    where: { id: candidate.id },
    data: { attempts: { increment: 1 } },
  });

  const expected = Buffer.from(hashCode(normalizedEmail, code));
  const actual = Buffer.from(candidate.codeHash);

  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) return { ok: false, reason: "invalid" };

  // Atomic single-use consume: if another concurrent request already
  // consumed this code, `count` will be 0 and we reject rather than letting
  // two requests both succeed.
  const consumed = await prisma.mobileAuthCode.updateMany({
    where: { id: candidate.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (consumed.count !== 1) return { ok: false, reason: "invalid" };

  return { ok: true };
}
