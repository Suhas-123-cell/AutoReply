import { z } from "zod";

/**
 * A URL restricted to http(s). Use for any value that eventually reaches
 * app/r/[slug]/route.ts's NextResponse.redirect() (tracked-link destination
 * URLs) — that route is the app's one fully public, unauthenticated
 * endpoint, so its target shouldn't accept javascript:/data:/other schemes
 * just because the generic WHATWG URL parser (which z.string().url() uses)
 * allows them.
 */
export const httpUrlSchema = z.string().url().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "URL must start with http:// or https://" }
);
