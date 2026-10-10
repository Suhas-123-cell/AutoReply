import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { consumeOAuthResult, toAuthorization } from "@/lib/meta/oauth-flow";
import { connectAuthorizedInstagramAccount } from "@/lib/instagram-oauth";

export const dynamic = "force-dynamic";

const completeSchema = z.object({
  result: z.string().min(1).max(200),
  verifier: z.string().min(1).max(200),
});

// Second half of the mobile connect flow: the app that started it (and holds
// its verifier) redeems the callback's one-time result. Connecting happens
// here, never in the callback.
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = completeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }

  const pending = await consumeOAuthResult(parsed.data.result, parsed.data.verifier, "mobile");
  if (!pending || pending.client !== "mobile" || pending.userId !== userId) {
    return NextResponse.json(
      { success: false, error: "This connection link has expired. Try connecting again." },
      { status: 400 }
    );
  }

  const outcome = await connectAuthorizedInstagramAccount({
    actingUserId: userId,
    workspaceId: pending.workspaceId,
    authorization: toAuthorization(pending),
  });

  return NextResponse.json({ success: true, data: outcome });
}
