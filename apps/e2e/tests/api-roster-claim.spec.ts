import { GIG_IDS, MEMBERSHIPS, USERS, gigLineup } from "@greenroom/db";
import { and, eq } from "drizzle-orm";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

async function client(testApi: TestApi, email: string) {
  const { user, cookie } = await testApi.login(email);
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  return { user, api };
}

test("removing or leaving drops future lineup spots and keeps past ones", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  const bandId = seeded.bands.nightOwls.id;
  const ava = await client(testApi, USERS.ava.email);
  const ben = await client(testApi, USERS.ben.email);
  const inLineup = async (gigId: string, membershipId: string) =>
    (
      await db
        .select()
        .from(gigLineup)
        .where(
          and(
            eq(gigLineup.gigId, gigId),
            eq(gigLineup.membershipId, membershipId),
          ),
        )
    ).length;
  await db.insert(gigLineup).values([
    { bandId, gigId: GIG_IDS.pastBar, membershipId: MEMBERSHIPS.dev },
    { bandId, gigId: GIG_IDS.pastBar, membershipId: MEMBERSHIPS.ben },
  ]);

  const removed = await ava.api.delete(
    `/bands/${bandId}/members/${USERS.dev.id}`,
  );
  expect(removed.status()).toBe(204);
  expect(await inLineup(GIG_IDS.upcomingClub, MEMBERSHIPS.dev)).toBe(0);
  expect(await inLineup(GIG_IDS.pastBar, MEMBERSHIPS.dev)).toBe(1);

  const left = await ben.api.post(`/bands/${bandId}/leave`, {
    data: { deleteBand: false },
  });
  expect(left.status()).toBe(204);
  expect(await inLineup(GIG_IDS.upcomingClub, MEMBERSHIPS.ben)).toBe(0);
  expect(await inLineup(GIG_IDS.pastBar, MEMBERSHIPS.ben)).toBe(1);

  const lineup = await (
    await ava.api.get(`/bands/${bandId}/gigs/${GIG_IDS.upcomingClub}/lineup`)
  ).json();
  expect(lineup.members.map((m: { userId: string }) => m.userId)).toEqual([
    USERS.ava.id,
  ]);
  await Promise.all([ava.api.dispose(), ben.api.dispose()]);
});

test("claiming a roster entry keeps its notes and merges instruments", async ({
  testApi,
}) => {
  const seeded = await testApi.seed("band");
  const bandId = seeded.bands.nightOwls.id;
  const ava = await client(testApi, USERS.ava.email);
  await ava.api.post(`/bands/${bandId}/placeholders`, {
    data: {
      displayName: "Sam Sax",
      email: "sam@example.com",
      notes: "plays on weekends",
      instruments: { presets: ["saxophone"], custom: [] },
    },
  });
  const token = (await (await ava.api.get(`/bands/${bandId}/invite`)).json())
    .token;
  const sam = await client(testApi, "sam-new@example.com");
  const put = await sam.api.put("/me/instruments", {
    data: { presets: ["drums"], custom: [] },
  });
  expect(put.ok()).toBe(true);
  const entries = await (
    await sam.api.get(`/invites/${token}/placeholders`)
  ).json();
  const linked = await sam.api.post(`/invites/${token}/link`, {
    data: { placeholderUserId: entries[0].userId },
  });
  expect(linked.status()).toBe(200);

  const members = await (await ava.api.get(`/bands/${bandId}/members`)).json();
  const me = members.find((m: { userId: string }) => m.userId === sam.user.id);
  expect(me.notes).toBe("plays on weekends");
  expect([...me.instruments.presets].sort()).toEqual(["drums", "saxophone"]);
  expect(members.some((m: { isPlaceholder: boolean }) => m.isPlaceholder)).toBe(
    false,
  );
  await Promise.all([ava.api.dispose(), sam.api.dispose()]);
});
