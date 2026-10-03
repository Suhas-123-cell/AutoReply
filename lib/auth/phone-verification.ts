import { prisma } from "@/lib/db/client";
import { getFirebaseAuth } from "@/lib/firebase/admin";

type PhoneStatus = { phone: string | null; phoneVerified: Date | null };

export function hasVerifiedPhone(user: PhoneStatus | null): boolean {
  return Boolean(user?.phone && user.phoneVerified);
}

export function mobileUserProfile(user: PhoneStatus & { id: string; email: string | null; name: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    phoneVerified: hasVerifiedPhone(user),
  };
}

// A refreshed token alone is insufficient: require a recent SMS sign-in,
// rather than a Google/email token with a previously attached phone claim.
export async function verifyFirebasePhoneIdToken(idToken: string): Promise<string | null> {
  if (process.env.NODE_ENV === "production" && process.env.FIREBASE_AUTH_EMULATOR_HOST) return null;
  try {
    const token = await getFirebaseAuth().verifyIdToken(idToken, true);
    const now = Math.floor(Date.now() / 1000);
    if (
      token.firebase.sign_in_provider !== "phone" ||
      typeof token.phone_number !== "string" ||
      !/^\+[1-9]\d{7,14}$/.test(token.phone_number) ||
      !Number.isFinite(token.auth_time) ||
      token.auth_time > now + 30 ||
      now - token.auth_time > 10 * 60
    ) return null;
    return token.phone_number;
  } catch {
    return null;
  }
}

export type AttachPhoneResult =
  | { ok: true }
  | { ok: false; reason: "phone_in_use" | "already_verified" | "user_not_found" };

export async function attachVerifiedPhone(userId: string, phone: string): Promise<AttachPhoneResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { phone: true, phoneVerified: true },
      });
      if (!user) return { ok: false, reason: "user_not_found" };
      if (hasVerifiedPhone(user)) {
        return user.phone === phone
          ? { ok: true }
          : { ok: false, reason: "already_verified" };
      }
      // The unique User.phone index rejects a number claimed by another
      // account. The conditional update prevents concurrent requests from
      // replacing the phone that just won verification on this account.
      const attached = await tx.user.updateMany({
        where: { id: userId, phoneVerified: null },
        data: { phone, phoneVerified: new Date() },
      });
      return attached.count === 1
        ? { ok: true }
        : { ok: false, reason: "already_verified" };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { ok: false, reason: "phone_in_use" };
    }
    throw error;
  }
}
