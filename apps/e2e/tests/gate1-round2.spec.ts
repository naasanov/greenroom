import { expect, test } from "../src/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/showcase");
  await expect(
    page.getByRole("heading", { name: "Tokens", level: 2 }),
  ).toBeVisible();
});

test("right sheet header has top padding and is not covered", async ({
  page,
}) => {
  await page
    .locator("#sheet")
    .getByRole("button", { name: /Midnight City/ })
    .click();
  const sheet = page.getByTestId("right-sheet");
  await expect(sheet).toHaveAttribute("data-state", "open");
  await expect
    .poll(async () => sheet.evaluate((el) => getComputedStyle(el).translate))
    .toBe("0px");

  const result = await sheet.evaluate((el) => {
    const header = el.querySelector("header")!;
    const h = header.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      h.left + h.width / 2,
      h.top + h.height / 2,
    );
    return {
      gap: h.top - s.top,
      paddingTop: parseFloat(getComputedStyle(header).paddingTop),
      covered: !hit || !header.contains(hit),
    };
  });
  expect(result.gap).toBeGreaterThanOrEqual(0);
  // 0.75rem minimum top padding, even with no safe-area inset.
  expect(result.paddingTop).toBeGreaterThanOrEqual(12);
  expect(result.covered).toBe(false);
});

test("empty attendees placeholder is centered in its container", async ({
  page,
}) => {
  const empty = page.getByTestId("attendee-empty");
  await empty.scrollIntoViewIfNeeded();
  await expect(empty).toHaveText("No attendees");
  await expect(
    page.locator("#people").getByTestId("attendee-list"),
  ).toHaveCount(1);

  const { textCenter, boxCenter } = await empty.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    const b = el.parentElement!.getBoundingClientRect();
    const cs = getComputedStyle(el.parentElement!);
    const left = b.left + parseFloat(cs.paddingLeft);
    const right = b.right - parseFloat(cs.paddingRight);
    return {
      textCenter: t.left + t.width / 2,
      boxCenter: (left + right) / 2,
    };
  });
  expect(Math.abs(textCenter - boxCenter)).toBeLessThan(2);
});
