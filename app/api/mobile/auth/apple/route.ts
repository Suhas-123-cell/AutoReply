import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppleBundleId } from "@/lib/env";
import { verifyAppleIdToken } from "@/lib/auth/apple";
import { provisionUserByAppleAccount } from "@/lib/auth/provision";
import { createMobileSession } from "@/lib/auth/mobile-session";
import { allowAuthAttemptByIp } from "@/lib/auth/otp-rate-limit";
import { getWorkspaceMembership } from "@/lib/workspace";
import { getClientIp } from "@/lib/http/client-ip";
import { hasVerifiedPhone, mobileUserProfile } from "@/lib/auth/phone-verification";

export const dynamic = "force-dynamic";

const appleSignInSchema = z.object({
  idToken: z.string().min(1),
  name: z.string().max(120).nullable().optional(),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

export async function POST(request: NextRequest) {
  if (!getAppleBundleId()) {
    return NextResponse.json(
      { success: false, error: "Apple sign-in is not configured yet" },
      { status: 503 }
    );
  }

  const allowed = await allowAuthAttemptByIp("apple", getClientIp(request.headers), 20, 3600);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = appleSignInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  const identity = await verifyAppleIdToken(parsed.data.idToken);
  if (!identity) {
    return NextResponse.json(
      { success: false, error: "Could not verify Apple sign-in" },
      { status: 401 }
    );
  }

  const { user, workspace } = await provisionUserByAppleAccount({
    appleSub: identity.appleSub,
    email: identity.emailVerified ? identity.email : null,
    name: parsed.data.name ?? null,
  });
  const membership = await getWorkspaceMembership(user.id);
  const { sessionToken, expires } = await createMobileSession({
    userId: user.id,
    platform: "ios",
    deviceName: parsed.data.deviceName ?? null,
    appVersion: parsed.data.appVersion ?? null,
  });

  return NextResponse.json({
    success: true,
    data: {
      sessionToken,
      expiresAt: expires.toISOString(),
      user: mobileUserProfile(user),
      workspace: hasVerifiedPhone(user) ? { id: workspace.id, name: workspace.name } : null,
      role: hasVerifiedPhone(user) ? membership?.role ?? "OWNER" : null,
      phoneVerificationRequired: !hasVerifiedPhone(user),
    },
  });
}
