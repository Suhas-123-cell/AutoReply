import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { logAuditEvent } from "@/lib/audit";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId =
    typeof body?.instagramAccountId === "string" ? body.instagramAccountId : null;
  // Always one named account: an omitted id must never mean "all of them".
  if (!instagramAccountId) {
    return NextResponse.json(
      { success: false, error: "instagramAccountId is required" },
      { status: 400 }
    );
  }

  const deleted = await prisma.instagramAccount.deleteMany({
    where: { workspaceId: context.workspaceId, id: instagramAccountId },
  });
  if (deleted.count === 0) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 404 }
    );
  }

  await logAuditEvent(context.workspaceId, "Instagram account disconnected", {
    instagramAccountId,
    byUserId: context.userId,
  });

  return NextResponse.json({ success: true });
}
