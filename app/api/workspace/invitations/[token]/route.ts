import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

type RouteProps = { params: Promise<{ token: string }> };

// Public — no auth. A brand-new invitee has no session yet when they first
// open the invite deep link, so the preview (workspace name, role, invited
// email) must be readable before sign-in. Accepting still requires auth,
// see ../accept/route.ts.
export async function GET(request: NextRequest, { params }: RouteProps) {
  const { token } = await params;

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });

  if (!invitation || invitation.status !== "PENDING") {
    return NextResponse.json(
      { success: false, error: "Invitation is no longer available" },
      { status: 404 }
    );
  }

  if (invitation.expiresAt <= new Date()) {
    return NextResponse.json(
      { success: false, error: "Invitation has expired" },
      { status: 410 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      workspaceName: invitation.workspace.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    },
  });
}
