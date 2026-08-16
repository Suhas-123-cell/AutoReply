import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db/client";
import type { PlanId } from "@/lib/billing/plans";
import { getStripeClient } from "@/lib/billing/stripe";

// Reverse lookup: a Checkout/Portal session only gives us a Stripe Price ID,
// not our own plan id, so map back via the same env vars plans.ts reads
// forward from. Built lazily (not at module scope) so a deployment with no
// Stripe env vars at all doesn't throw on import.
function priceIdToPlanId(priceId: string): PlanId | null {
  const entries: [string | undefined, PlanId][] = [
    [process.env.STRIPE_PRICE_ID_STARTER, "starter"],
    [process.env.STRIPE_PRICE_ID_AGENCY, "agency"],
  ];
  return entries.find(([id]) => id === priceId)?.[1] ?? null;
}

async function applySubscription(subscription: Stripe.Subscription) {
  const workspaceId = subscription.metadata.workspaceId;
  if (!workspaceId) {
    console.warn("[Stripe Webhook] Subscription has no workspaceId metadata:", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const planId = priceId ? priceIdToPlanId(priceId) : null;
  const item = subscription.items.data[0];

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeSubscriptionId: subscription.id,
      plan: planId ?? "free",
      planStatus: subscription.status,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
    },
  });
}

async function clearSubscription(subscription: Stripe.Subscription) {
  const workspaceId = subscription.metadata.workspaceId;
  if (!workspaceId) return;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      plan: "free",
      planStatus: "canceled",
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    },
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { success: false, error: "Stripe webhook is not configured" },
      { status: 400 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { success: false, error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // Must read the raw body before any JSON parsing — Stripe signs the exact
  // bytes it sent, and re-serializing a parsed object won't match.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[Stripe Webhook] Signature verification failed:", error);
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        const subscription = await getStripeClient().subscriptions.retrieve(
          session.subscription
        );
        await applySubscription(subscription);
      }
      break;
    }
    case "customer.subscription.updated": {
      await applySubscription(event.data.object);
      break;
    }
    case "customer.subscription.deleted": {
      await clearSubscription(event.data.object);
      break;
    }
    default:
      // Ignore everything else — invoices, payment intents, etc. don't
      // change plan/limit state, only the subscription object does.
      break;
  }

  return NextResponse.json({ success: true });
}
