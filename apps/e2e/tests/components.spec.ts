import { expect, test } from "../src/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/showcase");
  await expect(
    page.getByRole("heading", { name: "Tokens", level: 2 }),
  ).toBeVisible();
});

test("jump nav links to sections", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Jump to section" })
    .getByRole("link", { name: "Dialogs" })
    .click();
  await expect(page).toHaveURL(/#dialogs$/);
  await expect(page.getByRole("heading", { name: "Dialogs" })).toBeInViewport();
});

test("tab bar on mobile, top tabs on desktop", async ({ page, isMobile }) => {
  const frame = page.getByTestId("shell-auto");
  await frame.scrollIntoViewIfNeeded();
  const bottom = frame.getByTestId("bottom-tab-bar");
  const top = frame.getByTestId("top-tabs");
  if (isMobile) {
    await expect(bottom).toBeVisible();
    await expect(top).toBeHidden();
  } else {
    await expect(top).toBeVisible();
    await expect(bottom).toBeHidden();
  }
  const nav = isMobile ? bottom : top;
  await nav.getByRole("button", { name: "Roster" }).click();
  await expect(nav.getByRole("button", { name: "Roster" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(frame.getByText("Priya Natarajan")).toBeVisible();
});

test("band switcher changes the active band", async ({ page }) => {
  const frame = page.getByTestId("shell-auto");
  await frame.getByRole("button", { name: /Switch band/ }).click();
  await page.getByRole("menuitem", { name: "Basement Tapes" }).click();
  await expect(
    frame.getByRole("button", { name: /current: Basement Tapes/ }),
  ).toBeVisible();
});

test("FAB speed dial opens labeled actions", async ({ page }) => {
  const frame = page.getByTestId("shell-mobile");
  await frame.scrollIntoViewIfNeeded();
  const fab = frame.getByRole("button", { name: "Add to library" });
  await expect(frame.getByTestId("fab-action-song")).toBeHidden();
  await fab.click();
  await expect(fab).toHaveAttribute("aria-expanded", "true");
  await expect(frame.getByTestId("fab-action-song")).toBeVisible();
  await expect(frame.getByTestId("fab-action-playlist")).toContainText(
    "Import playlist",
  );
  await frame.getByTestId("fab-action-song").click();
  await expect(frame.getByTestId("shell-mobile-toast")).toHaveText("Add song");
  await expect(fab).toHaveAttribute("aria-expanded", "false");
});

test("split drawer slides to a side and back via arrow", async ({ page }) => {
  await page.getByRole("button", { name: "Open split drawer" }).click();
  const viewport = page.getByTestId("split-viewport");
  await expect(viewport).toHaveAttribute("data-view", "split");

  await page.getByTestId("split-pick-right").click();
  await expect(viewport).toHaveAttribute("data-view", "right");
  await expect(
    page.getByTestId("split-right").getByLabel("Title"),
  ).toBeVisible();

  await page.getByTestId("split-back").click();
  await expect(viewport).toHaveAttribute("data-view", "split");

  await page.getByTestId("split-pick-left").click();
  await expect(viewport).toHaveAttribute("data-view", "left");
  await page.getByTestId("split-back").click();
  await expect(viewport).toHaveAttribute("data-view", "split");
});

test("split drawer swipe returns to the split", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag only; touch swipe is covered manually");
  await page.getByRole("button", { name: "Open split drawer" }).click();
  await page.getByTestId("split-pick-right").click();
  const viewport = page.getByTestId("split-viewport");
  await expect(viewport).toHaveAttribute("data-view", "right");
  const box = (await viewport.boundingBox())!;
  const y = box.y + 40;
  await page.mouse.move(box.x + 60, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, y, { steps: 8 });
  await page.mouse.up();
  await expect(viewport).toHaveAttribute("data-view", "split");
});

test("side drawer sits beside on desktop and stacks over on mobile", async ({
  page,
  isMobile,
}) => {
  await page.getByRole("button", { name: "New gig" }).click();
  const main = page.getByRole("dialog", { name: "New gig" });
  await expect(main).toBeVisible();
  await page.getByRole("button", { name: "Add songs" }).click();

  if (isMobile) {
    const lib = page.getByRole("dialog", { name: "Song library" });
    await expect(lib).toBeVisible();
    await expect(async () => {
      const m = (await main.boundingBox())!;
      const l = (await lib.boundingBox())!;
      // Gig drawer peeks out above the library drawer.
      expect(l.y).toBeGreaterThan(m.y + 40);
      expect(l.y + l.height).toBeGreaterThanOrEqual(m.y + m.height - 4);
    }).toPass();
    await lib.getByText("Dreams").click();

    await lib.getByRole("button", { name: "Done" }).click();
    await expect(lib).toBeHidden();
  } else {
    const side = page.locator('aside[aria-label="Song library"]');
    await expect(side).toHaveAttribute("data-state", "open");
    await expect(side).toBeVisible();
    const m = (await main.boundingBox())!;
    await expect(async () => {
      const s = (await side.boundingBox())!;
      expect(s.x + s.width).toBeLessThanOrEqual(m.x + 1);
    }).toPass();
    await side.getByText("Dreams").click();
    await side.getByRole("button", { name: "Done" }).click();
    await expect(side).toHaveAttribute("data-state", "closed");
  }
  await expect(main).toBeVisible();
  await expect(
    main.getByText("Dreams", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
});

test("tapping the visible gig drawer closes the stacked library", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "stacked library drawer is the narrow-screen layout");
  await page.getByRole("button", { name: "New gig" }).click();
  const main = page.getByRole("dialog", { name: "New gig" });
  await page.getByRole("button", { name: "Add songs" }).click();
  const lib = page.getByRole("dialog", { name: "Song library" });
  await expect(lib).toBeVisible();
  const m = (await main.boundingBox())!;
  const l = (await lib.boundingBox())!;
  await page.touchscreen.tap(m.x + m.width / 2, (m.y + l.y) / 2);
  await expect(lib).toBeHidden();
  await expect(main).toBeVisible();
});

test("drawers have no backdrop and leave the page interactive", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open drawer" }).click();
  const note = page.getByRole("dialog", { name: "Quick note" });
  await expect(note).toBeVisible();
  await expect(page.locator("[data-vaul-overlay]")).toHaveCount(0);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).position),
  ).not.toBe("fixed");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).not.toBe("hidden");

  // The tap closes the first drawer and still reaches the button behind it.
  await page.getByRole("button", { name: "Open split drawer" }).click();
  await expect(note).toBeHidden();
  await expect(page.getByTestId("split-viewport")).toBeVisible();
});

