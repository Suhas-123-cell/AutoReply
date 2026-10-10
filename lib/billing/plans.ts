// Plan catalog for the optional hosted-billing layer. A self-hosted
// deployment with no STRIPE_SECRET_KEY never reads limit/priceId from here —
// see reserveWorkspaceDMSend in ./usage.ts, which only enforces a plan's
// limit when billing is configured at all.

export type PlanId = "free" | "starter" | "agency";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyDmLimit: number;
  // Combined count of connected Instagram + Telegram accounts a workspace on
  // this plan may have at once — the actual value lever for an agency
  // managing multiple clients, unlike DM volume (see canConnectAnotherAccount
  // in ./usage.ts).
  maxConnectedAccounts: number;
  priceUsd: number;
  // Stripe Price ID env var name, not the value itself — resolved lazily in
  // lib/billing/stripe.ts so a missing env var doesn't crash module import
  // for self-hosted deployments that never touch billing.
  stripePriceEnvVar: string | null;
}

// Must stay within PostgreSQL int4 range. Used only by self-hosted deployments
// where billing limits are disabled.
export const UNLIMITED = 2_000_000_000;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyDmLimit: 500,
    maxConnectedAccounts: 1,
    priceUsd: 0,
    stripePriceEnvVar: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyDmLimit: 25_000,
    maxConnectedAccounts: 2,
    priceUsd: 19,
    stripePriceEnvVar: "STRIPE_PRICE_ID_STARTER",
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyDmLimit: 250_000,
    maxConnectedAccounts: 10,
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

const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

// Subscription statuses that can still bill or recover. Anything else
// (canceled, incomplete_expired, or never subscribed) is finished, so a new
// checkout may start and its subscription replaces the old one.
export const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

export function getEffectivePlanId(planId: string, planStatus: string | null): PlanId {
  if (planId === "free") return "free";
  return isPlanId(planId) && ENTITLED_STATUSES.has(planStatus ?? "")
    ? planId
    : "free";
}

export function isMobileCheckoutEnabled() {
  return process.env.MOBILE_STORE_BILLING_ENABLED === "true";
}

// Self-hosted default: billing enforcement is entirely opt-in. Without a
// Stripe secret key configured, every workspace behaves as "free" but with
// no cap — Meta's own rate limits are the only real constraint, exactly as
// documented in usage.ts before this feature existed.
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
