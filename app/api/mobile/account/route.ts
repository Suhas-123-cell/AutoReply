import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { recordIdentityUsage } from "@/lib/auth/identity";
import { decryptToken } from "@/lib/meta/oauth";
import { deleteWebhook } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

// Required for Apple App Store Guideline 5.1.1(v): apps that support account
// creation must support account deletion initiated in-app, not just a web
// link (app/data-deletion already exists but isn't sufficient on its own).
//
// User.ownedWorkspaces cascades on delete (see prisma/schema.prisma
// Workspace.owner onDelete: Cascade), so an unguarded delete here would
// silently destroy every other member's campaigns and logs the moment an
// OWNER deletes their own account. Block that case rather than allow it.
export async function DELETE() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      _count: { select: { members: true } },
    },
  });

  const workspacesWithOtherMembers = ownedWorkspaces.filter(
    (w) => w._count.members > 1
  );

  if (workspacesWithOtherMembers.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Transfer ownership of your workspace(s) before deleting your account, so your teammates don't lose access to shared data.",
        data: {
          workspaces: workspacesWithOtherMembers.map((w) => ({
            id: w.id,
            name: w.name,
          })),
        },
      },
      { status: 409 }
    );
  }

  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: "INFO",
        message: "Account deletion requested (mobile)",
        payload: { userId },
      },
    })
    .catch(() => {});

  // MobileSessionMeta (deviceName, platform, appVersion) is linked to
  // Session.id only "by convention" — no real FK relation, so it does NOT
  // cascade when the user (and their Sessions) are deleted below. Left
  // behind, deviceName in particular can carry personal info (e.g. "Suhas's
  // iPhone") that would survive an account-deletion request indefinitely,
  // undermining the whole point of this endpoint. Clean it up explicitly.
  const sessions = await prisma.session.findMany({
    where: { userId },
    select: { id: true },
  });

  // Stop Telegram delivering updates for bots that are about to be removed.
  // Best-effort: a revoked bot token must not block account deletion.
  const bots = await prisma.telegramAccount.findMany({
    where: { workspace: { ownerId: userId } },
    select: { botToken: true },
  });
  for (const bot of bots) {
    try {
      await deleteWebhook(decryptToken(bot.botToken));
    } catch {
      // Token revoked or undecryptable — nothing more to clean up remotely.
    }
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true },
    });
    // Free-tier usage stays with the phone/email, so deleting the account and
    // signing up again this month doesn't reset the allowance.
    if (user) await recordIdentityUsage(tx, user);
    if (sessions.length > 0) {
      await tx.mobileSessionMeta.deleteMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
      });
    }
    // Cascades: owned (single-member) workspaces, sessions, workspace
    // memberships, push devices — all via onDelete: Cascade in the schema.
    await tx.user.delete({ where: { id: userId } });
  });

  return NextResponse.json({ success: true });
}
