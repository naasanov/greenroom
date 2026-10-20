import { memberships, bands } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

/** An API client authenticated as this email (user created if needed). */
async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const ctx: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api: ctx };
}

const anon = () => pwRequest.newContext({ baseURL: API_URL });

test("create band makes the creator admin; list shows my bands", async ({
  testApi,
}) => {
  const { user, api } = await client(testApi, "a@example.com");
  const res = await api.post("/bands", { data: { name: "The Foxes" } });
  expect(res.status()).toBe(201);
  const band = await res.json();
  expect(band).toMatchObject({
    name: "The Foxes",
    slug: "the-foxes",
    role: "admin",
    photoUrl: null,
  });
  const members = await (await api.get(`/bands/${band.id}/members`)).json();
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({ userId: user.id, role: "admin" });
  expect((await api.post("/bands", { data: { name: " " } })).status()).toBe(
    400,
  );

  const second = await (
    await api.post("/bands", { data: { name: "Other" } })
  ).json();
  const list = await (await api.get("/bands")).json();
  expect(list.map((b: { id: string }) => b.id).sort()).toEqual(
    [band.id, second.id].sort(),
  );
  await api.dispose();
});

test("slugs stay unique", async ({ testApi }) => {
  const { api } = await client(testApi, "a@example.com");
  const one = await (
    await api.post("/bands", { data: { name: "Dupes!" } })
  ).json();
  const two = await (
    await api.post("/bands", { data: { name: "Dupes!" } })
  ).json();
  expect(one.slug).toBe("dupes");
  expect(two.slug).toMatch(/^dupes-[0-9a-f]{6}$/);
  await api.dispose();
});

test("list spans multiple memberships and excludes left bands", async ({
  testApi,
}) => {
  const seeded = await testApi.seed("band");
  const { api } = await client(testApi, "ben@example.com");
  const list = await (await api.get("/bands")).json();
  expect(list).toHaveLength(2);
  expect(list.map((b: { role: string }) => b.role).sort()).toEqual([
    "admin",
    "member",
  ]);
  const side = list.find(
    (b: { id: string }) => b.id === seeded.bands.sideProject.id,
  );
  await api.post(`/bands/${side.id}/leave`, { data: { deleteBand: true } });
  expect(await (await api.get("/bands")).json()).toHaveLength(1);
  await api.dispose();
});

test("band details and admin patch", async ({ testApi }) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const ava = await client(testApi, "ava@example.com");
  const ben = await client(testApi, "ben@example.com");
  const detail = await (await ben.api.get(`/bands/${id}`)).json();
  expect(detail).toMatchObject({ name: "The Night Owls", role: "member" });

  const patched = await ava.api.patch(`/bands/${id}`, {
    data: {
      name: "Night Owls!",
      bio: "Hi",
      socialLinks: { instagram: "https://instagram.com/owls" },
      bookingContact: "book@owls.test",
      photoUrl: "https://example.com/p.png",
    },
  });
  expect(patched.status()).toBe(200);
  expect(await patched.json()).toMatchObject({
    name: "Night Owls!",
    bio: "Hi",
    bookingContact: "book@owls.test",
    socialLinks: { instagram: "https://instagram.com/owls" },
  });
  expect(
    (
      await ava.api.patch(`/bands/${id}`, { data: { photoUrl: "nope" } })
    ).status(),
  ).toBe(400);
  await ava.api.dispose();
  await ben.api.dispose();
});

test("non-members get 404 and members get 403 on admin routes", async ({
  testApi,
}) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const outsider = await client(testApi, "outsider@example.com");
  const cleo = await client(testApi, "cleo@example.com");
  const anonymous = await anon();

  expect((await anonymous.get(`/bands/${id}`)).status()).toBe(401);
  for (const [method, path] of [
    ["get", `/bands/${id}`],
    ["get", `/bands/${id}/members`],
    ["get", `/bands/${id}/invite`],
    ["patch", `/bands/${id}`],
    ["post", `/bands/${id}/invite/reset`],
    ["get", "/bands/not-a-uuid"],
  ] as const) {
    const res = await outsider.api[method](path, { data: {} });
    expect(res.status(), `${method} ${path}`).toBe(404);
  }

  expect((await cleo.api.get(`/bands/${id}/members`)).status()).toBe(200);
  expect((await cleo.api.get(`/bands/${id}/invite`)).status()).toBe(200);
  const ava = seeded.users.ava.id;
  for (const [method, path] of [
    ["patch", `/bands/${id}`],
    ["post", `/bands/${id}/invite/reset`],
    ["patch", `/bands/${id}/members/${ava}`],
    ["delete", `/bands/${id}/members/${ava}`],
  ] as const) {
    const res = await cleo.api[method](path, { data: { role: "member" } });
    expect(res.status(), `${method} ${path}`).toBe(403);
  }
  await Promise.all([
    outsider.api.dispose(),
    cleo.api.dispose(),
    anonymous.dispose(),
  ]);
});

