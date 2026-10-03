import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth";
import { attachVerifiedPhone, verifyFirebasePhoneIdToken } from "@/lib/auth/phone-verification";
import { allowAuthAttemptByIp, allowPhoneVerifyAttempt } from "@/lib/auth/otp-rate-limit";
import { getClientIp } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

const verifyPhoneSchema = z.object({ idToken: z.string().min(1).max(8192) });

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: "Sign in before verifying your phone." }, { status: 401 });
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ success: false, error: "Phone verification is not configured yet." }, { status: 503 });
  }
  const allowed = await allowPhoneVerifyAttempt(userId) &&
    await allowAuthAttemptByIp("phone-verify", getClientIp(request.headers), 20, 900);
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = verifyPhoneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const phone = await verifyFirebasePhoneIdToken(parsed.data.idToken);
  if (!phone) {
    return NextResponse.json({ success: false, error: "Phone verification expired or failed. Request a new SMS code." }, { status: 400 });
  }
  const result = await attachVerifiedPhone(userId, phone);
  if (!result.ok) {
    const error = result.reason === "phone_in_use"
      ? "This phone is linked to another account. Sign in with the original account."
      : result.reason === "already_verified"
        ? "Your account already has a verified phone."
        : "Account not found";
    return NextResponse.json({ success: false, error }, { status: result.reason === "user_not_found" ? 401 : 409 });
  }
  return NextResponse.json({ success: true, data: { phone, phoneVerified: true } });
}
