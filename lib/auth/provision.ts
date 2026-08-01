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
