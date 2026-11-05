import type { BandSeedResult } from "@greenroom/db";
import { SONGS, USERS } from "@greenroom/db";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { closeSideDrawer, sideDrawerOf } from "./events-helpers.js";
import { apiAs } from "./library-helpers.js";

const AVA = USERS.ava.email;
const LONG_ADDRESS =
  "1234 Extraordinarily Long Boulevard Northwest, Suite 5600, Springfield Heights, Oregon 97477, United States";
let seed: BandSeedResult;

test.beforeEach(async ({ testApi, loginAs }) => {
  seed = await testApi.seed("band");
  await loginAs(AVA);
});

/** Puts songs without lengths and with lengths on the tentative gig's setlist. */
async function fillSetlist(
  testApi: Parameters<typeof apiAs>[0],
  gigId: string,
  songIds: string[],
) {
  const api = await apiAs(testApi, AVA);
  const bandId = seed.bands.nightOwls.id;
  const sl = await (
    await api.get(`/bands/${bandId}/gigs/${gigId}/setlist`)
  ).json();
  const res = await api.put(`/bands/${bandId}/setlists/${sl.id}/items`, {
    data: { songIds },
  });
  expect(res.ok()).toBe(true);
  await api.dispose();
}

const gigDrawer = (page: Page, title: string) =>
  page.getByRole("dialog", { name: title });

async function openGig(page: Page, gig: { id: string; title: string }) {
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByTestId("setlist-section")).toBeVisible();
}

/** Number of distinct rendered lines in the text nodes under `el`. */
const lineCount = (el: Locator) =>
  el.evaluate((node) => {
    const tops = new Set<number>();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        tops.add(Math.round(r.top));
      }
    }
    return tops.size;
  });

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the setlist summary stays on one line", async ({ page, testApi }) => {
    const gig = seed.gigs.tentative;
    await fillSetlist(testApi, gig.id, [
      SONGS.skyline.id,
      SONGS.paperPlanes.id,
      SONGS.lowTide.id,
      SONGS.midnightTrain.id,
      SONGS.redLine.id,
      SONGS.harborLights.id,
      SONGS.originalOne.id,
      SONGS.jamInA.id,
    ]);
    await openGig(page, gig);
    const total = page.getByTestId("setlist-total");
    await expect(total).toContainText("8 songs");
    await expect(total).toContainText("no length");
    expect(await lineCount(total)).toBe(1);
    const fits = await total.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    await page.screenshot({ path: "test-results/summary-390.png" });
  });

  test("a wrapped venue address is left aligned with the map icon after it", async ({
    page,
    testApi,
  }) => {
    const gig = seed.gigs.tentative;
    const api = await apiAs(testApi, AVA);
    const res = await api.patch(
      `/bands/${seed.bands.nightOwls.id}/gigs/${gig.id}`,
      { data: { venueName: "The Long Room", address: LONG_ADDRESS } },
    );
    expect(res.ok()).toBe(true);
    await api.dispose();
    await openGig(page, gig);
    const address = page
      .getByTestId("gig-drawer-body")
      .or(page.locator("body"))
      .getByText(LONG_ADDRESS);
    await expect(address).toBeVisible();
    expect(
      await address.evaluate((el) => getComputedStyle(el).textAlign),
    ).toMatch(/^(left|start)$/);
    expect(await lineCount(address)).toBeGreaterThan(1);

    const link = address.getByRole("link", { name: "Open in Maps" });
    const geometry = await address.evaluate((el) => {
      const anchor = el.querySelector("a")!;
      const range = document.createRange();
      range.setStart(el, 0);
      range.setEndBefore(anchor);
      const rects = Array.from(range.getClientRects()).filter(
        (r) => r.width > 0,
      );
      const last = rects[rects.length - 1]!;
      const icon = anchor.getBoundingClientRect();
      const first = rects[0]!;
      return {
        last: {
          left: last.left,
          right: last.right,
          top: last.top,
          bottom: last.bottom,
        },
        icon: { left: icon.left, top: icon.top, bottom: icon.bottom },
        firstLeft: first.left,
        boxLeft: el.getBoundingClientRect().left,
      };
    });
    await expect(link).toBeVisible();
    expect(geometry.icon.left).toBeGreaterThanOrEqual(geometry.last.right - 2);
    expect(geometry.icon.top).toBeGreaterThanOrEqual(geometry.last.top - 6);
    expect(geometry.icon.bottom).toBeLessThanOrEqual(geometry.last.bottom + 6);
    // The first line starts at the box's left edge.
    expect(Math.abs(geometry.firstLeft - geometry.boxLeft)).toBeLessThan(2);
    await page.screenshot({ path: "test-results/address-390.png" });
  });

  test("no sort menu item wraps", async ({ page }) => {
    await openGig(page, seed.gigs.tentative);
    await page.getByRole("button", { name: "Edit setlist" }).click();
    await expect(page.getByTestId("library-picker")).toBeVisible();
    await page.getByRole("button", { name: "Sort songs" }).click();
    const items = page.getByRole("menuitemradio");
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
      expect(await lineCount(items.nth(i))).toBe(1);
    }
    const viewport = page.viewportSize()!;
    const menu = (await page.getByRole("menu").boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: "test-results/sort-390.png" });
  });

  test("dismissing the add-song sidebar leaves the gig drawer open", async ({
    page,
  }) => {
    const gig = seed.gigs.tentative;
    await openGig(page, gig);
    const drawer = gigDrawer(page, gig.title);
    const picker = page.getByTestId("library-picker");
    const open = async () => {
      await page.getByRole("button", { name: "Edit setlist" }).click();
      await expect(picker).toBeVisible();
    };

    await open();
    await closeSideDrawer(sideDrawerOf(picker));
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();

    // A tap on the gig drawer's visible strip above the sidebar.
    await open();
    const strip = (await drawer.boundingBox())!;
    await page.touchscreen.tap(195, strip.y + 8);
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();

    // A tap on the page above both drawers.
    await open();
    await page.touchscreen.tap(195, Math.max(4, strip.y - 20));
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();

    // A swipe down on the sidebar's handle.
    await open();
    // Let the sidebar finish rising so the handle is where it is measured.
    await page.waitForTimeout(700);
    const side = (await sideDrawerOf(picker).boundingBox())!;
    await page.mouse.move(side.x + side.width / 2, side.y + 14);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(side.x + side.width / 2, side.y + 14 + i * 20);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();
  });
});

test.describe("desktop width", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test("dismissing the add-song sidebar leaves the gig drawer open", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop layout");
    const gig = seed.gigs.tentative;
    await openGig(page, gig);
    const drawer = gigDrawer(page, gig.title);
    const picker = page.getByTestId("library-picker");
    const open = async () => {
      await page.getByRole("button", { name: "Edit setlist" }).click();
      await expect(picker).toBeVisible();
    };

    await open();
    await closeSideDrawer(sideDrawerOf(picker));
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();

    await open();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();

    await open();
    await page.mouse.click(60, 450);
    await expect(picker).toBeHidden();
    await expect(drawer).toBeVisible();
  });
});