test("dragging the handle down dismisses a drawer", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "mouse drag only; touch swipe is covered manually");
  await page.getByRole("button", { name: "Open drawer" }).click();
  const note = page.getByRole("dialog", { name: "Quick note" });
  const box = (await note.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height, { steps: 12 });
  await page.mouse.up();
  await expect(note).toBeHidden();
});

test("Escape closes a drawer", async ({ page }) => {
  await page.getByRole("button", { name: "Open drawer" }).click();
  const note = page.getByRole("dialog", { name: "Quick note" });
  await expect(note).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(note).toBeHidden();
});

test("tapping inside a drawer or its dialogs does not close it", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Drawer with discard guard" }).click();
  const drawer = page.getByRole("dialog", { name: "New gig" });
  await drawer.getByLabel("Title").fill("Halloween");
  await drawer.getByLabel("Title").click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", { name: "Discard changes?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(discard).toBeHidden();
  await expect(drawer).toBeVisible();
});

test("guarded drawer asks before an outside tap closes it", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Drawer with discard guard" }).click();
  const drawer = page.getByRole("dialog", { name: "New gig" });
  await drawer.getByLabel("Title").fill("Halloween");

  await page.getByRole("button", { name: "Open split drawer" }).click();
  const discard = page.getByRole("alertdialog", { name: "Discard changes?" });
  await expect(discard).toBeVisible();
  await expect(page.getByTestId("split-viewport")).toHaveCount(0);
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(discard).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Title")).toHaveValue("Halloween");

  // A dialog closed over the drawer leaves aria-hidden on the page, so use CSS.
  await page.locator("button", { hasText: "Open split drawer" }).click();
  await discard.getByRole("button", { name: "Discard" }).click();
  await expect(drawer).toBeHidden();
});

test("drawer fits above a simulated on-screen keyboard", async ({ page }) => {
  await page.getByRole("button", { name: "New gig" }).click();
  const main = page.getByRole("dialog", { name: "New gig" });
  const input = main.getByLabel("Title");
  await expect(input).toBeVisible();
  await input.focus();

  // Playwright has no real keyboard; shrink visualViewport and fire its events.
  const vvHeight = await page.evaluate(() => {
    const vv = window.visualViewport!;
    const h = Math.round(window.innerHeight * 0.55);
    Object.defineProperty(vv, "height", { value: h, configurable: true });
    vv.dispatchEvent(new Event("resize"));
    return h;
  });
  await expect(async () => {
    const box = (await main.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vvHeight + 1);
    const i = (await input.boundingBox())!;
    expect(i.y + i.height).toBeLessThanOrEqual(vvHeight);
  }).toPass();

  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, "height", {
      value: window.innerHeight,
      configurable: true,
    });
    vv.dispatchEvent(new Event("resize"));
  });
  await expect(async () => {
    const box = (await main.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(vvHeight + 50);
  }).toPass();
});

