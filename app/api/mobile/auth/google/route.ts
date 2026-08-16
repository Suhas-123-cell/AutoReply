import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isGoogleSignInConfigured, verifyGoogleIdToken } from "@/lib/auth/google";
import { provisionUserByGoogleAccount } from "@/lib/auth/provision";
import { createMobileSession } from "@/lib/auth/mobile-session";
import { allowAuthAttemptByIp } from "@/lib/auth/otp-rate-limit";
import { getWorkspaceMembership } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const googleSignInSchema = z.object({
  idToken: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

export async function POST(request: NextRequest) {
  if (!isGoogleSignInConfigured()) {
    return NextResponse.json(
      { success: false, error: "Google sign-in is not configured yet" },
      { status: 503 }
    );
  }

  // Every submitted idToken triggers a real verification call (signature +
  // Google's public-key fetch/cache) — without this, an attacker could
  // submit unlimited garbage tokens for free. There's no phone/email to key
  // a per-identifier limit on up front, so this is IP-only.
  const allowed = await allowAuthAttemptByIp("google", getClientIp(request), 20, 3600);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = googleSignInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const identity = await verifyGoogleIdToken(parsed.data.idToken);
  if (!identity) {
    return NextResponse.json(
      { success: false, error: "Could not verify Google sign-in" },
      { status: 401 }
    );
  }

  const { user, workspace } = await provisionUserByGoogleAccount({
    googleSub: identity.googleSub,
    email: identity.emailVerified ? identity.email : null,
    name: identity.name,
  });
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
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: workspace.id, name: workspace.name },
      role: membership?.role ?? "OWNER",
    },
  });
}
