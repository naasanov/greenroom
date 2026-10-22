const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface LoginPageInput {
  redirectUri: string;
  state: string;
  email?: string;
  demo?: boolean;
  error?: string;
}

export function renderLoginPage(i: LoginPageInput): string {
  const err = i.error
    ? `<p class="err" role="alert">${escapeHtml(i.error)}</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Greenroom staging sign-in</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f6f5f2;color:#1b1b1b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{width:100%;max-width:380px;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 8px rgba(0,0,0,.1)}
h1{font-size:20px;margin:0 0 8px}
p{margin:0 0 16px;font-size:14px;color:#555}
label{display:block;font-size:14px;margin:12px 0 4px}
input[type=email],input[type=password]{width:100%;font-size:16px;padding:10px;border:1px solid #bbb;border-radius:8px}
.check{display:flex;align-items:center;gap:8px;margin:16px 0}
.check label{margin:0}
button{width:100%;font-size:16px;padding:12px;border:0;border-radius:8px;background:#1b1b1b;color:#fff}
.err{color:#b00020}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}main{background:#222}p{color:#aaa}input[type=email],input[type=password]{background:#111;color:#eee;border-color:#555}button{background:#eee;color:#111}.err{color:#ff8a80}}
</style></head><body><main>
<h1>Greenroom staging sign-in</h1>
<p>This replaces Google sign-in on staging. Enter your email and the staging passcode.</p>
${err}
<form method="post" action="/fake-google/authorize">
<input type="hidden" name="redirect_uri" value="${escapeHtml(i.redirectUri)}">
<input type="hidden" name="state" value="${escapeHtml(i.state)}">
<label for="email">Email</label>
<input id="email" name="email" type="email" required autocomplete="email" value="${escapeHtml(i.email ?? "")}">
<label for="passcode">Passcode</label>
<input id="passcode" name="passcode" type="password" required autocomplete="current-password">
<div class="check"><input id="demo" name="demo" type="checkbox" value="1"${i.demo === false ? "" : " checked"}><label for="demo">Create a demo band if I have none</label></div>
<button type="submit">Sign in</button>
</form></main></body></html>`;
}
