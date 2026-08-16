/**
 * Minimal Twilio SMS sender, mirroring lib/email/send.ts.
 *
 * No SMS provider is required to run this app locally: if TWILIO_* env vars
 * are unset, this no-ops (logs a warning) rather than throwing, exactly like
 * how MOBILE_OTP_DEV_ECHO already lets phone/email sign-in work in dev
 * without a real provider — issueMobilePhoneAuthCode() always returns the
 * code regardless of whether the send itself succeeded.
 */

export async function sendSms(opts: { to: string; body: string }): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn(
      "[SMS] TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER not configured — skipping real send"
    );
    return;
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Twilio send failed (${res.status}): ${body}`);
  }
}
