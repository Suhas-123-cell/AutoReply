import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowCodeRequest } from "@/lib/auth/otp-rate-limit";
import {
  issueMobilePhoneAuthCode,
  normalizePhone,
} from "@/lib/auth/mobile-phone-codes";

// Same dev-only escape hatch as the email flow (see request-code/route.ts) —
// echoes the code back so local dev works without a real SMS provider.
const devEcho =
  process.env.NODE_ENV !== "production" &&
  process.env.MOBILE_OTP_DEV_ECHO === "true";

export const dynamic = "force-dynamic";

const requestCodeSchema = z.object({
  phone: z.string().min(8).max(20),
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
      { success: false, error: "Invalid phone number" },
      { status: 400 }
    );
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { success: false, error: "Enter a phone number with country code, e.g. +14155551234" },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const allowed = await allowCodeRequest(phone, ip);

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  // Same leak-nothing contract as email: succeed regardless of whether this
  // phone has an account, since sign-up and sign-in are the same flow.
  try {
    const { code } = await issueMobilePhoneAuthCode(phone, ip);
    if (devEcho) {
      return NextResponse.json({ success: true, devCode: code });
    }
  } catch (error) {
    console.error("Failed to issue mobile phone auth code", error);
  }

  return NextResponse.json({ success: true });
}
