import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { verifyOAuthState } from "@/lib/meta/oauth";
import {
  consumeOAuthFlow,
  storeOAuthResult,
  WEB_FLOW_COOKIE,
} from "@/lib/meta/oauth-flow";
import {
  authorizeInstagram,
  connectAuthorizedInstagramAccount,
} from "@/lib/instagram-oauth";
import { legalPage } from "@/lib/legal/page";

type OutcomeStatus =
  | "denied"
  | "invalid"
  | "login"
  | "forbidden"
  | "already_connected"
  | "connected"
  | "authorized"
  | "failed";

export function webOutcomePage(status: OutcomeStatus): Response {
  const title = status === "connected"
    ? "Instagram connected"
    : "Instagram connection was not completed";
  return legalPage(title, "<p>You can close this window and return to AutoReply.</p>");
}

// The mobile app registers this custom scheme and react-native-inappbrowser-
// reborn's openAuth intercepts it. `result` is a one-time code the app
// redeems together with the verifier it received when it started the flow
// (see lib/meta/oauth-flow.ts) — nothing is connected or signed in until then.
function mobileDeepLinkFor(
  status: OutcomeStatus,
  opts?: { reason?: string; result?: string }
): string {
  const params = new URLSearchParams({ status });
  if (opts?.reason) params.set("reason", opts.reason.slice(0, 200));
  if (opts?.result) params.set("result", opts.result);
  return `autoreply://ig-connect?${params.toString()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const isMobile = state?.client === "mobile" || state?.client === "mobile-signup";

  const finish = (status: OutcomeStatus, opts?: { reason?: string; result?: string }) => {
    if (isMobile) return NextResponse.redirect(mobileDeepLinkFor(status, opts));
    const response = webOutcomePage(status);
    response.headers.append(
      "Set-Cookie",
      `${WEB_FLOW_COOKIE}=; Path=/api/instagram/callback; Max-Age=0; HttpOnly; SameSite=Lax`
    );
    return response;
  };

  if (!state) return finish("invalid");

  // Single use: a replayed or forged state finds no flow.
  const flow = await consumeOAuthFlow(state.flowId, state.client);
  if (!flow) return finish("invalid");
  if (error) return finish("denied");
  if (!code) return finish("invalid");

  if (flow.client === "web") {
    // The flow must come back to the browser that started it, signed in as
    // the user who started it.
    if (request.cookies.get(WEB_FLOW_COOKIE)?.value !== state.flowId) {
      return finish("forbidden");
    }
    const session = await auth();
    if (session?.user?.id !== flow.userId) return finish("login");

    try {
      const authorization = await authorizeInstagram(code);
      const outcome = await connectAuthorizedInstagramAccount({
        actingUserId: flow.userId,
        workspaceId: flow.workspaceId,
        authorization,
      });
      return finish(outcome.status);
    } catch (err) {
      console.error("[Instagram Callback] Error:", err);
      await recordConnectFailure(flow.workspaceId, errorMessage(err));
      return finish("failed");
    }
  }

  try {
    const authorization = await authorizeInstagram(code);
    const result = await storeOAuthResult({ ...flow, ...authorization });
    return finish("authorized", { result });
  } catch (err) {
    console.error("[Instagram Callback] Error:", err);
    if (flow.client === "mobile") {
      await recordConnectFailure(flow.workspaceId, errorMessage(err));
    }
    return finish("failed", { reason: errorMessage(err) });
  }
}

// The message is the only diagnostic a self-hoster gets for a failed
// connect, so persist it alongside the other operational events.
async function recordConnectFailure(workspaceId: string, reason: string) {
  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: "ERROR",
        workspaceId,
        message: "Instagram connection failed",
        payload: { reason },
      },
    })
    .catch(() => {});
}
