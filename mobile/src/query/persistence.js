import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { queryClient } from "./client";

const KEY = "autoreply.dashboard-cache.v1";
const MAX_AGE = 24 * 60 * 60 * 1000;
let activeScope = null;
let stop = null;
let storageWork = Promise.resolve();

// Serialize storage work so an old workspace's pending save cannot resurrect
// its cache after logout. Persist dashboard totals only, never conversations.
function write(work) {
  storageWork = storageWork.then(work, work).catch(() => {});
  return storageWork;
}

export function sanitizePersistedClient(client) {
  return {
    ...client,
    clientState: {
      mutations: [],
      queries: client.clientState.queries
        .filter((q) => q.queryKey[0] === "dashboard-stats")
        .map((q) => {
          const data = q.state.data ?? {};
          return {
            ...q,
            state: {
              ...q.state,
              data: {
                contactsCount: data.contactsCount ?? 0,
                totalAutomations: data.totalAutomations ?? 0,
                activeAutomations: data.activeAutomations ?? 0,
                dmsSentToday: data.dmsSentToday ?? 0,
                dmsSentWeek: data.dmsSentWeek ?? 0,
                dmsSentMonth: data.dmsSentMonth ?? 0,
                dmsSkippedMonth: data.dmsSkippedMonth ?? 0,
                dmsFailedMonth: data.dmsFailedMonth ?? 0,
                totalDMs: data.totalDMs ?? 0,
                clicksThisMonth: data.clicksThisMonth ?? 0,
                totalClicks: data.totalClicks ?? 0,
                ctrThisMonth: data.ctrThisMonth ?? 0,
                dailyDMs: data.dailyDMs ?? [],
                // Preserve only enough shape to avoid showing the new-account
                // connect screen while offline; usernames and activity stay out
                // of unencrypted AsyncStorage.
                instagramAccounts: (data.instagramAccounts ?? []).map(() => ({ id: "offline" })),
                recentLogs: [],
                topKeywords: [],
              },
            },
          };
        }),
    },
  };
}

export async function clearWorkspaceCache() {
  stop?.();
  stop = null;
  activeScope = null;
  await write(() => AsyncStorage.removeItem(KEY));
}

export async function startWorkspaceCache(scope, restore = false) {
  if (activeScope === scope) return;
  stop?.();
  activeScope = scope;
  const persister = {
    persistClient(client) {
      const json = JSON.stringify(sanitizePersistedClient(client));
      return write(() => activeScope === scope ? AsyncStorage.setItem(KEY, json) : undefined);
    },
    async restoreClient() {
      await storageWork;
      const json = await AsyncStorage.getItem(KEY);
      return activeScope === scope && json ? JSON.parse(json) : undefined;
    },
    removeClient() { return write(() => AsyncStorage.removeItem(KEY)); },
  };
  if (restore) {
    await persistQueryClientRestore({ queryClient, persister, buster: scope, maxAge: MAX_AGE });
  } else {
    // Online authorization takes precedence over any old account grants.
    await persister.removeClient();
  }
  if (activeScope !== scope) return;
  stop = persistQueryClientSubscribe({
    queryClient, persister, buster: scope,
    dehydrateOptions: {
      shouldDehydrateMutation: () => false,
      shouldDehydrateQuery: (q) => q.queryKey[0] === "dashboard-stats" && q.state.status === "success",
    },
  });
}
