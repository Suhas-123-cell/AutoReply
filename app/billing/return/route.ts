import { NextRequest } from "next/server";

const allowedStatuses = new Set(["success", "canceled", "portal"]);

export function GET(request: NextRequest) {
  const rawStatus = request.nextUrl.searchParams.get("status") ?? "portal";
  const status = allowedStatuses.has(rawStatus) ? rawStatus : "portal";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
  const deepLink = `autoreply://billing?${new URLSearchParams({ status, workspaceId }).toString()}`;
  const title = status === "success" ? "Payment complete" : status === "canceled" ? "Checkout canceled" : "Returning to AutoReply";

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${deepLink}"><title>${title}</title></head><body style="font-family:system-ui;padding:32px;background:#0b0d10;color:#f5f7fa"><h1>${title}</h1><p>You can return to the AutoReply app.</p><p><a style="color:#6ee7b7" href="${deepLink}">Open AutoReply</a></p></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    }
  );
}