test("invite link: view, accept (existing and new account), idempotent", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const ava = await client(testApi, "ava@example.com");
  const invite = await (await ava.api.get(`/bands/${id}/invite`)).json();
  expect(invite.token).toBeTruthy();
  expect(invite.url).toContain(invite.token);
  expect(await (await ava.api.get(`/bands/${id}/invite`)).json()).toEqual(
    invite,
  );

  const anonymous = await anon();
  const preview = await anonymous.get(`/invites/${invite.token}`);
  expect(await preview.json()).toEqual({
    band: { name: "The Night Owls", photoUrl: null },
    memberCount: 4,
  });
  expect((await anonymous.get("/invites/unknown")).status()).toBe(404);
  expect(
    (await anonymous.post(`/invites/${invite.token}/accept`)).status(),
  ).toBe(401);

  // Existing account (Ben has the side project only, so use a fresh account too).
  const existing = await client(testApi, "existing@example.com");
  const joined = await existing.api.post(`/invites/${invite.token}/accept`);
  expect(joined.status()).toBe(200);
  expect(await joined.json()).toMatchObject({ id, role: "member" });
  const again = await existing.api.post(`/invites/${invite.token}/accept`);
  expect(again.status()).toBe(200);
  const rows = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, existing.user.id));
  expect(rows).toHaveLength(1);

  // Brand-new account created by the login helper, then accepts.
  const fresh = await client(testApi, "brand-new@example.com");
  expect(await (await fresh.api.get("/bands")).json()).toEqual([]);
  const accepted = await fresh.api.post(`/invites/${invite.token}/accept`);
  expect(await accepted.json()).toMatchObject({ id, name: "The Night Owls" });
  expect(
    (await (await anonymous.get(`/invites/${invite.token}`)).json())
      .memberCount,
  ).toBe(6);
  await Promise.all([
    ava.api.dispose(),
    existing.api.dispose(),
    fresh.api.dispose(),
    anonymous.dispose(),
  ]);
});

test("reset invalidates the old link", async ({ testApi }) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const ava = await client(testApi, "ava@example.com");
  const old = await (await ava.api.get(`/bands/${id}/invite`)).json();
  const reset = await ava.api.post(`/bands/${id}/invite/reset`);
  expect(reset.status()).toBe(200);
  const next = await reset.json();
  expect(next.token).not.toBe(old.token);
  expect((await ava.api.get(`/bands/${id}/invite`)).status()).toBe(200);
  expect((await (await ava.api.get(`/bands/${id}/invite`)).json()).token).toBe(
    next.token,
  );
  const joiner = await client(testApi, "joiner@example.com");
  expect((await joiner.api.post(`/invites/${old.token}/accept`)).status()).toBe(
    404,
  );
  expect((await joiner.api.get(`/invites/${old.token}`)).status()).toBe(404);
  expect(
    (await joiner.api.post(`/invites/${next.token}/accept`)).status(),
  ).toBe(200);
  await Promise.all([ava.api.dispose(), joiner.api.dispose()]);
});

