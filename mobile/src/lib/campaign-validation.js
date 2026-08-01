/**
 * Client-side mirror of createAutomationSchema / updateAutomationSchema's
 * .refine() rules in app/api/automations/route.ts, so the wizard can disable
 * "Next"/"Create" with an inline message instead of letting a request 400.
 * Keep in sync with that file if the schema changes.
 */

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function validateStep1(draft) {
  if (!draft.instagramAccountId) return "Connect an Instagram account first.";
  if (draft.triggerScope === "specific" && !draft.postId) {
    return "Pick a post or reel to trigger the campaign.";
  }
  return null;
}

export function validateStep2(draft) {
  if (!draft.matchAnyWord && draft.keywords.length === 0) {
    return 'Add at least one keyword, or turn on "Match any word".';
  }
  if (draft.keywords.some((k) => k.length > 50)) {
    return "Keywords must be 50 characters or fewer.";
  }
  return null;
}

export function validateStep3(draft) {
  if (
    draft.openingDmEnabled &&
    (!draft.openingDmMessage.trim() || !draft.openingDmButtonLabel.trim())
  ) {
    return "Opening DM needs a message and a button label.";
  }
  if (draft.requireFollow && !draft.followPromptMessage.trim()) {
    return "Add a follow-prompt message, or turn off the follow requirement.";
  }
  return null;
}

export function validateStep4(draft) {
  if (!draft.dmMessage.trim()) return "Add the DM message.";
  if (draft.trackedDestinationUrl.trim() && !isValidUrl(draft.trackedDestinationUrl.trim())) {
    return "The tracked link must be a valid URL.";
  }
  if (
    draft.secondaryDestinationUrl.trim() &&
    !isValidUrl(draft.secondaryDestinationUrl.trim())
  ) {
    return "The second tracked link must be a valid URL.";
  }
  return null;
}

export function validateStep5(draft) {
  if (!draft.name.trim()) return "Name is required.";
  return null;
}

/** Runs every step's rule; used as the edit form's single-shot validation. */
export function validateAll(draft) {
  return (
    validateStep1(draft) ||
    validateStep2(draft) ||
    validateStep3(draft) ||
    validateStep4(draft) ||
    validateStep5(draft)
  );
}

/** Builds the exact JSON body createAutomationSchema/updateAutomationSchema expect. */
export function buildAutomationPayload(draft) {
  return {
    name: draft.name.trim(),
    instagramAccountId: draft.instagramAccountId,
    postId: draft.triggerScope === "specific" ? draft.postId : null,
    postUrl: draft.triggerScope === "specific" ? draft.postUrl : null,
    matchAnyPost: draft.triggerScope === "any",
    pendingNextReel: draft.triggerScope === "next",
    matchAnyWord: draft.matchAnyWord,
    keywords: draft.matchAnyWord ? [] : draft.keywords,
    wholeWordMatch: draft.wholeWordMatch,
    dmMessage: draft.dmMessage.trim(),
    openingDmEnabled: draft.openingDmEnabled,
    openingDmMessage: draft.openingDmEnabled ? draft.openingDmMessage.trim() : null,
    openingDmButtonLabel: draft.openingDmEnabled ? draft.openingDmButtonLabel.trim() : null,
    requireFollow: draft.requireFollow,
    followPromptMessage: draft.requireFollow ? draft.followPromptMessage.trim() : "",
    followPromptButtonLabel: draft.requireFollow
      ? draft.followPromptButtonLabel.trim() || "i'm following"
      : "",
    trackedDestinationUrl: draft.trackedDestinationUrl.trim() || "",
    linkButtonLabel: draft.linkButtonLabel.trim() || "Open link",
    secondaryDestinationUrl: draft.secondaryDestinationUrl.trim() || "",
    secondaryButtonLabel: draft.secondaryButtonLabel.trim() || "Open link",
    followUpEnabled: draft.followUpEnabled,
    followUpMessage: draft.followUpEnabled ? draft.followUpMessage.trim() : "",
    publicReplyEnabled: draft.publicReplyEnabled,
    publicReplyMessages: draft.publicReplyEnabled
      ? draft.publicReplyMessages.map((m) => m.trim()).filter(Boolean)
      : [],
    isActive: draft.isActive,
  };
}
