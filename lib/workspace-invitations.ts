import { randomBytes } from "node:crypto";

const INVITE_TTL_DAYS = 14;

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generateInvitationToken() {
  return randomBytes(18).toString("base64url");
}

export function getInvitationExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
  return expiresAt;
}

// The app is the only real product surface (see README) — there is no web
// page to land an invitee on, so this is a mobile deep link, not an HTTPS
// URL. The owner shares it directly (copy/share sheet); nothing emails it.
// See mobile/src/navigation/linking.js's "invite/:token" entry and
// mobile/app/invite/[token].jsx for the landing screen.
export function buildInvitationUrl(token: string) {
  return `autoreply://invite/${token}`;
}

