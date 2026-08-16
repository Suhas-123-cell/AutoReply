// Plan catalog for the optional hosted-billing layer. A self-hosted
// deployment with no STRIPE_SECRET_KEY never reads limit/priceId from here —
// see reserveWorkspaceDMSend in ./usage.ts, which only enforces a plan's
// limit when billing is configured at all.

export type PlanId = "free" | "starter" | "agency";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyDmLimit: number;
  priceUsd: number;
  // Stripe Price ID env var name, not the value itself — resolved lazily in
  // lib/billing/stripe.ts so a missing env var doesn't crash module import
  // for self-hosted deployments that never touch billing.
  stripePriceEnvVar: string | null;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyDmLimit: 500,
    priceUsd: 0,
    stripePriceEnvVar: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyDmLimit: 5_000,
    priceUsd: 29,
    stripePriceEnvVar: "STRIPE_PRICE_ID_STARTER",
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyDmLimit: 50_000,
    priceUsd: 99,
    stripePriceEnvVar: "STRIPE_PRICE_ID_AGENCY",
  },
};

export const PAID_PLAN_IDS: PlanId[] = ["starter", "agency"];

export function isPlanId(value: string): value is PlanId {
  return value === "free" || value === "starter" || value === "agency";
}

export function getPlan(planId: string): PlanDefinition {
  return isPlanId(planId) ? PLANS[planId] : PLANS.free;
}

// Self-hosted default: billing enforcement is entirely opt-in. Without a
// Stripe secret key configured, every workspace behaves as "free" but with
// no cap — Meta's own rate limits are the only real constraint, exactly as
// documented in usage.ts before this feature existed.
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
