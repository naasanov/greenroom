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

/** Samples the sheet's computed `translate` each frame while `action` runs. */
async function sampleTranslate(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="right-sheet"]')!;
    const w = window as unknown as { __samples: string[]; __stop: boolean };
    w.__samples = [];
    w.__stop = false;
    const tick = () => {
      w.__samples.push(getComputedStyle(el).translate);
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const w = window as unknown as { __samples: string[]; __stop: boolean };
    w.__stop = true;
    return w.__samples;
  });
}

const isMid = (t: string) => t !== "100%" && t !== "0px" && t !== "none";

async function openSheet(page: Page) {
  await page
    .locator("#sheet")
    .getByRole("button", { name: /Midnight City/ })
    .click();
}

test("right sheet slides in and out", async ({ page }) => {
  const sheet = page.getByTestId("right-sheet");
  await sheet.waitFor({ state: "attached" });
  const opening = await sampleTranslate(page, () => openSheet(page));
  expect(opening.some(isMid)).toBe(true);
  await expect(sheet).toHaveAttribute("data-state", "open");
  expect(opening.at(-1)).toBe("0px");

  const closing = await sampleTranslate(page, () =>
    sheet.getByRole("button", { name: "Close" }).click(),
  );
  expect(closing.some(isMid)).toBe(true);
  expect(closing.at(-1)).not.toBe("0px");
});

test("right sheet does not animate with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("right-sheet").waitFor({ state: "attached" });
  const opening = await sampleTranslate(page, () => openSheet(page));
  expect(opening.some(isMid)).toBe(false);
  await expect(page.getByTestId("right-sheet")).toHaveAttribute(
    "data-state",
    "open",
  );
  expect(opening.at(-1)).toBe("0px");
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
