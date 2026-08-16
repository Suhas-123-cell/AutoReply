import { NextResponse } from "next/server";
import Stripe from "stripe";
import { canManageBilling, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { isBillingConfigured } from "@/lib/billing/plans";
import { getStripeClient } from "@/lib/billing/stripe";

// Stripe's hosted Billing Portal — lets the workspace owner change plan,
// update card details, or cancel, all inside Stripe's own UI rather than us
// re-implementing subscription management. Opened in-app the same way as
// the checkout URL.
export async function POST() {
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

  if (!context.workspace.stripeCustomerId) {
    return NextResponse.json(
      { success: false, error: "No billing account yet — subscribe to a plan first" },
      { status: 400 }
    );
  }

  const stripe = getStripeClient();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: context.workspace.stripeCustomerId,
      return_url: "autoreply://billing",
    });
    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (err) {
    const message =
      err instanceof Stripe.errors.StripeError
        ? err.message
        : "Could not reach Stripe";
    console.error("[Billing Portal] Stripe request failed:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }
}