test("promote, demote, remove, and last-admin protection", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const { ava, ben, cleo } = seeded.users;
  const a = await client(testApi, ava.email);

  const demoteLast = await a.api.patch(`/bands/${id}/members/${ava.id}`, {
    data: { role: "member" },
  });
  expect(demoteLast.status()).toBe(409);
  expect((await demoteLast.json()).code).toBe("LAST_ADMIN");

  expect(
    (
      await a.api.patch(`/bands/${id}/members/${ben.id}`, {
        data: { role: "admin" },
      })
    ).status(),
  ).toBe(204);
  const members = await (await a.api.get(`/bands/${id}/members`)).json();
  expect(
    members.find((m: { userId: string }) => m.userId === ben.id).role,
  ).toBe("admin");
  expect(
    (
      await a.api.patch(`/bands/${id}/members/${ava.id}`, {
        data: { role: "member" },
      })
    ).status(),
  ).toBe(204);
  // Ava is now a plain member: admin routes are 403.
  expect(
    (
      await a.api.patch(`/bands/${id}/members/${cleo.id}`, {
        data: { role: "admin" },
      })
    ).status(),
  ).toBe(403);

  const b = await client(testApi, ben.email);
  expect(
    (
      await b.api.patch(`/bands/${id}/members/${ben.id}`, {
        data: { role: "member" },
      })
    ).status(),
  ).toBe(409);
  expect((await b.api.delete(`/bands/${id}/members/${ben.id}`)).status()).toBe(
    409,
  );
  expect((await b.api.delete(`/bands/${id}/members/${cleo.id}`)).status()).toBe(
    204,
  );
  expect((await b.api.delete(`/bands/${id}/members/${cleo.id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await b.api.patch(`/bands/${id}/members/${cleo.id}`, {
        data: { role: "admin" },
      })
    ).status(),
  ).toBe(404);

  const left = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, cleo.id));
  expect(left[0]!.leftAt).not.toBeNull();
  const cleoClient = await client(testApi, cleo.email);
  expect((await cleoClient.api.get(`/bands/${id}`)).status()).toBe(404);
  await Promise.all([
    a.api.dispose(),
    b.api.dispose(),
    cleoClient.api.dispose(),
  ]);
});

test("leave rules: last admin, only member, rejoin", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  const id = seeded.bands.nightOwls.id;
  const a = await client(testApi, seeded.users.ava.email);
  const dev = await client(testApi, seeded.users.dev.email);

  const blocked = await a.api.post(`/bands/${id}/leave`, { data: {} });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe("LAST_ADMIN");

  // A regular member leaves, then rejoins via the invite with a fresh membership.
  expect(
    (await dev.api.post(`/bands/${id}/leave`, { data: {} })).status(),
  ).toBe(204);
  expect((await dev.api.get(`/bands/${id}`)).status()).toBe(404);
  const invite = await (await a.api.get(`/bands/${id}/invite`)).json();
  expect((await dev.api.post(`/invites/${invite.token}/accept`)).status()).toBe(
    200,
  );
  const devRows = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, seeded.users.dev.id));
  expect(devRows).toHaveLength(2);
  expect(devRows.filter((r) => r.leftAt === null)).toHaveLength(1);

  // Solo band: leaving needs deleteBand and deletes the band.
  const solo = await client(testApi, "solo@example.com");
  const band = await (
    await solo.api.post("/bands", { data: { name: "Solo" } })
  ).json();
  const needs = await solo.api.post(`/bands/${band.id}/leave`, { data: {} });
  expect(needs.status()).toBe(409);
  expect((await needs.json()).code).toBe("ONLY_MEMBER_MUST_DELETE");
  expect(
    (
      await solo.api.post(`/bands/${band.id}/leave`, {
        data: { deleteBand: true },
      })
    ).status(),
  ).toBe(204);
  expect(
    await db.select().from(bands).where(eq(bands.id, band.id)),
  ).toHaveLength(0);

  // An admin with a co-admin can leave.
  expect(
    (
      await a.api.patch(`/bands/${id}/members/${seeded.users.ben.id}`, {
        data: { role: "admin" },
      })
    ).status(),
  ).toBe(204);
  expect((await a.api.post(`/bands/${id}/leave`, { data: {} })).status()).toBe(
    204,
  );
  await Promise.all([a.api.dispose(), dev.api.dispose(), solo.api.dispose()]);
});

test("instruments: put/get, ordering, validation, shown on roster", async ({
  testApi,
}) => {
  const { api } = await client(testApi, "mus@example.com");
  expect(await (await api.get("/me/instruments")).json()).toEqual({
    presets: [],
    custom: [],
  });
  const put = await api.put("/me/instruments", {
    data: {
      presets: ["guitar", "vocals", "guitar"],
      custom: ["Theremin", "theremin"],
    },
  });
  expect(put.status()).toBe(200);
  const expected = { presets: ["guitar", "vocals"], custom: ["Theremin"] };
  expect(await put.json()).toEqual(expected);
  expect(await (await api.get("/me/instruments")).json()).toEqual(expected);

  const bad = await api.put("/me/instruments", {
    data: { presets: ["kazoo"], custom: [] },
  });
  expect(bad.status()).toBe(400);
  expect(await (await api.get("/me/instruments")).json()).toEqual(expected);
  expect(
    (
      await api.put("/me/instruments", { data: { presets: [], custom: [""] } })
    ).status(),
  ).toBe(400);

  const band = await (
    await api.post("/bands", { data: { name: "Roster" } })
  ).json();
  const members = await (await api.get(`/bands/${band.id}/members`)).json();
  expect(members[0].instruments).toEqual(expected);
  await api.put("/me/instruments", { data: { presets: [], custom: [] } });
  expect(await (await api.get("/me/instruments")).json()).toEqual({
    presets: [],
    custom: [],
  });
  await api.dispose();
});
