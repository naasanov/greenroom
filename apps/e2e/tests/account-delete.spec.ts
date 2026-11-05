import { gigLineup, memberships, users, bands } from "@greenroom/db";
import { eq } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

async function newBand(testApi: TestApi, email: string, name: string) {
  const c = await client(testApi, email);
  const res = await c.api.post("/bands", { data: { name } });
  expect(res.status()).toBe(201);
  const band = (await res.json()) as { id: string };
  return { ...c, bandId: band.id };
}

/** Adds an existing user to the band directly in the DB, as admin or member. */
async function join(
  db: Parameters<Parameters<typeof test>[2]>[0]["db"],
  bandId: string,
  userId: string,
  role: "admin" | "member",
) {
  const [m] = await db
    .insert(memberships)
    .values({ bandId, userId, role })
    .returning();
  return m!;
}

const DELETE = { confirm: "DELETE" };

test.describe("account deletion API", () => {
  test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

  test("unauthenticated and wrong confirmation are rejected", async ({
    testApi,
  }) => {
    const anon = await pwRequest.newContext({ baseURL: API_URL });
    expect((await anon.delete("/users/me", { data: DELETE })).status()).toBe(
      401,
    );
    expect((await anon.get("/users/me/deletion-preview")).status()).toBe(401);
    await anon.dispose();

    const a = await newBand(testApi, "wrong@example.com", "Keepers");
    for (const data of [{}, { confirm: "delete" }, { confirm: "yes" }]) {
      expect((await a.api.delete("/users/me", { data })).status()).toBe(400);
    }
    expect((await a.api.get("/auth/me")).status()).toBe(200);
    expect((await a.api.get("/bands")).status()).toBe(200);
    expect(await (await a.api.get("/bands")).json()).toHaveLength(1);
  });

  test("the sole member deletes the account: band gone, sign-in is a fresh account", async ({
    testApi,
    db,
  }) => {
    const a = await newBand(testApi, "solo@example.com", "Solo Act");
    const preview = await (
      await a.api.get("/users/me/deletion-preview")
    ).json();
    expect(preview).toEqual({
      deleteBands: [{ id: a.bandId, name: "Solo Act" }],
      leaveBands: [],
      blockedBands: [],
    });

    const res = await a.api.delete("/users/me", { data: DELETE });
    expect(res.status()).toBe(204);
    expect(res.headers()["set-cookie"] ?? "").toContain("Expires=");

    expect((await a.api.get("/auth/me")).status()).toBe(401);
    expect(await db.select().from(bands).where(eq(bands.id, a.bandId))).toEqual(
      [],
    );
    const [row] = await db.select().from(users).where(eq(users.id, a.user.id));
    expect(row?.email).not.toBe("solo@example.com");
    expect(row?.googleSub).toBeNull();

    const again = await client(testApi, "solo@example.com");
    expect(again.user.id).not.toBe(a.user.id);
    expect(await (await again.api.get("/bands")).json()).toEqual([]);
  });

  test("a shared band keeps its history when a non-last admin deletes their account", async ({
    testApi,
    db,
  }) => {
    const a = await newBand(testApi, "owner@example.com", "Duo");
    const b = await client(testApi, "leaver@example.com");
    const bMem = await join(db, a.bandId, b.user.id, "admin");
    const aMem = (
      await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, a.user.id))
    )[0]!;
    const gig = (await (
      await a.api.post(`/bands/${a.bandId}/gigs`, {
        data: { title: "Past Gig", date: "2026-01-10" },
      })
    ).json()) as { id: string };
    await a.api.put(`/bands/${a.bandId}/gigs/${gig.id}/lineup`, {
      data: { membershipIds: [aMem.id, bMem.id] },
    });

    expect((await b.api.delete("/users/me", { data: DELETE })).status()).toBe(
      204,
    );

    expect(
      await db.select().from(bands).where(eq(bands.id, a.bandId)),
    ).toHaveLength(1);
    const [left] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, bMem.id));
    expect(left?.leftAt).not.toBeNull();
    const lineup = await db
      .select({ name: users.displayName })
      .from(gigLineup)
      .innerJoin(memberships, eq(memberships.id, gigLineup.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(gigLineup.gigId, gig.id));
    expect(lineup.map((l) => l.name).sort()).toEqual(["leaver", "owner"]);

    const members = (await (
      await a.api.get(`/bands/${a.bandId}/members`)
    ).json()) as { userId: string }[];
    expect(members.map((m) => m.userId)).toEqual([a.user.id]);
  });

  test("the last admin of a band with other members is blocked and nothing changes", async ({
    testApi,
    db,
  }) => {
    const a = await newBand(testApi, "boss@example.com", "Crew");
    const solo = await a.api.post("/bands", { data: { name: "My Solo" } });
    const soloId = ((await solo.json()) as { id: string }).id;
    const m = await client(testApi, "member@example.com");
    await join(db, a.bandId, m.user.id, "member");

    const preview = await (
      await a.api.get("/users/me/deletion-preview")
    ).json();
    expect(preview).toEqual({
      deleteBands: [{ id: soloId, name: "My Solo" }],
      leaveBands: [],
      blockedBands: [{ id: a.bandId, name: "Crew" }],
    });

    const res = await a.api.delete("/users/me", { data: DELETE });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "ACCOUNT_LAST_ADMIN",
      bands: [{ id: a.bandId, name: "Crew" }],
    });

    expect((await a.api.get("/auth/me")).status()).toBe(200);
    expect(await (await a.api.get("/bands")).json()).toHaveLength(2);
    expect(
      await db.select().from(bands).where(eq(bands.id, soloId)),
    ).toHaveLength(1);
    const [row] = await db.select().from(users).where(eq(users.id, a.user.id));
    expect(row?.email).toBe("boss@example.com");
  });

  test("roster-only members do not count as members", async ({ testApi }) => {
    const a = await newBand(testApi, "lonely@example.com", "Roster Band");
    const ph = await a.api.post(`/bands/${a.bandId}/placeholders`, {
      data: { displayName: "Drummer TBD" },
    });
    expect(ph.status()).toBe(204);

    const preview = await (
      await a.api.get("/users/me/deletion-preview")
    ).json();
    expect(preview.deleteBands).toEqual([
      { id: a.bandId, name: "Roster Band" },
    ]);
    expect(preview.blockedBands).toEqual([]);

    expect((await a.api.delete("/users/me", { data: DELETE })).status()).toBe(
      204,
    );
  });
});

