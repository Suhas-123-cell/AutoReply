import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId }, select: { role: true, workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, data: memberships.map((m) => ({ ...m.workspace, role: m.role })) },
    { headers: { "Cache-Control": "no-store" } });
}
