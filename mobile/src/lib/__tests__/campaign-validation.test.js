import { describe, it, expect } from "@jest/globals";
import {
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateStep5,
  validateAll,
  buildAutomationPayload,
} from "../campaign-validation";

const baseDraft = {
  instagramAccountId: "ig_1",
  triggerScope: "any",
  postId: null,
  postUrl: null,
  postThumb: null,
  postCaption: "",
  keywords: ["LINK"],
  matchAnyWord: false,
  wholeWordMatch: true,
  openingDmEnabled: false,
  openingDmMessage: "",
  openingDmButtonLabel: "",
  requireFollow: false,
  followPromptMessage: "",
  followPromptButtonLabel: "i'm following",
  dmMessage: "Here's your link!",
  trackedDestinationUrl: "",
  linkButtonLabel: "Open link",
  secondaryDestinationUrl: "",
  secondaryButtonLabel: "Open link",
  followUpEnabled: false,
  followUpMessage: "",
  publicReplyEnabled: false,
  publicReplyMessages: [""],
  name: "Giveaway",
  isActive: true,
};

describe("validateStep1", () => {
  it("passes with any-post targeting and a connected account", () => {
    expect(validateStep1(baseDraft)).toBeNull();
  });

  it("requires a connected Instagram account", () => {
    expect(validateStep1({ ...baseDraft, instagramAccountId: null })).toMatch(
      /connect an instagram account/i
    );
  });

  it("requires a post when targeting a specific post", () => {
    const draft = { ...baseDraft, triggerScope: "specific", postId: null };
    expect(validateStep1(draft)).toMatch(/pick a post/i);
  });

  it("passes for specific targeting once a post is chosen", () => {
    const draft = { ...baseDraft, triggerScope: "specific", postId: "post_1" };
    expect(validateStep1(draft)).toBeNull();
  });
});

describe("validateStep2", () => {
  it("requires at least one keyword unless matching any word", () => {
    expect(validateStep2({ ...baseDraft, keywords: [] })).toMatch(
      /add at least one keyword/i
    );
  });

  it("passes with match-any-word enabled and no keywords", () => {
    expect(
      validateStep2({ ...baseDraft, keywords: [], matchAnyWord: true })
    ).toBeNull();
  });

  it("passes with at least one keyword", () => {
    expect(validateStep2(baseDraft)).toBeNull();
  });
});

describe("validateStep3", () => {
  it("passes when the opening DM is disabled", () => {
    expect(validateStep3(baseDraft)).toBeNull();
  });

  it("requires a message and button label when the opening DM is enabled", () => {
    const draft = { ...baseDraft, openingDmEnabled: true };
    expect(validateStep3(draft)).toMatch(/opening dm needs/i);
  });

  it("passes once the opening DM message and button label are filled in", () => {
    const draft = {
      ...baseDraft,
      openingDmEnabled: true,
      openingDmMessage: "Tap below!",
      openingDmButtonLabel: "Get it",
    };
    expect(validateStep3(draft)).toBeNull();
  });

  it("requires a follow-prompt message when follow-gating is enabled", () => {
    const draft = { ...baseDraft, requireFollow: true, followPromptMessage: "" };
    expect(validateStep3(draft)).toMatch(/follow-prompt message/i);
  });
});

describe("validateStep4", () => {
  it("requires a DM message", () => {
    expect(validateStep4({ ...baseDraft, dmMessage: "  " })).toMatch(
      /add the dm message/i
    );
  });

  it("rejects an invalid primary tracked link", () => {
    const draft = { ...baseDraft, trackedDestinationUrl: "not-a-url" };
    expect(validateStep4(draft)).toMatch(/tracked link must be a valid url/i);
  });

  it("rejects an invalid secondary tracked link", () => {
    const draft = {
      ...baseDraft,
      trackedDestinationUrl: "https://example.com/a",
      secondaryDestinationUrl: "not-a-url",
    };
    expect(validateStep4(draft)).toMatch(/second tracked link must be a valid url/i);
  });

  it("passes with a valid message and no links", () => {
    expect(validateStep4(baseDraft)).toBeNull();
  });

  it("passes with valid primary and secondary links", () => {
    const draft = {
      ...baseDraft,
      trackedDestinationUrl: "https://example.com/a",
      secondaryDestinationUrl: "https://example.com/b",
    };
    expect(validateStep4(draft)).toBeNull();
  });
});

describe("validateStep5", () => {
  it("requires a campaign name", () => {
    expect(validateStep5({ ...baseDraft, name: "  " })).toMatch(/name is required/i);
  });

  it("passes with a name", () => {
    expect(validateStep5(baseDraft)).toBeNull();
  });
});

describe("validateAll", () => {
  it("returns null when every step is valid", () => {
    expect(validateAll(baseDraft)).toBeNull();
  });

  it("surfaces the first failing step's message", () => {
    const draft = { ...baseDraft, instagramAccountId: null, name: "" };
    // Step 1 fails first, so its message wins even though step 5 also fails.
    expect(validateAll(draft)).toMatch(/connect an instagram account/i);
  });
});

describe("buildAutomationPayload", () => {
  it("builds the any-post payload with trimmed fields", () => {
    const payload = buildAutomationPayload({ ...baseDraft, name: "  Giveaway  " });
    expect(payload).toMatchObject({
      name: "Giveaway",
      matchAnyPost: true,
      pendingNextReel: false,
      postId: null,
      postUrl: null,
      keywords: ["LINK"],
      dmMessage: "Here's your link!",
    });
  });

  it("clears keywords when matchAnyWord is enabled", () => {
    const payload = buildAutomationPayload({
      ...baseDraft,
      matchAnyWord: true,
      keywords: ["LINK", "GUIDE"],
    });
    expect(payload.keywords).toEqual([]);
    expect(payload.matchAnyWord).toBe(true);
  });

  it("only includes a specific postId/postUrl for specific targeting", () => {
    const payload = buildAutomationPayload({
      ...baseDraft,
      triggerScope: "specific",
      postId: "post_1",
      postUrl: "https://instagram.com/p/abc",
    });
    expect(payload.postId).toBe("post_1");
    expect(payload.postUrl).toBe("https://instagram.com/p/abc");
    expect(payload.matchAnyPost).toBe(false);
  });

  it("nulls out follow-prompt fields when follow-gating is disabled", () => {
    const payload = buildAutomationPayload({
      ...baseDraft,
      requireFollow: false,
      followPromptMessage: "should be ignored",
    });
    expect(payload.followPromptMessage).toBe("");
  });

  it("filters blank public reply variants", () => {
    const payload = buildAutomationPayload({
      ...baseDraft,
      publicReplyEnabled: true,
      publicReplyMessages: ["Sent you a DM!", "  ", "Check your inbox"],
    });
    expect(payload.publicReplyMessages).toEqual([
      "Sent you a DM!",
      "Check your inbox",
    ]);
  });
});
