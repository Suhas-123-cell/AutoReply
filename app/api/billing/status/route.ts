import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getPlan, isBillingConfigured, PLANS } from "@/lib/billing/plans";

// Any workspace member can view billing status (read-only) — only
// checkout/portal (which change or reveal payment details) are owner-only.
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isBillingConfigured()) {
    return NextResponse.json({
      success: true,
      data: { configured: false },
    });
  }

  const plan = getPlan(context.workspace.plan);

  return NextResponse.json({
    success: true,
    data: {
      configured: true,
      plan: plan.id,
      planName: plan.name,
      planStatus: context.workspace.planStatus,
      currentPeriodEnd: context.workspace.currentPeriodEnd,
      hasBillingAccount: Boolean(context.workspace.stripeCustomerId),
      usage: {
        sent: context.workspace.dmsSentThisPeriod,
        limit: plan.monthlyDmLimit,
      },
      plans: Object.values(PLANS),
    },
  });
}
