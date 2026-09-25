import { prisma } from "@/lib/db/client";
import { getUserMedia, type InstagramMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

// Shared by the worker and the authenticated cron fallback. Conditional writes
// prevent overlapping sweeps from rebinding a campaign. The legacy column name
// pendingNextReel is retained for compatibility; it now includes feed posts.
export async function attachNextPosts() {
  const pending = await prisma.automation.findMany({
    where: { pendingNextReel: true, isActive: true },
    include: { instagramAccount: true },
  });

  // Group by connected account so we fetch each account's media only once.
  const byAccount = new Map<
    string,
    { account: (typeof pending)[number]["instagramAccount"]; automations: typeof pending }
  >();
  for (const automation of pending) {
    const key = automation.instagramAccountId;
    const entry = byAccount.get(key);
    if (entry) entry.automations.push(automation);
    else byAccount.set(key, { account: automation.instagramAccount, automations: [automation] });
  }

  let bound = 0;
  let checked = 0;
  const failures: string[] = [];

  for (const { account, automations } of byAccount.values()) {
    checked += automations.length;
    if (!account?.accessToken) continue;

    let posts: InstagramMedia[];
    try {
      const token = decryptToken(account.accessToken);
      const media = await getUserMedia(token, 25);
      posts = media
        .filter((post) => post.media_product_type !== "STORY")
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    } catch (err) {
      failures.push(account.id);
      console.error("[attach-next-reel] media fetch failed", account.id, err);
      continue;
    }

    for (const automation of automations) {
      // Bind the first feed post or reel published after campaign creation.
      const nextReel = posts.find(
        (reel) => new Date(reel.timestamp) > automation.createdAt
      );
      if (!nextReel) continue;

      const updated = await prisma.automation.updateMany({
        where: { id: automation.id, pendingNextReel: true, isActive: true },
        data: {
          postId: nextReel.id,
          postUrl: nextReel.permalink ?? null,
          pendingNextReel: false,
        },
      });
      bound += updated.count;
    }
  }

  return { checked, bound, failedAccounts: failures.length };
}
