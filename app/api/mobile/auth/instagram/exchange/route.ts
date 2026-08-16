import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRedisConnection } from "@/lib/queue/client";
import { createMobileSession } from "@/lib/auth/mobile-session";
import { IG_SIGNUP_EXCHANGE_PREFIX } from "@/lib/auth/instagram-signup-exchange";
import { getWorkspaceMembership } from "@/lib/workspace";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const exchangeSchema = z.object({
  code: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

// Redeems the short-lived, single-use code the callback route put in the
// autoreply://ig-connect deep link. A real session token never travels
// through the deep link itself (a redirect URL is more exposed than a
// direct POST body — it can end up in OS-level link-open logs) — only this
// opaque code does, and it's dead the moment it's read once or 60s pass,
// whichever comes first.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const redis = getRedisConnection();
  const key = `${IG_SIGNUP_EXCHANGE_PREFIX}${parsed.data.code}`;
  const userId = await redis.get(key);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "This sign-in link has expired. Try again." },
      { status: 401 }
    );
  }
  await redis.del(key);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const membership = await getWorkspaceMembership(userId);
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
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: membership.workspace.id, name: membership.workspace.name },
      role: membership.role,
    },
  });
}