test("the settings danger zone requires typing DELETE, then signs out", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  const { user } = await loginAs("ui-delete@example.com");
  const c = await client(testApi, "ui-delete@example.com");
  const created = await c.api.post("/bands", { data: { name: "Doomed Duo" } });
  const bandId = ((await created.json()) as { id: string }).id;

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete account?" });
  await expect(dialog.getByText("Doomed Duo")).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(confirm).toBeEnabled();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Delete account" }).click();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete my account" }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  expect(await db.select().from(bands).where(eq(bands.id, bandId))).toEqual([]);
  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  expect(row?.email).not.toBe("ui-delete@example.com");
  await c.api.dispose();
});

test("a last admin sees which bands need another admin and cannot confirm", async ({
  page,
  testApi,
  loginAs,
  db,
}) => {
  const a = await newBand(testApi, "blocked@example.com", "Needs Admin");
  const m = await client(testApi, "other@example.com");
  await join(db, a.bandId, m.user.id, "member");
  await loginAs("blocked@example.com");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete account?" });
  const blocked = dialog.getByTestId("delete-account-blocked");
  await expect(
    blocked.getByRole("link", { name: "Needs Admin" }),
  ).toBeVisible();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(
    dialog.getByRole("button", { name: "Delete my account" }),
  ).toBeDisabled();
});
