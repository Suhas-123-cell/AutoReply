/**
 * Minimal server-rendered legal pages. Meta App Review requires a public
 * Privacy Policy URL and a Data Deletion URL; Apple and Google require a
 * Privacy Policy URL for a store listing. The backend is otherwise API-only,
 * so these are plain HTML route handlers — no React, no CSS framework.
 *
 * Operator details come from env so a self-hosted instance shows its own
 * name and contact, not AutoReply's.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function operatorName(): string {
  return (
    process.env.LEGAL_OPERATOR_NAME || "the operator of this AutoReply instance"
  );
}

export function operatorContact(): string {
  return process.env.LEGAL_CONTACT_EMAIL || "";
}

export function legalPage(title: string, bodyHtml: string): Response {
  const contact = operatorContact();
  const contactHtml = contact
    ? ` · <a href="mailto:${esc(contact)}">${esc(contact)}</a>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — AutoReply</title>
<style>
body{margin:0;background:#0b0b0d;color:#f4f4f5;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:48px 24px}
h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 8px}
p,li{color:#c9c9d1}a{color:#6b8afd}small{color:#9b9ba3}
</style></head><body><main>
<h1>${esc(title)}</h1>
<small>Operated by ${esc(operatorName())}${contactHtml}</small>
${bodyHtml}
</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
