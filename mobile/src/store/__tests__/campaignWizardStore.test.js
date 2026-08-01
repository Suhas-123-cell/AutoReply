import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Minimal in-memory AsyncStorage mock — this suite tests our store's own
// setField/setFields/reset behavior, not Zustand's persist middleware
// itself (that's already tested upstream).
jest.mock("@react-native-async-storage/async-storage", () => {
  let store = {};
  return {
    getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
  };
});

import { useCampaignWizardStore } from "../campaignWizardStore";

const initialDraft = useCampaignWizardStore.getState().draft;

beforeEach(() => {
  useCampaignWizardStore.setState({ draft: initialDraft });
});

describe("campaignWizardStore", () => {
  it("starts with the default any-post, empty-keyword draft", () => {
    const { draft } = useCampaignWizardStore.getState();
    expect(draft.triggerScope).toBe("any");
    expect(draft.keywords).toEqual([]);
    expect(draft.name).toBe("");
    expect(draft.isActive).toBe(true);
  });

  it("setField updates a single field without touching the rest", () => {
    useCampaignWizardStore.getState().setField("name", "Giveaway");

    const { draft } = useCampaignWizardStore.getState();
    expect(draft.name).toBe("Giveaway");
    expect(draft.triggerScope).toBe("any");
  });

  it("setFields merges a patch of multiple fields at once", () => {
    useCampaignWizardStore.getState().setFields({
      triggerScope: "specific",
      postId: "post_1",
      keywords: ["LINK"],
    });

    const { draft } = useCampaignWizardStore.getState();
    expect(draft.triggerScope).toBe("specific");
    expect(draft.postId).toBe("post_1");
    expect(draft.keywords).toEqual(["LINK"]);
  });

  it("reset restores the initial draft, discarding all edits", () => {
    useCampaignWizardStore.getState().setFields({ name: "Something", keywords: ["X"] });
    useCampaignWizardStore.getState().reset();

    const { draft } = useCampaignWizardStore.getState();
    expect(draft).toEqual(initialDraft);
  });

  it("setFields does not mutate fields not present in the patch", () => {
    useCampaignWizardStore.getState().setFields({ dmMessage: "Here you go!" });
    useCampaignWizardStore.getState().setFields({ name: "Giveaway" });

    const { draft } = useCampaignWizardStore.getState();
    expect(draft.dmMessage).toBe("Here you go!");
    expect(draft.name).toBe("Giveaway");
  });
});
