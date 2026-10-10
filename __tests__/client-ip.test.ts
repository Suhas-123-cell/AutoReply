import { describe, expect, it } from "vitest";
import { getClientIp } from "../lib/http/client-ip";

describe("getClientIp", () => {
  it("ignores a client-supplied Cloudflare header", () => {
    expect(getClientIp(new Headers({
      "CF-Connecting-IP": "2001:db8::1",
      "X-Real-IP": "198.51.100.2",
      "X-Forwarded-For": "203.0.113.1, 192.0.2.3",
    }))).toBe("198.51.100.2");
    expect(getClientIp(new Headers({ "CF-Connecting-IP": "2001:db8::1" }))).toBeNull();
  });

  it("uses only the final forwarded hop", () => {
    expect(getClientIp(new Headers({
      "X-Forwarded-For": "203.0.113.1, 192.0.2.3",
    }))).toBe("192.0.2.3");
    expect(getClientIp(new Headers({
      "X-Forwarded-For": "203.0.113.1, spoofed",
    }))).toBeNull();
  });

  it("returns null without a valid proxy IP", () => {
    expect(getClientIp(new Headers())).toBeNull();
  });
});
