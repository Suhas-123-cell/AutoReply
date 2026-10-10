import { headers } from "next/headers";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBearerSessionUserId } from "@/lib/auth/bearer";
import { hasVerifiedPhone } from "@/lib/auth/phone-verification";
import { canonicalizeEmail } from "@/lib/auth/identity";

type AdapterPrismaClient = Parameters<typeof PrismaAdapter>[0];

export const authConfig = {
  adapter: PrismaAdapter(prisma as unknown as AdapterPrismaClient),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? "missing-resend-api-key",
      from: process.env.EMAIL_FROM ?? "AutoReply <login@example.com>",
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        if (user.email) {
          await prisma.user.update({
            where: { id: user.id },
            data: { canonicalEmail: canonicalizeEmail(user.email) },
          });
        }
        await ensureWorkspaceForUser(user.id, user.email);
      }
    },
  },
  session: {
    strategy: "database",
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Raw identity is available only to onboarding, session bootstrap, and account
// deletion. Workspace routes use getCurrentUserId() below.
export async function getAuthenticatedUserId(): Promise<string | null> {
  // Mobile clients authenticate with a Bearer session token instead of a
  // cookie (see lib/auth/bearer.ts). A web request never sends this header,
  // so getBearerSessionUserId() returns null immediately with zero I/O and
  // this falls through to the original cookie-based auth() check below —
  // byte-identical behavior for the web app.
  const bearerUserId = await getBearerSessionUserId();
  if (bearerUserId) return bearerUserId;

  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneVerified: true },
  });
  return hasVerifiedPhone(user) ? userId : null;
}

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const requestedWorkspaceId = (await headers()).get("x-workspace-id");
  const workspace = await getPrimaryWorkspace(userId, requestedWorkspaceId);
  if (workspace) return workspace.id;
  if (requestedWorkspaceId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const createdWorkspace = await ensureWorkspaceForUser(userId, user?.email);
  return createdWorkspace.id;
}
