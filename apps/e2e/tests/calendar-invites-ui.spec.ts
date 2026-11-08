import type { BandSeedResult } from "@greenroom/db";
import { USERS, memberships, users } from "@greenroom/db";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";
import { AVA, isoDay, pickSide } from "./events-helpers.js";

let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

const bannerKey = (seed: BandSeedResult) =>
  `greenroom:calendar-invites-banner:${USERS.ava.id}:${seed.bands.nightOwls.id}`;

async function openDialog(page: import("@playwright/test").Page) {
  await page.goto("/events");
  await page
    .getByRole("button", { name: "Add to your calendar" })
    .first()
    .click();
  const dialog = page.getByTestId("calendar-invites-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the toolbar action opens the calendar dialog", async ({ page }) => {
  await page.goto("/events");
  const action = page.getByTestId("add-to-calendar");
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("aria-label", "Add to your calendar");
  await action.click();
  const dialog = page.getByTestId("calendar-invites-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("calendar-invites-toggle")).toBeVisible();
  await expect(dialog.getByLabel("Calendar email")).toBeVisible();
  await expect(dialog.getByTestId("calendar-feed-url")).toHaveValue(
    /\/public\/calendar-feed\/[0-9a-f]{64}\.ics$/,
  );
  await expect(dialog.getByTestId("calendar-feed-webcal")).toHaveAttribute(
    "href",
    /^webcal:\/\/.*\.ics$/,
  );
  await expect(dialog.getByText("Other calendars")).toBeVisible();
  await expect(dialog.getByText("Subscribe from web")).toBeVisible();
  await expect(dialog.getByText("New Calendar Subscription")).toBeVisible();
});

test("the toolbar action is reachable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openDialog(page);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(
    dialog.getByRole("button", { name: "Reset link" }),
  ).toBeVisible();
});

test("the invites switch persists", async ({ page, db }) => {
  const dialog = await openDialog(page);
  const toggle = dialog.getByTestId("calendar-invites-toggle");
  await expect(toggle).toBeChecked();
  const stored = async () =>
    (await db.select().from(users).where(eq(users.id, USERS.ava.id)))[0]
      ?.calendarInvitesEnabled;
  await toggle.click();
  await expect.poll(stored).toBe(false);
  await page.reload();
  await page.getByTestId("add-to-calendar").click();
  await expect(
    page
      .getByTestId("calendar-invites-dialog")
      .getByTestId("calendar-invites-toggle"),
  ).not.toBeChecked();

  await page.goto("/settings");
  const personal = page.getByTestId("settings-personal");
  await expect(
    personal.getByTestId("calendar-invites-toggle"),
  ).not.toBeChecked();
  await personal.getByTestId("calendar-invites-toggle").click();
  await expect.poll(stored).toBe(true);
});

test("the feed link can be copied and reset", async ({ page, db }) => {
  await page.addInitScript(() => {
    (window as unknown as { copied: string[] }).copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t: string) => {
          (window as unknown as { copied: string[] }).copied.push(t);
        },
      },
    });
  });
  const dialog = await openDialog(page);
  const field = dialog.getByTestId("calendar-feed-url");
  await expect(field).toHaveValue(/calendar-feed\//);
  const before = await field.inputValue();

  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { copied: string[] }).copied,
    ),
  ).toEqual([before]);

  await dialog.getByRole("button", { name: "Reset link" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Reset link" })
    .click();
  await expect(field).not.toHaveValue(before);
  const after = await field.inputValue();
  const [row] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, USERS.ava.id),
        eq(memberships.bandId, seed.bands.nightOwls.id),
      ),
    );
  expect(after).toContain(row!.calendarFeedToken);
  expect(before).not.toContain(row!.calendarFeedToken);
});

test("the banner shows for a fresh member and hides for a week once dismissed", async ({
  page,
}) => {
  await page.goto("/events");
  const banner = page.getByTestId("calendar-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Get gigs and practices in your calendar");
  await expect(banner).not.toContainText("Google");
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("events-tab")).toBeVisible();
  await expect(banner).toBeHidden();

  const key = bannerKey(seed);
  const eightDays = Date.now() - 8 * 24 * 60 * 60 * 1000;
  await page.evaluate(
    ([k, t]) => localStorage.setItem(k, JSON.stringify({ dismissedAt: t })),
    [key, eightDays] as const,
  );
  await page.reload();
  await expect(banner).toBeVisible();
});

test("opening the dialog from the banner hides it while invites are on", async ({
  page,
}) => {
  await page.goto("/events");
  const banner = page.getByTestId("calendar-banner");
  await banner.getByRole("button", { name: "Add to your calendar" }).click();
  await expect(page.getByTestId("calendar-invites-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("events-tab")).toBeVisible();
  await expect(banner).toBeHidden();
});

test("the first event a member creates shows a one-time nudge", async ({
  page,
}) => {
  await page.goto("/events");
  const create = async (title: string) => {
    await page.getByRole("button", { name: "Add event" }).click();
    const pane = await pickSide(page, "gig");
    await pane.getByLabel("Title").fill(title);
    await pane.getByLabel("Date", { exact: true }).fill(isoDay(3));
    await pane.getByRole("button", { name: "Create gig" }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: title })).toBeHidden();
  };
  await create("First gig");
  const nudge = page.getByTestId("calendar-nudge");
  await expect(nudge).toBeVisible();
  await nudge.getByRole("button", { name: "Dismiss" }).click();
  await expect(nudge).toBeHidden();
  await create("Second gig");
  await expect(nudge).toBeHidden();
});
