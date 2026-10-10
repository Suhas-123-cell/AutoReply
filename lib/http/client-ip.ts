import { isIP } from "node:net";

// X-Real-IP and X-Forwarded-For must be overwritten by the trusted reverse
// proxy (Caddyfile, deploy/nginx, or the hosting platform). CF-Connecting-IP
// is deliberately not read: off Cloudflare (e.g. Vercel) any client can set
// it, which would let one caller rotate IPs and evade every per-IP limit.
// Behind Cloudflare, the nginx real-ip config already resolves the client IP
// into the headers below.
export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",").at(-1);
  for (const candidate of [headers.get("x-real-ip"), forwardedFor]) {
    const ip = candidate?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}
