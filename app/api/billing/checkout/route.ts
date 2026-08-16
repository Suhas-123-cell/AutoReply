import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { canManageBilling, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getPlan, isBillingConfigured, isPlanId, PAID_PLAN_IDS } from "@/lib/billing/plans";
import { getStripeClient, getStripePriceId } from "@/lib/billing/stripe";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "agency"]),
});

// Mobile can't embed Stripe.js, so this returns a hosted Checkout URL for
// the app to open in an in-app browser — same pattern as the Instagram
// OAuth connect flow (InAppBrowser.openAuth).
export async function POST(request: NextRequest) {
  if (!isBillingConfigured()) {
    return NextResponse.json(
      { success: false, error: "Billing is not configured on this deployment." },
      { status: 400 }
    );
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageBilling(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only the workspace owner can manage billing" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success || !isPlanId(parsed.data.plan) || !PAID_PLAN_IDS.includes(parsed.data.plan)) {
    return NextResponse.json(
      { success: false, error: "A valid paid plan is required" },
      { status: 400 }
    );
  }

  const plan = getPlan(parsed.data.plan);
  if (!plan.stripePriceEnvVar) {
    return NextResponse.json(
      { success: false, error: "This plan has no Stripe price configured" },
      { status: 400 }
    );
  }

  const stripe = getStripeClient();

  let customerId = context.workspace.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { workspaceId: context.workspaceId },
    });
    customerId = customer.id;
    await prisma.workspace.update({
      where: { id: context.workspaceId },
      data: { stripeCustomerId: customerId },
    });
  }

  // Redirects straight to the app's deep-link scheme, same pattern as the
  // Instagram OAuth callback (mobileDeepLinkFor in
  // app/api/instagram/callback/route.ts) — InAppBrowser.openAuth on the
  // mobile side closes itself once it sees an autoreply:// redirect. The
  // real plan change lands via the webhook, not this redirect; this URL is
  // only UX, telling the app to refetch billing status.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: getStripePriceId(plan.stripePriceEnvVar), quantity: 1 }],
    success_url: "autoreply://billing?status=success",
    cancel_url: "autoreply://billing?status=canceled",
    metadata: { workspaceId: context.workspaceId },
    subscription_data: { metadata: { workspaceId: context.workspaceId } },
  });

  if (!session.url) {
    return NextResponse.json(
      { success: false, error: "Stripe did not return a checkout URL" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: { url: session.url } });
}
