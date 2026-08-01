import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Draft state for the multi-step campaign creation wizard
 * (mobile/app/(app)/campaigns/new/**). Field names mirror
 * createAutomationSchema in app/api/automations/route.ts exactly, so
 * buildAutomationPayload() in src/lib/campaign-validation.js can hand the
 * draft straight to POST /api/automations.
 *
 * Persisted (via AsyncStorage, see mobile/package.json comment for why) so
 * backgrounding the app or navigating back/forward through steps never
 * loses progress. Cleared on successful submit or explicit cancel.
 */
const initialDraft = {
  instagramAccountId: null,

  // Step 1: trigger scope
  triggerScope: "any", // "specific" | "any" | "next"
  postId: null,
  postUrl: null,
  postThumb: null,
  postCaption: "",

  // Step 2: keywords
  keywords: [],
  matchAnyWord: false,
  wholeWordMatch: true,

  // Step 3: opening DM + follow gate
  openingDmEnabled: false,
  openingDmMessage: "",
  openingDmButtonLabel: "",
  requireFollow: false,
  followPromptMessage: "",
  followPromptButtonLabel: "i'm following",

  // Step 4: reveal DM + tracked links
  dmMessage: "",
  trackedDestinationUrl: "",
  linkButtonLabel: "Open link",
  secondaryDestinationUrl: "",
  secondaryButtonLabel: "Open link",

  // Step 5: follow-up + public reply + name/active
  followUpEnabled: false,
  followUpMessage: "",
  publicReplyEnabled: false,
  publicReplyMessages: [""],
  name: "",
  isActive: true,
};

export const useCampaignWizardStore = create(
  persist(
    (set) => ({
      draft: initialDraft,

      setField: (key, value) =>
        set((state) => ({ draft: { ...state.draft, [key]: value } })),

      setFields: (patch) =>
        set((state) => ({ draft: { ...state.draft, ...patch } })),

      reset: () => set({ draft: initialDraft }),
    }),
    {
      name: "campaign-wizard-draft",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ draft: state.draft }),
    }
  )
);
