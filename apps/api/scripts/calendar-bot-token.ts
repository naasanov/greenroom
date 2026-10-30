/**
 * One-off, run on a laptop: prints the refresh token of the Google account that
 * will own every band calendar. Needs Node 22.18+ (runs TypeScript directly).
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
 *     node apps/api/scripts/calendar-bot-token.ts
 *
 * The OAuth client must allow http://localhost:53682 as a redirect URI.
 */
import { createServer } from "node:http";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/calendar";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.");
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(
  {
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  },
)}`;

const code = await new Promise<string>((resolve, reject) => {
  const server = createServer((req, res) => {
    const params = new URL(req.url ?? "/", REDIRECT_URI).searchParams;
    const got = params.get("code");
    const error = params.get("error");
    if (!got && !error) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(
      got
        ? "Done. You can close this tab and return to the terminal."
        : "Authorization failed.",
    );
    server.close();
    if (got) resolve(got);
    else reject(new Error(`Google returned an error: ${error}`));
  });
  server.on("error", reject);
  server.listen(PORT, "127.0.0.1", () => {
    console.log("Sign in as the bot Google account at this URL:\n");
    console.log(authUrl, "\n");
    console.log(`Waiting for the redirect on ${REDIRECT_URI} ...`);
  });
});

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  }),
});
const body = (await res.json().catch(() => ({}))) as {
  refresh_token?: string;
  error?: string;
};
if (!res.ok || !body.refresh_token) {
  console.error(
    `Token exchange failed (${res.status}${body.error ? `: ${body.error}` : ""}). ` +
      "Remove the app's access at myaccount.google.com/permissions and retry.",
  );
  process.exit(1);
}

console.log("\nRefresh token (store it as a secret, never commit it):\n");
console.log(body.refresh_token);
console.log(
  "\nSet it on staging with:\n  fly secrets set -a greenroom-staging-api CALENDAR_BOT_REFRESH_TOKEN=<token above>",
);
