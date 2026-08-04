/**
 * Hand-written deep-link config, replacing expo-router's implicit file-tree
 * linking. The `openreply://` scheme itself is already registered natively
 * in ios/OpenReply/Info.plist and android/app/src/main/AndroidManifest.xml —
 * this is only the JS-side path -> screen mapping.
 *
 * Today the only real inbound deep link is the Instagram OAuth callback,
 * openreply://ig-connect?status=&reason= (see app/ig-connect.jsx). The rest
 * of the tree is mapped too so the config stays truthful as more deep links
 * are added, but push-notification taps (src/push/register.js) navigate by
 * screen name directly via navigationRef rather than going through this
 * path-based config.
 */
export const linking = {
  prefixes: ["openreply://"],
  config: {
    screens: {
      IgConnect: "ig-connect",
      AppTabs: {
        screens: {
          Dashboard: "dashboard",
          InboxStack: {
            screens: {
              InboxList: "inbox",
              Conversation: "inbox/:conversationId",
            },
          },
          CampaignsStack: {
            screens: {
              CampaignsList: "campaigns",
              CampaignDetail: "campaigns/:id",
              CampaignEdit: "campaigns/edit/:id",
              CampaignNewStack: {
                path: "campaigns/new",
                screens: {
                  CampaignNewStep1: "",
                  CampaignNewStep2: "step-2",
                  CampaignNewStep3: "step-3",
                  CampaignNewStep4: "step-4",
                  CampaignNewStep5: "step-5",
                  PostPicker: "post-picker",
                },
              },
            },
          },
          Activity: "activity",
          MoreStack: {
            screens: {
              MoreMenu: "more",
              Instagram: "more/instagram",
              Members: "more/members",
              Usage: "more/usage",
              Account: "more/account",
              Overview: "more/overview",
              Diagnostics: "more/diagnostics",
              Notifications: "more/notifications",
              Security: "more/security",
            },
          },
        },
      },
      AuthStack: {
        screens: {
          SignIn: "sign-in",
          Verify: "verify",
        },
      },
    },
  },
};
