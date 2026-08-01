/**
 * Minimal Resend email sender.
 *
 * Uses a raw `fetch` call against Resend's HTTP API instead of the `resend`
 * npm package, since the package isn't installed and one POST doesn't need it.
 * Reuses the same RESEND_API_KEY / EMAIL_FROM env vars as the web app's
 * Auth.js magic-link provider (lib/auth.ts).
 */

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "OpenReply <login@example.com>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}
