import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "@/lib/db/client";
import { canManageBilling, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getPlan, isBillingConfigured, isPlanId, PAID_PLAN_IDS } from "@/lib/billing/plans";
import { getStripeClient, getStripePriceId } from "@/lib/billing/stripe";
import { getBaseUrl } from "@/lib/env";
import { isMobileCheckoutEnabled } from "@/lib/billing/plans";

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
  if (
    request.headers.get("x-autoreply-client") === "mobile" &&
    !isMobileCheckoutEnabled()
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Mobile purchases are not enabled for this store build.",
      },
      { status: 403 }
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
  if (
    context.workspace.stripeSubscriptionId &&
    ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(
      context.workspace.planStatus ?? ""
    )
  ) {
    return NextResponse.json(
      { success: false, error: "Manage the existing subscription instead of starting another." },
      { status: 409 }
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    let customerId = context.workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { workspaceId: context.workspaceId } },
        { idempotencyKey: `autoreply-customer-${context.workspaceId}` }
      );
      customerId = customer.id;
      await prisma.workspace.update({
        where: { id: context.workspaceId },
        data: { stripeCustomerId: customerId },
      });
    }

    const baseUrl = getBaseUrl().replace(/\/$/, "");
    const returnBase = `${baseUrl}/billing/return?workspaceId=${encodeURIComponent(context.workspaceId)}`;
    session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: getStripePriceId(plan.stripePriceEnvVar), quantity: 1 }],
        success_url: `${returnBase}&status=success`,
        cancel_url: `${returnBase}&status=canceled`,
        metadata: { workspaceId: context.workspaceId },
        subscription_data: { metadata: { workspaceId: context.workspaceId } },
      },
      {
        // Suppresses accidental double-taps while allowing a fresh attempt
        // after the ten-minute bucket expires.
        idempotencyKey: `autoreply-checkout-${context.workspaceId}-${plan.id}-${Math.floor(Date.now() / 600_000)}`,
      }
    );
  } catch (err) {
    const message =
      err instanceof Stripe.errors.StripeError
        ? err.message
        : "Could not reach Stripe";
    console.error("[Billing Checkout] Stripe request failed:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }

  if (!session.url) {
    return NextResponse.json(
      { success: false, error: "Stripe did not return a checkout URL" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, data: { url: session.url } });
}
