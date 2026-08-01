/**
 * Creates and revokes the Session rows used by the mobile app's bearer-token
 * auth (see lib/auth/bearer.ts). Reuses Auth.js's own Session table so the
 * two auth paths (web cookie, mobile bearer) are indistinguishable to every
 * downstream API route.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreateMobileSessionInput {
  userId: string;
  platform: "ios" | "android";
  deviceName?: string | null;
  appVersion?: string | null;
}

export async function createMobileSession(
  input: CreateMobileSessionInput
): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  const session = await prisma.session.create({
    data: { sessionToken, userId: input.userId, expires },
  });

  await prisma.mobileSessionMeta.create({
    data: {
      sessionId: session.id,
      platform: input.platform,
      deviceName: input.deviceName ?? null,
      appVersion: input.appVersion ?? null,
    },
  });

  return { sessionToken, expires };
}

// Idempotent: a client with an already-dead token must still be able to "log
// out" locally without the server call failing. Push-device cleanup is not
// handled here — PushDevice is keyed by userId + expoPushToken, not session,
// so the client unregisters its own token explicitly via
// DELETE /api/mobile/push/register before calling this.
export async function revokeMobileSession(sessionToken: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: { id: true },
  });

  if (!session) return;

  await prisma.mobileSessionMeta.deleteMany({ where: { sessionId: session.id } });
  await prisma.session.delete({ where: { id: session.id } });
}
