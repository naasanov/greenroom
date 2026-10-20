import { magicLinkTokens, users } from "@greenroom/db";
import { API_URL, WEB_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

const SESSION = "gr_session";
const noFollow = { maxRedirects: 0 };

async function tokenFrom(link: string): Promise<string> {
  const url = new URL(link);
  expect(url.origin + url.pathname).toBe(`${WEB_URL}/auth/callback`);
  return url.searchParams.get("token")!;
}

test("magic link signs a new user in", async ({ request, testApi }) => {
  const email = "new@example.com";
  const res = await request.post(`${API_URL}/auth/magic-link`, {
    data: { email, redirectTo: "/gigs/123" },
  });
  expect(res.status()).toBe(204);
  const [{ link }] = await testApi.magicLinksFor(email);
  const verify = await request.post(`${API_URL}/auth/magic-link/verify`, {
    data: { token: await tokenFrom(link!) },
  });
  expect(verify.status()).toBe(200);
  const body = await verify.json();
  expect(body).toMatchObject({
    isNewUser: true,
    redirectTo: "/gigs/123",
    user: { email },
  });
  expect(verify.headers()["set-cookie"]).toContain(`${SESSION}=`);
  expect(verify.headers()["set-cookie"]).toContain("HttpOnly");

  const me = await request.get(`${API_URL}/auth/me`);
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(email);

  const patch = await request.patch(`${API_URL}/auth/me`, {
    data: { displayName: "Newbie" },
  });
  expect((await patch.json()).displayName).toBe("Newbie");
});

test("magic link is single use and returning users are not new", async ({
  request,
  testApi,
}) => {
  const email = "again@example.com";
  const verifyOnce = async () => {
    await request.post(`${API_URL}/auth/magic-link`, { data: { email } });
    const link = (await testApi.magicLinksFor(email)).at(-1)!.link;
    const token = await tokenFrom(link);
    const first = await request.post(`${API_URL}/auth/magic-link/verify`, {
      data: { token },
    });
    const second = await request.post(`${API_URL}/auth/magic-link/verify`, {
      data: { token },
    });
    return { first, second };
  };
  const a = await verifyOnce();
  expect(a.first.status()).toBe(200);
  expect(a.second.status()).toBe(401);
  const b = await verifyOnce();
  expect((await b.first.json()).isNewUser).toBe(false);
});

test("invalid, expired and malformed tokens are rejected", async ({
  request,
  testApi,
  db,
}) => {
  const bad = await request.post(`${API_URL}/auth/magic-link/verify`, {
    data: { token: "nope" },
  });
  expect(bad.status()).toBe(401);
  const malformed = await request.post(`${API_URL}/auth/magic-link/verify`, {
    data: {},
  });
  expect(malformed.status()).toBe(400);

  const email = "late@example.com";
  await request.post(`${API_URL}/auth/magic-link`, { data: { email } });
  const token = await tokenFrom((await testApi.magicLinksFor(email))[0]!.link);
  await db
    .update(magicLinkTokens)
    .set({ expiresAt: new Date(Date.now() - 1000) });
  const expired = await request.post(`${API_URL}/auth/magic-link/verify`, {
    data: { token },
  });
  expect(expired.status()).toBe(401);
});

test("magic link request is rate limited per email and never enumerates", async ({
  request,
}) => {
  const email = "spam@example.com";
  const statuses: number[] = [];
  for (let i = 0; i < 7; i++) {
    const res = await request.post(`${API_URL}/auth/magic-link`, {
      data: { email },
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 5)).toEqual([204, 204, 204, 204, 204]);
  expect(statuses.at(-1)).toBe(429);
});

async function googleLogin(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  redirectTo?: string,
) {
  const start = await request.get(`${API_URL}/auth/google/start`, {
    params: redirectTo ? { redirectTo } : {},
    ...noFollow,
  });
  expect(start.status()).toBe(302);
  const location = new URL(start.headers()["location"]!);
  expect(location.host).toBe("fake-accounts.google.test");
  const state = location.searchParams.get("state")!;
  const redirectUri = new URL(location.searchParams.get("redirect_uri")!);
  return request.get(`${API_URL}${redirectUri.pathname}`, {
    params: { code: `fake-code:${email}`, state },
    ...noFollow,
  });
}

test("google sign-in creates then links by email", async ({
  request,
  testApi,
  db,
}) => {
  const first = await googleLogin(request, "g@example.com", "/band/1");
  expect(first.status()).toBe(302);
  expect(first.headers()["location"]).toBe(
    `${WEB_URL}/welcome?redirectTo=${encodeURIComponent("/band/1")}`,
  );

  // A returning Google user goes straight to the destination.
  const returning = await googleLogin(request, "g@example.com", "/band/1");
  expect(returning.headers()["location"]).toBe(`${WEB_URL}/band/1`);
  const me = await request.get(`${API_URL}/auth/me`);
  expect(await me.json()).toMatchObject({ email: "g@example.com" });

  // An existing magic-link-only user is linked by verified email.
  const { user } = await testApi.login("linked@example.com");
  const second = await googleLogin(request, "linked@example.com");
  expect(second.headers()["location"]).toBe(`${WEB_URL}/`);
  const rows = await db.select().from(users);
  const linked = rows.filter((r) => r.email === "linked@example.com");
  expect(linked).toHaveLength(1);
  expect(linked[0]!.id).toBe(user.id);
  expect(linked[0]!.googleSub).toBe("fake-sub-linked");
  expect((await (await request.get(`${API_URL}/auth/me`)).json()).id).toBe(
    user.id,
  );
});

test("google callback rejects bad state and bad codes", async ({ request }) => {
  const noState = await request.get(`${API_URL}/auth/google/callback`, {
    params: { code: "fake-code:x@example.com", state: "garbage" },
    ...noFollow,
  });
  expect(noState.headers()["location"]).toBe(
    `${WEB_URL}/sign-in?error=invalid_state`,
  );
  const badCode = await googleLogin(request, "nobody-at-all");
  expect(badCode.headers()["location"]).toBe(
    `${WEB_URL}/sign-in?error=invalid_code`,
  );
});

test("logout clears the session", async ({ request }) => {
  await googleLogin(request, "out@example.com");
  expect((await request.get(`${API_URL}/auth/me`)).status()).toBe(200);
  const res = await request.post(`${API_URL}/auth/logout`);
  expect(res.status()).toBe(204);
  expect((await request.get(`${API_URL}/auth/me`)).status()).toBe(401);
});

test("protected routes need a session; public ones do not", async ({
  playwright,
}) => {
  const anon = await playwright.request.newContext();
  expect((await anon.get(`${API_URL}/auth/me`)).status()).toBe(401);
  expect((await anon.patch(`${API_URL}/auth/me`, { data: {} })).status()).toBe(
    401,
  );
  expect((await anon.get(`${API_URL}/health`)).status()).toBe(200);
  await anon.dispose();
});

test("unsafe redirectTo values fall back to /", async ({
  request,
  testApi,
}) => {
  const unsafe = [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ];
  for (const redirectTo of unsafe) {
    const res = await googleLogin(request, "r@example.com", redirectTo);
    const location = res.headers()["location"];
    expect([`${WEB_URL}/`, `${WEB_URL}/welcome?redirectTo=%2F`]).toContain(
      location,
    );
  }
  await request.post(`${API_URL}/auth/magic-link`, {
    data: { email: "r2@example.com", redirectTo: "//evil.example" },
  });
  const link = (await testApi.magicLinksFor("r2@example.com"))[0]!.link;
  const verify = await request.post(`${API_URL}/auth/magic-link/verify`, {
    data: { token: await tokenFrom(link) },
  });
  expect((await verify.json()).redirectTo).toBe("/");
});

test("cors allows the web origin only", async ({ request }) => {
  const ok = await request.get(`${API_URL}/health`, {
    headers: { Origin: WEB_URL },
  });
  expect(ok.headers()["access-control-allow-origin"]).toBe(WEB_URL);
  expect(ok.headers()["access-control-allow-credentials"]).toBe("true");
  const other = await request.get(`${API_URL}/health`, {
    headers: { Origin: "https://evil.example" },
  });
  expect(other.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("loginAs gives the browser context a working session", async ({
  loginAs,
  context,
  request,
}) => {
  const { user } = await loginAs("helper@example.com");
  const cookies = await context.cookies(WEB_URL);
  expect(cookies.find((c) => c.name === SESSION)).toBeTruthy();
  const me = await context.request.get(`${API_URL}/auth/me`);
  expect((await me.json()).id).toBe(user.id);
  expect((await request.get(`${API_URL}/auth/me`)).status()).toBe(401);
});
