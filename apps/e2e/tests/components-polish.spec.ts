import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/showcase");
  await expect(
    page.getByRole("heading", { name: "Tokens", level: 2 }),
  ).toBeVisible();
});

test("segmented toggle indicator slides to the clicked option", async ({
  page,
}) => {
  const group = page.getByRole("radiogroup", { name: "Calendar view" });
  await group.scrollIntoViewIfNeeded();
  const pill = group.getByTestId("segmented-indicator");
  const month = group.getByRole("radio", { name: "Month" });
  const week = group.getByRole("radio", { name: "Week" });

  const x = async (loc: typeof pill) => (await loc.boundingBox())!.x;
  await expect
    .poll(async () => Math.abs((await x(pill)) - (await x(month))))
    .toBeLessThan(1);

  await week.click();
  await expect(week).toHaveAttribute("data-state", "on");
  await expect
    .poll(async () => Math.abs((await x(pill)) - (await x(week))))
    .toBeLessThan(1);
  const box = (await pill.boundingBox())!;
  const weekBox = (await week.boundingBox())!;
  expect(Math.abs(box.width - weekBox.width)).toBeLessThan(1);
});

test("tab bar names the main tab Events", async ({ page, isMobile }) => {
  const frame = page.getByTestId("shell-auto");
  await frame.scrollIntoViewIfNeeded();
  const nav = frame.getByTestId(isMobile ? "bottom-tab-bar" : "top-tabs");
  await expect(nav.getByRole("button", { name: "Events" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("button", { name: "Calendar" })).toHaveCount(0);
});

/** The sheet's computed `translate` and the transition declared for it. */
async function sheetMotion(page: Page) {
  return page.getByTestId("right-sheet").evaluate((el) => {
    const cs = getComputedStyle(el);
    const props = cs.transitionProperty.split(",").map((v) => v.trim());
    const durations = cs.transitionDuration
      .split(",")
      .map((v) => parseFloat(v) * (v.trim().endsWith("ms") ? 1 : 1000));
    return { translate: cs.translate, props, durations };
  });
}

async function openSheet(page: Page) {
  await page
    .locator("#sheet")
    .getByRole("button", { name: /Midnight City/ })
    .click();
}

test("right sheet slides in and out", async ({ page }) => {
  const sheet = page.getByTestId("right-sheet");
  await sheet.waitFor({ state: "attached" });

  // Tailwind 4 positions the sheet with the `translate` property, so the
  // transition must target it with a non-zero duration or nothing animates.
  const closed = await sheetMotion(page);
  expect(closed.translate).not.toBe("0px");
  const i = closed.props.findIndex((p) => p === "translate" || p === "all");
  expect(i).toBeGreaterThanOrEqual(0);
  expect(closed.durations[i % closed.durations.length]).toBeGreaterThan(0);

  await openSheet(page);
  await expect(sheet).toHaveAttribute("data-state", "open");
  await expect
    .poll(async () => (await sheetMotion(page)).translate)
    .toBe("0px");

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect
    .poll(async () => (await sheetMotion(page)).translate)
    .not.toBe("0px");
});

test("right sheet does not animate with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sheet = page.getByTestId("right-sheet");
  await sheet.waitFor({ state: "attached" });

  const closed = await sheetMotion(page);
  expect(
    closed.props.includes("none") || closed.durations.every((d) => d === 0),
  ).toBe(true);

  await openSheet(page);
  await expect(sheet).toHaveAttribute("data-state", "open");
  await expect
    .poll(async () => (await sheetMotion(page)).translate)
    .toBe("0px");
});

test("reference values render as links only when they are URLs", async ({
  page,
}) => {
  const section = page.locator("#links");
  await section.scrollIntoViewIfNeeded();
  const list = section.getByTestId("reference-text").first();
  await expect(list).toContainText("Key");
  await expect(list).toContainText("F# minor, 105 bpm");
  await expect(list.locator("a, img, svg")).toHaveCount(0);

  const first = section.locator("a[data-testid=reference-link]").first();
  await expect(first).toHaveAttribute("href", /^https:\/\/open\.spotify\.com/);
  await expect(first.locator("svg")).toHaveCount(1);
  await expect(section.getByText("No links yet.")).toHaveCount(0);
  await expect(section.getByText("Nothing here yet.")).toBeVisible();
});

test("parseLink accepts real hosts and rejects look-alikes", async ({
  page,
}) => {
  const section = page.locator("#links");
  await section.scrollIntoViewIfNeeded();
  await section.getByRole("button", { name: "Edit reference" }).click();
  const value = section.getByLabel("Reference value").nth(2);

  const cases: [string, boolean][] = [
    ["songsterr.com/a/wsa/x", true],
    ["youtu.be/x", true],
    ["http://example.org", true],
    ["105.5", false],
    ["v1.2", false],
    ["F#", false],
    ["Capo 2", false],
    ["3.5 min", false],
  ];
  for (const [text, isLink] of cases) {
    await value.fill(text);
    await section.getByRole("button", { name: "Done" }).click();
    const link = section.locator("a[data-testid=reference-link]");
    await expect(link, text).toHaveCount(isLink ? 3 : 2);
    await section.getByRole("button", { name: "Edit reference" }).click();
  }
});
