const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderFakeSpotifyPage(i: {
  redirectUri: string;
  state: string;
}): string {
  const hidden = (name: string, value: string): string =>
    `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Greenroom staging Spotify</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f6f5f2;color:#1b1b1b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{width:100%;max-width:380px;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 8px rgba(0,0,0,.1)}
h1{font-size:20px;margin:0 0 8px}
p{margin:0 0 16px;font-size:14px;color:#555}
button{width:100%;font-size:16px;padding:12px;border:0;border-radius:8px;background:#1b1b1b;color:#fff;margin-bottom:8px}
button.secondary{background:transparent;color:inherit;border:1px solid #bbb}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}main{background:#222}p{color:#aaa}button{background:#eee;color:#111}button.secondary{background:transparent;color:#eee;border-color:#555}}
</style></head><body><main>
<h1>Fake Spotify</h1>
<p>Staging uses a stand-in for Spotify login. Connecting links a demo Spotify account so playlist import can be tried.</p>
<form method="get" action="${escapeHtml(i.redirectUri)}">
${hidden("code", "fake-code:demo")}
${hidden("state", i.state)}
<button type="submit">Connect demo Spotify</button>
</form>
<form method="get" action="${escapeHtml(i.redirectUri)}">
${hidden("error", "access_denied")}
${hidden("state", i.state)}
<button type="submit" class="secondary">Cancel</button>
</form>
</main></body></html>`;
}
