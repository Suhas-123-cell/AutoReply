/**
 * Shared user-provisioning logic for the mobile OTP sign-in flow.
 *
 * Mirrors what Auth.js does for a web magic-link sign-in
 * (PrismaAdapter creates the User, then lib/auth.ts's `events.createUser`
 * calls ensureWorkspaceForUser) but as a plain function, since a direct
 * `prisma.user.create` here does NOT fire Auth.js adapter events.
 */

import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import type { User, Workspace } from "@/app/generated/prisma/client";

export async function provisionUserByEmail(
  email: string
): Promise<{ user: User; workspace: Workspace }> {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: { email, emailVerified: new Date() },
    });
  } else if (!user.emailVerified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
  }

  const workspace = await ensureWorkspaceForUser(user.id, user.email);

  return { user, workspace };
}

/** Same shape as provisionUserByEmail, keyed by phone instead. */
export async function provisionUserByPhone(
  phone: string
): Promise<{ user: User; workspace: Workspace }> {
  let user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    user = await prisma.user.create({
      data: { phone, phoneVerified: new Date() },
    });
  } else if (!user.phoneVerified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { phoneVerified: new Date() },
    });
  }

  const workspace = await ensureWorkspaceForUser(user.id, user.email);

  return { user, workspace };
}

/**
 * Google Sign-In: find-or-link-or-create via the existing Auth.js `Account`
 * table (provider="google", providerAccountId=Google's `sub`) — reusing that
 * table rather than a bespoke googleId column means the web app's NextAuth
 * config can add a Google provider later and both paths recognize the same
 * linked account with zero migration.
 */
export async function provisionUserByGoogleAccount(input: {
  googleSub: string;
  email: string | null;
  name: string | null;
}): Promise<{ user: User; workspace: Workspace }> {
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: input.googleSub,
      },
    },
    include: { user: true },
  });

  let user: User;

  if (existingAccount) {
    user = existingAccount.user;
  } else {
    // Link to an existing email-matched user (e.g. they signed up via email
    // first) rather than creating a duplicate account for the same person.
    const existingByEmail = input.email
      ? await prisma.user.findUnique({ where: { email: input.email } })
      : null;

    user =
      existingByEmail ??
      (await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          emailVerified: input.email ? new Date() : null,
        },
      }));

    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: input.googleSub,
      },
    });
  }

  const workspace = await ensureWorkspaceForUser(user.id, user.email);

  return { user, workspace };
}
