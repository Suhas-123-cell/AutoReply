import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { prisma } from "@/lib/db/client";
import { hasVerifiedPhone, mobileUserProfile } from "@/lib/auth/phone-verification";

export const dynamic = "force-dynamic";

// Bootstraps the mobile app after launch / token refresh: confirms the
// bearer session is still valid and returns everything the app needs to
// render without a second round trip (user, workspace, role — which no
// other endpoint surfaces, since the web UI never needs to hide controls by
// role client-side; it re-checks server-side on every mutation instead).
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, phone: true, phoneVerified: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasVerifiedPhone(user)) {
    return NextResponse.json({
      success: true,
      data: {
        user: mobileUserProfile(user),
        workspace: null,
        role: null,
        phoneVerificationRequired: true,
      },
    });
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const connectedAccountCount = await prisma.instagramAccount.count({
    where: { workspaceId: context.workspaceId },
  });

  return NextResponse.json({
    success: true,
    data: {
      user: mobileUserProfile(user),
      phoneVerificationRequired: false,
      workspace: { id: context.workspace.id, name: context.workspace.name },
      role: context.role,
      connectedAccountCount,
    },
  });
}