test("stacked drawers open one over another", async ({ page }) => {
  await page.getByRole("button", { name: "Open stacked drawers" }).click();
  await page.getByRole("button", { name: "Choose a venue" }).click();
  const venue = page.getByRole("dialog", { name: "Choose a venue" });
  await expect(venue).toBeVisible();
  await venue.getByRole("button", { name: "The Echo Lounge" }).click();
  await expect(venue).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Gig details" })).toBeVisible();
});

test("right sheet opens, navigates, edits, and closes", async ({
  page,
  isMobile,
}) => {
  const sheet = page.getByTestId("right-sheet");
  await expect(sheet).toHaveAttribute("data-state", "closed");
  await page
    .locator("#sheet")
    .getByRole("button", { name: /Midnight City/ })
    .click();
  await expect(sheet).toHaveAttribute("data-state", "open");
  await expect(
    sheet.getByRole("heading", { name: "Midnight City" }),
  ).toBeVisible();

  await sheet.getByRole("button", { name: "Next" }).click();
  await expect(sheet.getByRole("heading", { name: "Dreams" })).toBeVisible();
  await sheet.getByRole("button", { name: "Previous" }).click();
  await expect(
    sheet.getByRole("heading", { name: "Midnight City" }),
  ).toBeVisible();

  // Edit toggles without moving the header buttons.
  const edit = sheet.getByRole("button", { name: "Edit" });
  const before = (await edit.boundingBox())!;
  await edit.click();
  const cancel = sheet.getByRole("button", { name: "Cancel" });
  const after = (await cancel.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
  await expect(sheet.getByLabel("Title")).toBeEditable();
  await cancel.click();
  await expect(sheet.getByLabel("Title")).not.toBeEditable();

  if (!isMobile) {
    // Panel stays open while another item is clicked.
    await page
      .locator("#sheet")
      .getByRole("button", { name: /Superstition/ })
      .click();
    await expect(
      sheet.getByRole("heading", { name: "Superstition" }),
    ).toBeVisible();
  }

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveAttribute("data-state", "closed");
});

test("selection bar appears and adapts to the selection", async ({ page }) => {
  const frame = page.getByTestId("selection-frame");
  const bar = frame.getByTestId("selection-bar");
  await frame.scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("data-visible", "false");

  const tiles = frame.getByTestId("media-tile");
  await tiles.nth(0).click();
  await expect(bar).toHaveAttribute("data-visible", "true");
  await expect(bar.getByTestId("selection-count")).toHaveText("1");
  await expect(bar.getByRole("button", { name: "Rename" })).toBeVisible();

  await tiles.nth(1).click();
  await expect(bar.getByTestId("selection-count")).toHaveText("2");
  await expect(bar.getByRole("button", { name: "Rename" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Move" })).toBeVisible();

  await bar.getByRole("button", { name: "Clear selection" }).click();
  await expect(bar).toHaveAttribute("data-visible", "false");
});

test("dialogs: destructive confirm, discard, and edit scope", async ({
  page,
}) => {
  const result = page.getByTestId("dialog-result");

  await page
    .locator("#dialogs")
    .getByRole("button", { name: "Destructive", exact: true })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(
    confirm.getByRole("button", { name: "Cancel gig" }),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel gig" }).click();
  await expect(result).toContainText("destructive confirmed");

  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(result).toContainText("destructive confirmed");

  await page.getByRole("button", { name: "Edit scope" }).click();
  const scope = page.getByRole("dialog", { name: /recurring event/ });
  await scope.getByLabel("This and following events").click();
  await scope.getByRole("button", { name: "OK" }).click();
  await expect(result).toContainText("scope following");
});

test("segmented toggle and instrument picker", async ({ page }) => {
  await page.getByRole("radio", { name: "Week" }).click();
  await expect(page.getByTestId("seg-value")).toContainText("week");

  const picker = page.getByRole("group", { name: "Instruments" });
  const drums = picker.getByRole("button", { name: "Drums" });
  await drums.click();
  await expect(drums).toHaveAttribute("aria-pressed", "true");
  await page
    .locator("#people")
    .getByRole("textbox", { name: "Custom instrument" })
    .fill("Banjo");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Custom instruments" }).getByText("Banjo"),
  ).toBeVisible();
});

test("attendee list sorts going, maybe, none, declined", async ({ page }) => {
  const statuses = await page
    .getByTestId("attendee-list")
    .first()
    .locator("li")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  expect(statuses).toEqual(["going", "going", "maybe", "none", "declined"]);
});
