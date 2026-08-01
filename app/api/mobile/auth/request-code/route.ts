import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowCodeRequest } from "@/lib/auth/otp-rate-limit";
import { issueMobileAuthCode } from "@/lib/auth/mobile-codes";

// Dev-only escape hatch: echoes the generated code back in the response so a
// developer can sign in on the mobile app without waiting on a real email.
// Double-gated (NODE_ENV check + explicit flag) so this can never fire in
// production even if the env var is set by mistake.
const devEcho =
  process.env.NODE_ENV !== "production" &&
  process.env.MOBILE_OTP_DEV_ECHO === "true";

export const dynamic = "force-dynamic";

const requestCodeSchema = z.object({
  email: z.string().email(),
});

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = requestCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid email" },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const allowed = await allowCodeRequest(parsed.data.email, ip);

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  // Always succeed regardless of whether the email exists — sign-up and
  // sign-in are the same flow (as with the web's magic links), so this
  // leaks nothing about which emails have accounts.
  try {
    const { code } = await issueMobileAuthCode(parsed.data.email, ip);
    if (devEcho) {
      return NextResponse.json({ success: true, devCode: code });
    }
  } catch (error) {
    console.error("Failed to issue mobile auth code", error);
  }

  return NextResponse.json({ success: true });
}
