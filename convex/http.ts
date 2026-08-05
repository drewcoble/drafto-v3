import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { exchangeYahooCode, requireAppBaseUrl } from "./yahoo/client";

const http = httpRouter();

auth.addHttpRoutes(http);

function yahooRedirectTarget(
  appBaseUrl: string,
  seasonId: string | undefined,
): string {
  return seasonId
    ? `${appBaseUrl}/season/${seasonId}/settings`
    : `${appBaseUrl}/`;
}

// Yahoo redirects the bare browser here after the user approves (or denies)
// access on Yahoo's own consent screen - see convex/yahoo/oauth.ts's
// startYahooAuth (which generates the `state` this route validates) and
// YAHOO.md at the project root for the redirect-URI registration this
// depends on. Not authenticated by necessity (a top-level browser navigation
// carries no Convex auth session) - the one-time `state` row is what maps
// this request back to a specific app user instead.
http.route({
  path: "/yahoo/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const appBaseUrl = requireAppBaseUrl();

    if (!code || !state) {
      return Response.redirect(
        `${appBaseUrl}/?yahooError=${encodeURIComponent("Missing code or state from Yahoo.")}`,
        302,
      );
    }

    const stateRow = await ctx.runMutation(
      internal.yahoo.oauth.consumeOAuthState,
      { state },
    );
    if (!stateRow) {
      return Response.redirect(
        `${appBaseUrl}/?yahooError=${encodeURIComponent("This Yahoo connection attempt expired - try again.")}`,
        302,
      );
    }

    const target = yahooRedirectTarget(appBaseUrl, stateRow.seasonId);
    try {
      const tokens = await exchangeYahooCode(code);
      await ctx.runMutation(internal.yahoo.oauth.saveTokens, {
        userId: stateRow.userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      return Response.redirect(
        `${target}?yahooError=${encodeURIComponent(message)}`,
        302,
      );
    }

    return Response.redirect(`${target}?yahooConnected=1`, 302);
  }),
});

export default http;
