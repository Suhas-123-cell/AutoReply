import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  expoPushToken: z.string().min(1),
  leadAlerts: z.boolean().optional(),
  failureAlerts: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { expoPushToken, leadAlerts, failureAlerts } = parsed.data;
  if (leadAlerts === undefined && failureAlerts === undefined) {
    return NextResponse.json(
      { success: false, error: "No preferences supplied" },
      { status: 400 }
    );
  }

  // Scoped to the caller's own userId, so one signed-in user can never flip
  // notification preferences on another user's device row.
  const updated = await prisma.pushDevice.updateMany({
    where: { expoPushToken, userId },
    data: {
      ...(leadAlerts !== undefined ? { leadAlerts } : {}),
      ...(failureAlerts !== undefined ? { failureAlerts } : {}),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { success: false, error: "Push device not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
