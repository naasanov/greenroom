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
  await page.getByRole("button", { name: "Edit lineup" }).click();
  await expect(page.getByTestId("roster-picker")).toBeVisible();
  // Drag tests measure rows right after opening, so wait out the slide on desktop.
  const side = page.locator('aside[aria-label="Band members"]');
  if (await side.count()) {
    const viewport = page.viewportSize()!;
    await expect(async () => {
      const box = (await side.boundingBox())!;
      expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThan(2);
    }).toPass();
  }
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
  test.skip(
    isMobile,
    "The stacked phone drawer covers the Edit setlist button",
  );
  // Below 1300px the roster overlays the gig drawer and covers the Edit setlist button.
  await page.setViewportSize({ width: 1400, height: 800 });
  await openGig(page, seed.gigs.upcomingClub);
  await openRoster(page);
  await page.getByRole("button", { name: "Edit setlist" }).click();
  await expect(page.getByTestId("library-picker")).toBeVisible();
  await expect(page.getByTestId("roster-picker")).toBeHidden();
});

// Only past gigs appear in history; the seed gives none a lineup, so give The Rusty Anchor one.
async function seedPastLineup(testApi: Parameters<typeof apiAs>[0]) {
  const api = await apiAs(testApi, AVA);
  const res = await api.put(
    `${bandPath()}/gigs/${seed.gigs.pastBar.id}/lineup`,
    {
      data: {
        membershipIds: [
          seed.memberships.ava,
          seed.memberships.ben,
          seed.memberships.dev,
        ],
      },
    },
  );
  expect(res.status()).toBe(200);
  await api.dispose();
}

test("an empty lineup is one Add people button that opens the roster", async ({
  page,
}) => {
  await openGig(page, seed.gigs.tentative);
  const empty = page.getByTestId("lineup-empty");
  await expect(empty).toHaveText("Add people");
  await empty.click();
  await expect(page.getByTestId("roster-picker")).toBeVisible();
});

const openHistory = async (page: Page) => {
  await openRoster(page);
  await page.getByRole("button", { name: "Copy from a past gig" }).click();
  await expect(page.getByTestId("lineup-history-picker")).toBeVisible();
};

test("copying from a past gig replaces the lineup", async ({
  page,
  testApi,
}) => {
  await seedPastLineup(testApi);
  await openGig(page, seed.gigs.tentative);
  await expect(page.getByTestId("lineup-empty")).toBeVisible();
  await openHistory(page);
  await page
    .getByTestId("lineup-history-entry")
    .filter({ hasText: seed.gigs.pastBar.title })
    .click();
  await expect(page.getByTestId("roster-picker")).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Remove Dev/ })).toBeVisible();
  await expect(count(page)).toHaveText("3 of 4 members");
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
});

test("a past gig's lineup can be previewed before copying", async ({
  page,
  testApi,
}) => {
  await seedPastLineup(testApi);
  await openGig(page, seed.gigs.tentative);
  await openHistory(page);
  const entry = page
    .getByTestId("lineup-history-picker")
    .getByRole("listitem")
    .filter({ hasText: seed.gigs.pastBar.title });
  await expect(entry.getByTestId("lineup-history-entry")).toContainText(
    "3 members",
  );
  await entry.getByTestId("lineup-history-preview-toggle").click();
  const preview = entry.getByTestId("lineup-history-preview");
  await expect(preview).toContainText(USERS.dev.displayName);
  await expect(preview).toContainText(USERS.ben.displayName);
  await expect(rows(page)).toHaveCount(0);
});

test("the history view goes back to the member list", async ({ page }) => {
  await openGig(page, seed.gigs.tentative);
  await openHistory(page);
  await page.getByRole("button", { name: "Back to band members" }).click();
  await expect(page.getByTestId("roster-picker")).toBeVisible();
  await expect(page.getByTestId("lineup-history-picker")).toHaveCount(0);
});

test("the history view reports when no earlier gig has a lineup", async ({
  page,
}) => {
  await openGig(page, seed.gigs.pastFestival);
  await openHistory(page);
  await expect(page.getByTestId("lineup-history-picker")).toContainText(
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
