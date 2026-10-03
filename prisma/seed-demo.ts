import "dotenv/config";
import { getPrisma } from "../lib/db/client";
import { ensureWorkspaceForUser } from "../lib/workspace";

let client: ReturnType<typeof getPrisma> | undefined;

async function main() {
  const email = process.env.DEMO_REVIEWER_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set DEMO_REVIEWER_EMAIL to an inbox the reviewer can access");
  }

  const prisma = getPrisma();
  client = prisma;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "AutoReply Reviewer", emailVerified: new Date() },
    update: {},
  });
  const workspace = await ensureWorkspaceForUser(user.id, user.email);

  const instagramId = `autoreply-demo-instagram-${workspace.id}`;
  const instagram = await prisma.instagramAccount.upsert({
    where: { instagramId },
    create: {
      workspaceId: workspace.id,
      instagramId,
      username: "autoreply_demo",
      name: "AutoReply Demo (sample data)",
      accessToken: "demo-unavailable",
      webhookSubscribed: false,
    },
    update: {},
  });
  const automation = await prisma.automation.upsert({
    where: { id: `autoreply-demo-ig-${workspace.id}` },
    create: {
      id: `autoreply-demo-ig-${workspace.id}`,
      workspaceId: workspace.id,
      instagramAccountId: instagram.id,
      name: "Creator guide (sample data)",
      keywords: ["GUIDE"],
      matchAnyPost: true,
      dmMessage: "Thanks for asking! Here is the creator guide.",
      isActive: false,
    },
    update: {},
  });

  const samples = [
    { id: "sent-1", status: "SENT" as const, text: "Could I get the GUIDE?", name: "Maya", hoursAgo: 2 },
    { id: "sent-2", status: "SENT" as const, text: "GUIDE please", name: "Jordan", hoursAgo: 5 },
    { id: "failed", status: "FAILED" as const, text: "Send the GUIDE", name: "Alex", hoursAgo: 26 },
    { id: "skipped", status: "SKIPPED_NO_MATCH" as const, text: "Great post!", name: "Sam", hoursAgo: 50 },
  ];
  for (const sample of samples) {
    const at = new Date(Date.now() - sample.hoursAgo * 60 * 60 * 1000);
    await prisma.dmLog.upsert({
      where: { automationId_commentId: { automationId: automation.id, commentId: `autoreply-demo-${sample.id}` } },
      create: {
        workspaceId: workspace.id,
        automationId: automation.id,
        instagramAccountId: instagram.id,
        commenterId: `demo-${sample.id}`,
        commenterName: sample.name,
        commentText: sample.text,
        commentId: `autoreply-demo-${sample.id}`,
        matchedKeyword: sample.status === "SKIPPED_NO_MATCH" ? null : "GUIDE",
        status: sample.status,
        dmSentAt: sample.status === "SENT" ? at : null,
        errorMessage: sample.status === "FAILED" ? "Sample delivery error" : null,
        createdAt: at,
      },
      update: {},
    });
  }

  const botId = `autoreply-demo-telegram-${workspace.id}`;
  const telegram = await prisma.telegramAccount.upsert({
    where: { botId },
    create: {
      workspaceId: workspace.id,
      botId,
      botUsername: "autoreply_demo_bot",
      botToken: "demo-unavailable",
      webhookSecret: "demo-unavailable",
    },
    update: {},
  });
  await prisma.telegramAutomation.upsert({
    where: { id: `autoreply-demo-tg-${workspace.id}` },
    create: {
      id: `autoreply-demo-tg-${workspace.id}`,
      workspaceId: workspace.id,
      telegramAccountId: telegram.id,
      name: "Welcome guide (sample data)",
      keywords: ["START", "GUIDE"],
      replyMessage: "Welcome! Reply GUIDE to get the creator checklist.",
      isActive: false,
    },
    update: {},
  });

  console.log(`Seeded sample campaigns and DM activity for ${email} in workspace ${workspace.id}`);
  console.log("Demo connections are inactive. Connect real Instagram and Telegram accounts for live use.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client?.$disconnect();
  });
