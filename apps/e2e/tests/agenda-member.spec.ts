import { request as pwRequest, type Page } from "@playwright/test";
import type { BandSeedResult } from "@greenroom/db";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";
import { agendaCard, agendaSheet, openAgenda } from "./agenda-helpers.js";
import { AVA } from "./events-helpers.js";

let seed: BandSeedResult;

// Lineups: Rusty Anchor = Ben + Cleo, Summer Fest = Ava, Club Meridian = seeded
// Ava + Ben + Dev, Private Party = Cleo, Maybe Brewery Night = nobody.
test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  const { cookie } = await testApi.login(AVA);
  const api = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  const m = seed.memberships;
  const setLineup = async (gigId: string, membershipIds: string[]) => {
    const res = await api.put(
      `/bands/${seed.bands.nightOwls.id}/gigs/${gigId}/lineup`,
      { data: { membershipIds } },
    );
    expect(res.status(), await res.text()).toBe(200);
  };
  await setLineup(seed.gigs.pastBar.id, [m.ben, m.cleo]);
  await setLineup(seed.gigs.pastFestival.id, [m.ava]);
  await setLineup(seed.gigs.hidden.id, [m.cleo]);
  await setLineup(seed.gigs.tentative.id, []);
  await api.dispose();
  await loginAs(AVA);
});

const trigger = (page: Page) => agendaSheet(page).getByTestId("agenda-member");

async function pick(page: Page, name: string) {
  await trigger(page).click();
  await page.getByRole("menuitemradio", { name }).click();
}

async function close(page: Page) {
  await agendaSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(agendaSheet(page)).toBeHidden();
}

test("defaults to Everyone and shows every gig and practice", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  await expect(trigger(page)).toContainText("Everyone");
  for (const g of Object.values(seed.gigs)) {
    if (g.id === seed.gigs.sideProject.id) continue;
    await expect(agendaCard(page, g.title)).toHaveCount(1);
  }
  await expect(
    agendaSheet(page).locator('[data-event-type="practice"]').first(),
  ).toBeVisible();
});

test("Me hides gigs without me in the lineup but keeps practices", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  await pick(page, "Me");
  await expect(trigger(page)).toContainText("Me");
  await expect(agendaCard(page, seed.gigs.pastBar.title)).toHaveCount(0);
  await expect(agendaCard(page, seed.gigs.hidden.title)).toHaveCount(0);
  await expect(agendaCard(page, seed.gigs.tentative.title)).toHaveCount(0);
  await expect(agendaCard(page, seed.gigs.pastFestival.title)).toHaveCount(1);
  await expect(agendaCard(page, seed.gigs.upcomingClub.title)).toHaveCount(1);
  await expect(
    agendaSheet(page).locator('[data-event-type="practice"]').first(),
  ).toBeVisible();
});

test("picking another member shows their gigs and keeps practices", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  await pick(page, "Cleo Keys");
  await expect(trigger(page)).toContainText("Cleo");
  await expect(agendaCard(page, seed.gigs.pastBar.title)).toHaveCount(1);
  await expect(agendaCard(page, seed.gigs.hidden.title)).toHaveCount(1);
  await expect(agendaCard(page, seed.gigs.pastFestival.title)).toHaveCount(0);
  await expect(agendaCard(page, seed.gigs.upcomingClub.title)).toHaveCount(0);
  await expect(
    agendaSheet(page).locator('[data-event-type="practice"]').first(),
  ).toBeVisible();
});

test("menu lists Everyone, Me, then the other members", async ({ page }) => {
  await page.goto("/events");
  await openAgenda(page);
  await trigger(page).click();
  await expect(page.getByRole("menuitemradio")).toHaveText([
    "Everyone",
    "Me",
    /Ben Bass$/,
    /Cleo Keys$/,
    /Dev Drums$/,
  ]);
});

test("Me persists across reopen but another member does not", async ({
  page,
}) => {
  await page.goto("/events");
  await openAgenda(page);
  await pick(page, "Me");
  await close(page);
  await openAgenda(page);
  await expect(trigger(page)).toContainText("Me");
  await expect(agendaCard(page, seed.gigs.hidden.title)).toHaveCount(0);

  await pick(page, "Ben Bass");
  await expect(trigger(page)).toContainText("Ben");
  await close(page);
  await openAgenda(page);
  await expect(trigger(page)).toContainText("Me");
});

test("combines with the Gigs filter", async ({ page }) => {
  await page.goto("/events");
  await openAgenda(page);
  await pick(page, "Me");
  await agendaSheet(page).getByRole("radio", { name: "Gigs" }).click();
  await expect(agendaCard(page, seed.gigs.pastFestival.title)).toHaveCount(1);
  await expect(agendaCard(page, seed.gigs.hidden.title)).toHaveCount(0);
  await expect(
    agendaSheet(page).locator('[data-event-type="practice"]'),
  ).toHaveCount(0);
});

test("header does not overflow at the current width", async ({ page }) => {
  await page.goto("/events");
  await openAgenda(page);
  await pick(page, "Cleo Keys");
  const sheet = (await agendaSheet(page).boundingBox())!;
  const box = (await trigger(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(sheet.x);
  expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width);
});
