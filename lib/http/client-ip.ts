import { isIP } from "node:net";

// These headers must be overwritten by the trusted reverse proxy. Never
// forward client-supplied copies of them to the API.
export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",").at(-1);
  for (const candidate of [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    forwardedFor,
  ]) {
    const ip = candidate?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return null;
}
