import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowCodeVerifyAttempt } from "@/lib/auth/otp-rate-limit";
import {
  normalizePhone,
  verifyMobilePhoneAuthCode,
} from "@/lib/auth/mobile-phone-codes";
import { provisionUserByPhone } from "@/lib/auth/provision";
import { createMobileSession } from "@/lib/auth/mobile-session";
import { getWorkspaceMembership } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const verifyCodeSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().regex(/^\d{6}$/),
  platform: z.enum(["ios", "android"]),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = verifyCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { success: false, error: "Invalid phone number" },
      { status: 400 }
    );
  }

  const allowed = await allowCodeVerifyAttempt(phone);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const result = await verifyMobilePhoneAuthCode(phone, parsed.data.code);
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This code has expired. Request a new one."
        : result.reason === "too_many_attempts"
          ? "Too many attempts. Request a new code."
          : "That code is incorrect.";
    return NextResponse.json({ success: false, error: message }, { status: 401 });
  }

  const { user, workspace } = await provisionUserByPhone(phone);
  const membership = await getWorkspaceMembership(user.id);

  const { sessionToken, expires } = await createMobileSession({
    userId: user.id,
    platform: parsed.data.platform,
    deviceName: parsed.data.deviceName ?? null,
    appVersion: parsed.data.appVersion ?? null,
  });

  return NextResponse.json({
    success: true,
    data: {
      sessionToken,
      expiresAt: expires.toISOString(),
      user: { id: user.id, phone: user.phone },
      workspace: { id: workspace.id, name: workspace.name },
      role: membership?.role ?? "OWNER",
    },
  });
}
