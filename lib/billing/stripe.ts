import Stripe from "stripe";

// Lazily constructed — importing this module must never throw for a
// self-hosted deployment with no Stripe keys set. Every caller checks
// isBillingConfigured() (see ./plans.ts) before reaching code that needs
// this, but getStripeClient() still throws with a clear message rather than
// silently returning something broken if that check is ever skipped.
let client: Stripe | null | undefined;

export function getStripeClient(): Stripe {
  if (client === undefined) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    client = secretKey ? new Stripe(secretKey) : null;
  }
  if (!client) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured — billing is disabled on this deployment."
    );
  }
  return client;
}

export function getStripePriceId(envVarName: string): string {
  const priceId = process.env[envVarName];
  if (!priceId) {
    throw new Error(`${envVarName} is not configured.`);
  }
  return priceId;
}
