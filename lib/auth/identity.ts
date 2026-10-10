/**
 * Verified identities (mailbox, phone number) — not names — decide who an
 * account belongs to. Every user needs a unique verified phone before using
 * the app (lib/auth/phone-verification.ts), sign-in by email resolves to the
 * user that already owns that mailbox, and free-tier usage survives account
 * deletion via IdentityUsageClaim.
 */

import { createHmac } from "crypto";
import { prisma } from "@/lib/db/client";
import { getEncryptionKeyHex } from "@/lib/env";
import { getMonthStart } from "@/lib/billing/usage";
import type { Prisma, User } from "@/app/generated/prisma/client";

const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
// Providers documented to deliver user+tag@domain to user@domain. Others are
// left alone: on an arbitrary domain, a+b@ and a@ can be different mailboxes.
const PLUS_ADDRESSING_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "fastmail.com",
]);

// Keep in sync with prisma/migrations/20261010120000_identity_bound_accounts.
export function canonicalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 0) return normalized;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  if (PLUS_ADDRESSING_DOMAINS.has(domain)) local = local.split("+")[0];
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return local ? `${local}@${domain}` : normalized;
}

/**
 * The user that owns this mailbox: an exact address match first, then any
 * alias of the same inbox (john.doe+x@gmail.com → johndoe@gmail.com).
 * Callers must only pass an address whose control was just proven (OTP
 * delivered to it, or a provider-verified email claim).
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { canonicalEmail: canonicalizeEmail(email) },
    orderBy: { createdAt: "asc" },
  });
}

export function identityHash(kind: "phone" | "email", value: string): string {
  const normalized = kind === "email" ? canonicalizeEmail(value) : value.trim();
  return createHmac("sha256", Buffer.from(getEncryptionKeyHex(), "hex"))
    .update(`${kind}:${normalized}`)
    .digest("hex");
}

function identityHashesFor(user: { phone: string | null; email: string | null }) {
  return [
    ...(user.phone ? [identityHash("phone", user.phone)] : []),
    ...(user.email ? [identityHash("email", user.email)] : []),
  ];
}

/**
 * Called before an account is deleted: remembers this month's DM usage of the
 * workspaces it owns against the user's phone and email.
 */
export async function recordIdentityUsage(
  tx: Prisma.TransactionClient,
  user: { id: string; phone: string | null; email: string | null }
): Promise<void> {
  const hashes = identityHashesFor(user);
  if (hashes.length === 0) return;

  const monthStart = getMonthStart();
  const owned = await tx.workspace.findMany({
    where: { ownerId: user.id, usagePeriodStart: { gte: monthStart } },
    select: { dmsSentThisPeriod: true },
  });
  const used = owned.reduce((sum, w) => sum + w.dmsSentThisPeriod, 0);
  if (used === 0) return;

  for (const hash of hashes) {
    const existing = await tx.identityUsageClaim.findUnique({
      where: { identityHash: hash },
    });
    const carried =
      existing && existing.usagePeriodStart >= monthStart
        ? existing.dmsSentThisPeriod
        : 0;
    await tx.identityUsageClaim.upsert({
      where: { identityHash: hash },
      create: {
        identityHash: hash,
        usagePeriodStart: monthStart,
        dmsSentThisPeriod: used,
      },
      update: {
        usagePeriodStart: monthStart,
        dmsSentThisPeriod: Math.max(carried, used),
      },
    });
  }
}

/**
 * Called once an account's phone is verified: a phone or email that already
 * used free-tier DMs this month (under a since-deleted account) brings that
 * usage to the new account's own workspace.
 */
export async function applyIdentityUsage(
  tx: Prisma.TransactionClient,
  user: { id: string; phone: string | null; email: string | null }
): Promise<void> {
  const hashes = identityHashesFor(user);
  if (hashes.length === 0) return;

  const monthStart = getMonthStart();
  const claims = await tx.identityUsageClaim.findMany({
    where: { identityHash: { in: hashes }, usagePeriodStart: { gte: monthStart } },
    select: { dmsSentThisPeriod: true },
  });
  const carried = Math.max(0, ...claims.map((c) => c.dmsSentThisPeriod));
  if (carried === 0) return;

  const workspaces = await tx.workspace.findMany({
    where: { ownerId: user.id },
    select: { id: true, usagePeriodStart: true, dmsSentThisPeriod: true },
  });
  for (const workspace of workspaces) {
    const current =
      workspace.usagePeriodStart >= monthStart ? workspace.dmsSentThisPeriod : 0;
    await tx.workspace.update({
      where: { id: workspace.id },
      data: {
        usagePeriodStart: monthStart,
        dmsSentThisPeriod: Math.max(current, carried),
      },
    });
  }
}
