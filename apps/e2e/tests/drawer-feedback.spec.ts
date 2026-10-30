import type { BandSeedResult } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { agendaSheet, openAgenda } from "./agenda-helpers.js";
import { AVA, eventIn, pickSide, showGigDate } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const fab = (page: Page) => page.getByRole("button", { name: "Add event" });
const createDrawer = (page: Page) => page.getByTestId("split-viewport");
const live = (page: Page, title: string) =>
  page.locator("[data-vaul-drawer]:not([data-exiting])", { hasText: title });

/** Closes the agenda sheet so the FAB sits at the right edge, clear of the gig drawer. */
async function closeAgenda(page: Page) {
  await agendaSheet(page).getByRole("button", { name: "Close" }).click();
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "closed");
}

/** Opens the club gig from the calendar with the agenda closed, so the FAB is clear of the drawer. */
async function openClubFromCalendar(page: Page) {
  const gig = seed.gigs.upcomingClub;
  await showGigDate(page, gig.id, gig.title);
  await closeAgenda(page);
  await eventIn(page, gig.title).click();
  await expect(live(page, gig.title)).toBeVisible();
  return gig;
}

async function openClub(page: Page) {
  const gig = seed.gigs.upcomingClub;
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("setlist-row").first()).toBeVisible();
  await expect(page.getByTestId("lineup-row").first()).toBeVisible();
  return gig;
}

test("gig drawer text is selectable", async ({ page, isMobile }) => {
  test.skip(isMobile, "Vaul only disables selection with a fine pointer");
  const gig = await openClub(page);
  const targets = [
    page.getByRole("heading", { name: gig.title }),
    page.getByTestId("gig-sections").locator("span.font-semibold").first(),
    page
      .getByTestId("lineup-row")
      .locator("span.truncate.font-semibold")
      .first(),
    page.getByTestId("details-section").getByText("Club Meridian").first(),
  ];
  for (const target of targets) {
    await expect(target).toBeVisible();
    expect(
      await target.evaluate((el) => getComputedStyle(el).userSelect),
    ).not.toBe("none");
  }
  // A real drag selects text; vaul's pointer capture must not block it.
  const name = page
    .getByTestId("setlist-row")
    .locator("span.font-semibold")
    .first();
  const box = (await name.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected?.trim().length).toBeGreaterThan(0);
  // Selecting text does not open the song sheet.
  const title = (await name.innerText()).trim();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
});

test("clicking a setlist song opens its sheet; the drag handle does not", async ({
  page,
}) => {
  await openClub(page);
  const row = page.getByTestId("setlist-row").first();
  const title = (
    await row.locator("span.font-semibold").first().innerText()
  ).trim();
  await row.getByRole("button", { name: `Reorder ${title}` }).click();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  await row.getByTestId("setlist-row-open").click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
});

test("pressing the FAB twice closes the create drawer instead of reopening it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The phone create drawer covers the FAB");
  await page.goto("/events");
  await fab(page).click();
  await expect(createDrawer(page)).toBeVisible();
  await fab(page).click();
  await expect(createDrawer(page)).toBeHidden();
  await expect(page.locator("[data-vaul-drawer]")).toHaveCount(0);
});

test("the FAB asks before closing a create drawer with input", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The phone create drawer covers the FAB");
  await page.goto("/events");
  await fab(page).click();
  const pane = await pickSide(page, "gig");
  await pane.getByLabel("Title").fill("Half done");
  await fab(page).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Discard changes?");
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(pane.getByLabel("Title")).toHaveValue("Half done");
  await fab(page).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(createDrawer(page)).toBeHidden();
});

test("the FAB closes an open gig drawer", async ({ page, isMobile }) => {
  test.skip(isMobile, "The FAB sits under the drawer on phones");
  await openClubFromCalendar(page);
  await fab(page).click();
  await expect(
    page.locator("[data-vaul-drawer]:not([data-exiting])"),
  ).toHaveCount(0);
  await expect(createDrawer(page)).toHaveCount(0);
});

test("a dirty gig drawer asks before the FAB closes it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The FAB sits under the drawer on phones");
  const gig = await openClubFromCalendar(page);
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Title").fill("Renamed gig");
  await fab(page).click();
  await expect(page.getByRole("alertdialog")).toContainText("Discard changes?");
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(live(page, gig.title).or(live(page, "Renamed"))).toBeVisible();
});

test("the gig drawer covers the FAB beside the agenda sheet", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop layout");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/events");
  await openAgenda(page);
  await expect(agendaSheet(page)).toHaveAttribute("data-state", "open");
  const fabBox = (await fab(page).boundingBox())!;
  await page.goto(`/gigs/${seed.gigs.upcomingClub.id}`);
  await openAgenda(page);
  const drawer = live(page, seed.gigs.upcomingClub.title);
  await expect(drawer).toBeVisible();
  await expect
    .poll(async () => {
      const d = (await drawer.boundingBox())!;
      const f = (await fab(page).boundingBox())!;
      const top = await page.evaluate(
        ([x, y]) =>
          document.elementFromPoint(x, y)?.closest("[data-vaul-drawer]") !==
          null,
        [f.x + f.width / 2, f.y + f.height / 2],
      );
      return d.x + d.width >= f.x + f.width && top;
    })
    .toBe(true);
  expect(fabBox.width).toBeGreaterThan(0);
});

test("the edit form's action bar sits flush with the drawer bottom", async ({
  page,
}) => {
  await openClub(page);
  await page.getByRole("button", { name: "Edit details" }).click();
  const bar = page.getByRole("button", { name: "Save changes" });
  await expect(bar).toBeVisible();
  const body = page.locator("[data-vaul-drawer] .overflow-y-auto").first();
  await expect
    .poll(async () => {
      const b = (await bar.boundingBox())!;
      const scroller = (await body.boundingBox())!;
      const barRegion = await bar.evaluate(
        (el) => el.parentElement!.parentElement!.getBoundingClientRect().bottom,
      );
      return (
        Math.abs(barRegion - (scroller.y + scroller.height)) +
        (b.height > 0 ? 0 : 99)
      );
    })
    .toBeLessThan(2);
});

test("the page is not left aria-hidden after the discard prompt closes", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The phone create drawer covers the FAB");
  await page.goto("/events");
  await fab(page).click();
  const pane = await pickSide(page, "gig");
  await pane.getByLabel("Title").fill("Half done");
  await fab(page).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Keep editing" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator("[data-aria-hidden]")).toHaveCount(0);
  await expect(fab(page)).toBeVisible();
});

test("new gig start and end times do not overlap on a phone-width screen", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Sets its own viewport");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/events");
    await fab(page).click();
    const pane = await pickSide(page, "gig");
    // Measured in one frame, retried while the pane slides in.
    await expect
      .poll(async () =>
        pane.evaluate((root) => {
          const rect = (label: string) =>
            root
              .querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
              ?.getBoundingClientRect() ??
            [...root.querySelectorAll("label")]
              .find((l) => l.textContent === label)
              ?.control?.getBoundingClientRect();
          const start = rect("Start time")!;
          const end = rect("End time")!;
          const drawer = root
            .closest("[data-vaul-drawer]")!
            .getBoundingClientRect();
          return (
            start.right <= end.left + 0.5 &&
            [start, end].every(
              (r) => r.left >= drawer.left && r.right <= drawer.right,
            )
          );
        }),
      )
      .toBe(true);
  }
});
