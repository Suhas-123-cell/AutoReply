/**
 * Keyword Matcher — Unit Tests
 *
 * Tests all edge cases for keyword matching logic.
 */

import { describe, it, expect } from "vitest";
import {
  matchKeywords,
  stripSpecialCharacters,
} from "../lib/utils/keyword-matcher";

describe("stripSpecialCharacters", () => {
  it("should remove emojis", () => {
    expect(stripSpecialCharacters("Hello 🔥 World 💪")).toBe("Hello World");
  });

  it("should remove special characters but keep alphanumeric", () => {
    expect(stripSpecialCharacters("price!!??")).toBe("price");
  });

  it("should collapse multiple spaces into one", () => {
    expect(stripSpecialCharacters("hello   world")).toBe("hello world");
  });

  it("should handle empty strings", () => {
    expect(stripSpecialCharacters("")).toBe("");
  });

  it("should handle strings with only emojis", () => {
    expect(stripSpecialCharacters("🔥💪😊")).toBe("");
  });

  it("should preserve numbers", () => {
    expect(stripSpecialCharacters("price123")).toBe("price123");
  });
});

describe("matchKeywords — whole word matching", () => {
  it("should match exact keyword (case-insensitive)", () => {
    const result = matchKeywords("I want the LINK", ["link"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should match keyword regardless of case", () => {
    expect(matchKeywords("give me the Link please", ["LINK"], true).matched).toBe(true);
    expect(matchKeywords("LINK", ["link"], true).matched).toBe(true);
    expect(matchKeywords("liNk", ["LINK"], true).matched).toBe(true);
  });

  it("should NOT match partial words in whole-word mode", () => {
    const result = matchKeywords("I am linking to you", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should match when keyword is at the start", () => {
    const result = matchKeywords("LINK please", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should match when keyword is at the end", () => {
    const result = matchKeywords("send me the link", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should match first keyword in multi-keyword list (OR logic)", () => {
    const result = matchKeywords("I want the price", ["link", "price", "info"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("price");
  });

  it("should return first matching keyword", () => {
    const result = matchKeywords("link and price", ["link", "price"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should not match if no keywords match", () => {
    const result = matchKeywords("hello world", ["link", "price"], true);
    expect(result.matched).toBe(false);
    expect(result.matchedKeyword).toBeNull();
  });
});

describe("matchKeywords — whole word, typo tolerance", () => {
  it("should match a one-letter typo on a long-enough keyword", () => {
    const result = matchKeywords("what's the pricee on this", ["price"], true);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("price");
  });

  it("should match a missing-letter typo", () => {
    const result = matchKeywords("send me the shiping info", ["shipping"], true);
    expect(result.matched).toBe(true);
  });

  it("should NOT apply typo tolerance to short keywords", () => {
    // "link" is only 4 letters — too many unrelated real words (pink, wink,
    // sink) are one edit away, so short keywords stay exact-match only.
    const result = matchKeywords("I love this pink dress", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should still reject a genuinely different word of similar length", () => {
    const result = matchKeywords("what a lovely sunset", ["price"], true);
    expect(result.matched).toBe(false);
  });

  it("should not fuzzy-match multi-word keywords", () => {
    const result = matchKeywords("more infoo please", ["more info"], true);
    expect(result.matched).toBe(false);
  });
});

describe("matchKeywords — whole word, plural tolerance", () => {
  it("should match a plural comment against a singular keyword", () => {
    const result = matchKeywords("what are your prices?", ["price"], true);
    expect(result.matched).toBe(true);
  });

  it("should match a singular comment against a plural keyword", () => {
    const result = matchKeywords("send me a discount", ["discounts"], true);
    expect(result.matched).toBe(true);
  });

  it("should match -ies plurals", () => {
    const result = matchKeywords("what categories do you have", ["category"], true);
    expect(result.matched).toBe(true);
  });

  it("should match plurals even on keywords too short for typo tolerance", () => {
    // "sale" is 4 letters — below the typo-tolerance floor — but plural
    // matching has its own, lower minimum and should still catch "sales".
    const result = matchKeywords("any sales this week?", ["sale"], true);
    expect(result.matched).toBe(true);
  });

  it("should still exclude verb-form matches like the linking/link case", () => {
    const result = matchKeywords("I am linking to you", ["link"], true);
    expect(result.matched).toBe(false);
  });
});

describe("matchKeywords — partial matching", () => {
  it("should match partial words in partial mode", () => {
    const result = matchKeywords("I am linking to you", ["link"], false);
    expect(result.matched).toBe(true);
    expect(result.matchedKeyword).toBe("link");
  });

  it("should match substring anywhere in text", () => {
    const result = matchKeywords("unbreakable bond", ["break"], false);
    expect(result.matched).toBe(true);
  });

  it("should be case-insensitive in partial mode", () => {
    const result = matchKeywords("LINKING", ["link"], false);
    expect(result.matched).toBe(true);
  });
});

describe("matchKeywords — edge cases", () => {
  it("should return false for empty comment text", () => {
    const result = matchKeywords("", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should return false for empty keywords array", () => {
    const result = matchKeywords("give me the link", [], true);
    expect(result.matched).toBe(false);
  });

  it("should handle comments with only emojis", () => {
    const result = matchKeywords("🔥🔥🔥", ["link"], true);
    expect(result.matched).toBe(false);
  });

  it("should match keyword even with surrounding emojis", () => {
    const result = matchKeywords("🔥 LINK 🔥", ["link"], true);
    expect(result.matched).toBe(true);
  });

  it("should handle keywords with special characters", () => {
    const result = matchKeywords("send info", ["info!"], true);
    expect(result.matched).toBe(true);
  });

  it("should handle multi-word keywords", () => {
    const result = matchKeywords("I want more info please", ["more info"], true);
    expect(result.matched).toBe(true);
  });
});
