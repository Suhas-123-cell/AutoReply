import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMobileSession } from "@/lib/auth/mobile-session";
import { consumeOAuthResult, toAuthorization } from "@/lib/meta/oauth-flow";
import { signInWithInstagram } from "@/lib/instagram-oauth";
import { getWorkspaceMembership } from "@/lib/workspace";
import { prisma } from "@/lib/db/client";
import { hasVerifiedPhone, mobileUserProfile } from "@/lib/auth/phone-verification";

export const dynamic = "force-dynamic";

const exchangeSchema = z.object({
  // The callback's one-time result code from the autoreply://ig-connect link.
  code: z.string().min(1).max(200),
  // Issued by /api/mobile/auth/instagram/start to the app that began sign-in.
  verifier: z.string().min(1).max(200),
  platform: z.enum(["ios", "android"]),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

// Redeems the sign-in result. A session token never travels through the deep
// link, and the result is useless without the verifier only the initiating
// app holds — so a crafted link can't sign a victim into someone else's
// account, and a forwarded authorize URL can't sign anyone in as its owner.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const pending = await consumeOAuthResult(
    parsed.data.code,
    parsed.data.verifier,
    "mobile-signup"
  );
  if (!pending) {
    return NextResponse.json(
      { success: false, error: "This sign-in link has expired. Try again." },
      { status: 401 }
    );
  }

  const signIn = await signInWithInstagram(toAuthorization(pending));
  if (!signIn.ok) {
    return NextResponse.json({ success: false, error: signIn.error }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: signIn.userId } });
  const membership = await getWorkspaceMembership(signIn.userId);
  if (!user || !membership) {
    return NextResponse.json(
      { success: false, error: "Account not found" },
      { status: 404 }
    );
  }

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
      user: mobileUserProfile(user),
      workspace: hasVerifiedPhone(user) ? { id: membership.workspace.id, name: membership.workspace.name } : null,
      role: hasVerifiedPhone(user) ? membership.role : null,
      phoneVerificationRequired: !hasVerifiedPhone(user),
    },
  });
}
