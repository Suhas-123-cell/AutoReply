import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Bootstraps the mobile app after launch / token refresh: confirms the
// bearer session is still valid and returns everything the app needs to
// render without a second round trip (user, workspace, role — which no
// other endpoint surfaces, since the web UI never needs to hide controls by
// role client-side; it re-checks server-side on every mutation instead).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [user, connectedAccountCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    }),
    prisma.instagramAccount.count({
      where: { workspaceId: context.workspaceId },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      user,
      workspace: { id: context.workspace.id, name: context.workspace.name },
      role: context.role,
      connectedAccountCount,
    },
  });
}
