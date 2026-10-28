import type { BandSeedResult } from "@greenroom/db";
import { memberships, USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { agendaCard, openAgenda } from "./agenda-helpers.js";
import { AVA } from "./events-helpers.js";
import { apiAs } from "./library-helpers.js";

let seed: BandSeedResult;

// Seed lineups: Club Meridian = Ava + Ben + Dev; every other gig is empty.
test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const rows = (page: Page) => page.getByTestId("lineup-row");
const count = (page: Page) => page.getByTestId("lineup-count");
const rosterRow = (page: Page, name: string | RegExp) =>
  page.getByTestId("roster-picker").getByRole("button", { name });
const names = async (page: Page) =>
  (await rows(page).locator("span.font-semibold").allTextContents()).map((t) =>
    t.trim(),
  );

async function openGig(page: Page, gig: { id: string }) {
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("lineup-section")).toBeVisible();
}

async function openRoster(page: Page) {
  await page.getByRole("button", { name: "Add people" }).click();
  await expect(page.getByTestId("roster-picker")).toBeVisible();
}

const bandPath = () => `/bands/${seed.bands.nightOwls.id}`;

test("a new gig defaults to the full band", async ({ page, testApi }) => {
  const api = await apiAs(testApi, AVA);
  const res = await api.post(`${bandPath()}/gigs`, {
    data: { title: "Fresh Gig", date: "2027-03-05" },
  });
  expect(res.status()).toBe(201);
  const gig = await res.json();
  await api.dispose();
  await openGig(page, gig);
  await expect(rows(page)).toHaveCount(4);
  await expect(count(page)).toHaveText("4 of 4 members");
});

test("a member can be removed from the lineup", async ({ page }) => {
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(3);
  await expect(count(page)).toHaveText("3 of 4 members");
  await page.getByRole("button", { name: /^Remove Ben/ }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(count(page)).toHaveText("2 of 4 members");
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
});

test("tapping roster rows adds and removes people with check marks", async ({
  page,
}) => {
  await openGig(page, seed.gigs.upcomingClub);
  await openRoster(page);
  const cleo = rosterRow(page, /^Cleo/);
  const ben = rosterRow(page, /^Ben/);
  await expect(ben).toHaveAttribute("aria-pressed", "true");
  await expect(cleo).toHaveAttribute("aria-pressed", "false");
  await cleo.click();
  await expect(cleo).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(4);
  await ben.click();
  await expect(ben).toHaveAttribute("aria-pressed", "false");
  await expect(rows(page)).toHaveCount(3);
  expect(await names(page)).toEqual([...(await names(page))].sort());
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("roster-picker")).toBeHidden();
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
});

test("a member can be dragged into the lineup", async ({ page, isMobile }) => {
  test.skip(isMobile, "Drag from the roster is desktop only");
  // Roster drag needs the side layout, which requires a viewport of 1300px or more.
  await page.setViewportSize({ width: 1400, height: 800 });
  await openGig(page, seed.gigs.upcomingClub);
  await openRoster(page);
  const source = (await rosterRow(page, /^Cleo/).boundingBox())!;
  const first = (await rows(page).first().boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(source.x + 20, source.y + 20, { steps: 4 });
  await page.mouse.move(first.x + first.width / 2, first.y + 8, { steps: 14 });
  await expect(page.getByTestId("target-lineup")).toHaveAttribute(
    "data-drop-active",
    "true",
  );
  await page.mouse.up();
  await expect(page.getByTestId("target-lineup")).not.toHaveAttribute(
    "data-drop-active",
    "true",
  );
  await expect(rows(page)).toHaveCount(4);
  await expect(rosterRow(page, /^Cleo/)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
});

test("opening the setlist library closes the roster drawer", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The stacked phone drawer covers the Add songs button");
  await openGig(page, seed.gigs.upcomingClub);
  await openRoster(page);
  await page.getByRole("button", { name: "Add songs" }).click();
  await expect(page.getByTestId("library-picker")).toBeVisible();
  await expect(page.getByTestId("roster-picker")).toBeHidden();
});

test("copy from last gig fills the lineup", async ({ page }) => {
  await openGig(page, seed.gigs.tentative);
  await expect(page.getByTestId("lineup-empty")).toBeVisible();
  await page.getByRole("button", { name: "Copy from last gig" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByTestId("lineup-no-previous")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove Dev/ })).toBeVisible();
  await expect(count(page)).toHaveText("3 of 4 members");
});

test("copy from last gig reports when no earlier gig has a lineup", async ({
  page,
}) => {
  await openGig(page, seed.gigs.pastFestival);
  await page.getByRole("button", { name: "Copy from last gig" }).click();
  await expect(page.getByTestId("lineup-no-previous")).toHaveText(
    "No earlier gig has a lineup yet.",
  );
});

test("a former member keeps their name and a tag on a past gig", async ({
  page,
  testApi,
  db,
}) => {
  const api = await apiAs(testApi, AVA);
  const res = await api.put(
    `${bandPath()}/gigs/${seed.gigs.pastBar.id}/lineup`,
    {
      data: { membershipIds: [seed.memberships.ava, seed.memberships.dev] },
    },
  );
  expect(res.status()).toBe(200);
  await api.dispose();
  await db
    .update(memberships)
    .set({ leftAt: new Date() })
    .where(eq(memberships.id, seed.memberships.dev));
  await openGig(page, seed.gigs.pastBar);
  await expect(rows(page)).toHaveCount(2);
  const dev = rows(page).filter({ hasText: USERS.dev.displayName });
  await expect(dev.getByTestId("left-tag")).toHaveText("Left the band");
  await expect(count(page)).toHaveText("1 of 3 members");
});

test("a lineup change shows up in the agenda member filter", async ({
  page,
}) => {
  await openGig(page, seed.gigs.upcomingClub);
  await expect(rows(page)).toHaveCount(3);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/lineup") && r.request().method() === "PUT",
  );
  await page.getByRole("button", { name: /^Remove Ava/ }).click();
  await saved;
  await page.goto("/events");
  await openAgenda(page);
  await page.getByTestId("agenda-member").click();
  await page.getByRole("menuitemradio", { name: "Me" }).click();
  await expect(agendaCard(page, seed.gigs.upcomingClub.title)).toHaveCount(0);
});
