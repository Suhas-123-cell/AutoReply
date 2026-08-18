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

// Must stay within PostgreSQL int4 range, since dmsSentThisPeriod is an Int
// column compared against this value. Doubles as both the self-hosted (no
// Stripe key) fallback and paid plans' "Unlimited DMs" marketing claim: real
// throughput is already bounded by Meta/Telegram's own per-account API rate
// limits, so this ceiling is never actually reachable in practice.
export const UNLIMITED = 2_000_000_000;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyDmLimit: 5_000,
    maxConnectedAccounts: 1,
    priceUsd: 0,
    stripePriceEnvVar: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    // Marketed as "Unlimited DMs" — a soft abuse/circuit-breaker ceiling,
    // not a real usage cap (~46% of the 2-account Meta rate-limit ceiling;
    // see the rate limiter's 750/hr-per-account cap in
    // lib/utils/rate-limiter.ts for where the real hard stop is). See
    // canConnectAnotherAccount in ./usage.ts for the limit that actually
    // matters to buyers.
    monthlyDmLimit: 500_000,
    maxConnectedAccounts: 2,
    priceUsd: 19,
    stripePriceEnvVar: "STRIPE_PRICE_ID_STARTER",
  },
  agency: {
    id: "agency",
    name: "Agency",
    // Truly unlimited, no soft ceiling — only Meta/Telegram's own
    // per-account rate limits bound throughput. Unlike Starter, this plan
    // has no circuit breaker of its own against a compromised or abused
    // workspace running all 10 accounts flat-out.
    monthlyDmLimit: UNLIMITED,
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

// Self-hosted default: billing enforcement is entirely opt-in. Without a
// Stripe secret key configured, every workspace behaves as "free" but with
// no cap — Meta's own rate limits are the only real constraint, exactly as
// documented in usage.ts before this feature existed.
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
