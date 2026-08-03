import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  fcmToken: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().max(50).optional().nullable(),
  deviceName: z.string().max(100).optional().nullable(),
});

const unregisterSchema = z.object({
  fcmToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { fcmToken, platform, appVersion, deviceName } = parsed.data;

  // Unique on fcmToken, not userId — a device that re-registers (or was
  // reassigned to a different signed-in user) simply takes over the row and
  // is re-enabled, rather than accumulating stale duplicates.
  const device = await prisma.pushDevice.upsert({
    where: { fcmToken },
    create: {
      userId,
      fcmToken,
      platform,
      appVersion: appVersion ?? null,
      deviceName: deviceName ?? null,
    },
    update: {
      userId,
      platform,
      appVersion: appVersion ?? null,
      deviceName: deviceName ?? null,
      disabledAt: null,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, data: device });
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = unregisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Idempotent: a client logging out with an already-removed token must
  // still succeed.
  await prisma.pushDevice.deleteMany({
    where: { fcmToken: parsed.data.fcmToken, userId },
  });

  return NextResponse.json({ success: true });
}
