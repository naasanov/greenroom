import { BANDS, USERS } from "@greenroom/db";
import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.js";
import { apiAs, cards, openLibrary, sheet } from "./library-helpers.js";

const base = `/bands/${BANDS.nightOwls.id}/songs`;
const labelBox = (page: Page) =>
  sheet(page).getByRole("combobox", { name: "Reference label" }).last();
const valueBox = (page: Page) =>
  sheet(page).getByRole("textbox", { name: "Reference value" }).last();

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

/** Opens "Jam in A" in edit mode with one new empty row. */
async function editWithNewRow(page: Page) {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Jam in A" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Edit" }).click();
  await s.getByRole("button", { name: "Add row" }).click();
}

test("magic keys are offered unused, once, with no song count", async ({
  page,
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const tags = await (await api.get(`${base}/reference-tags`)).json();
  expect(
    tags.filter((t: { label: string }) => /spotify/i.test(t.label)),
  ).toHaveLength(0);

  await editWithNewRow(page);
  await labelBox(page).fill("sp");
  const options = sheet(page)
    .getByRole("listbox", { name: "Suggested tags" })
    .getByRole("option");
  await expect(options).toHaveText(["Spotify"]);
  await expect(sheet(page).getByRole("listbox")).not.toContainText("song");

  await options.first().click();
  await expect(labelBox(page)).toHaveValue("Spotify");
});

test("typing ult offers the Ultimate Guitar magic key", async ({ page }) => {
  await editWithNewRow(page);
  await labelBox(page).fill("ult");
  const options = sheet(page)
    .getByRole("listbox", { name: "Suggested tags" })
    .getByRole("option");
  await expect(options).toHaveText(["Ultimate Guitar"]);
  await options.first().click();
  await expect(labelBox(page)).toHaveValue("Ultimate Guitar");
});

test("band tags that differ only in case appear once, canonically", async ({
  page,
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const songs = await (await api.get(base)).json();
  for (const [i, label] of ["spotify", "Spotify"].entries()) {
    await api.patch(`${base}/${songs[i].id}`, {
      data: {
        references: [
          { label, value: "https://open.spotify.com/track/abc" + i },
        ],
      },
    });
  }
  await editWithNewRow(page);
  await labelBox(page).fill("spot");
  await expect(
    sheet(page)
      .getByRole("listbox", { name: "Suggested tags" })
      .getByRole("option"),
  ).toHaveText(["Spotify"]);
});

test("band tags rank before unused magic keys, even on a contains match", async ({
  page,
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const songs = await (await api.get(base)).json();
  for (const song of songs.slice(0, 3)) {
    await api.patch(`${base}/${song.id}`, {
      data: {
        references: [
          { label: "My Spotify list", value: "https://x.example.com" },
        ],
      },
    });
  }
  await editWithNewRow(page);
  await labelBox(page).fill("spot");
  await expect(
    sheet(page)
      .getByRole("listbox", { name: "Suggested tags" })
      .getByRole("option"),
  ).toHaveText(["My Spotify list", "Spotify"]);
});

test("label input shows the provider favicon only for magic keys", async ({
  page,
}) => {
  await editWithNewRow(page);
  const icon = sheet(page).getByTestId("label-favicon");
  await expect(icon).toHaveCount(0);
  await labelBox(page).fill("youtube");
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("data-key", "youtube");
  await expect(icon.locator("img, svg")).toBeVisible();
  await labelBox(page).fill("ultimate guitar");
  await expect(icon).toHaveAttribute("data-key", "ultimateGuitar");
  await expect(icon.locator("img, svg")).toBeVisible();
  await labelBox(page).fill("Chart");
  await expect(icon).toHaveCount(0);
});

test("Ultimate Guitar with a non-UG link errors and blocks the form", async ({
  page,
}) => {
  await editWithNewRow(page);
  const s = sheet(page);
  await labelBox(page).fill("Ultimate Guitar");
  await valueBox(page).fill("https://example.com/x");
  await expect(s.getByRole("alert")).toContainText("ultimate-guitar.com");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await valueBox(page).fill("https://tabs.ultimate-guitar.com/tab/x/y-1");
  await expect(s.getByRole("alert")).toHaveCount(0);
});

test("a magic key with an off-provider link errors and blocks the form", async ({
  page,
}) => {
  await editWithNewRow(page);
  const s = sheet(page);
  await labelBox(page).fill("Spotify");
  await valueBox(page).fill("https://example.com/x");
  await expect(s.getByRole("alert")).toContainText("open.spotify.com");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("alert")).toBeVisible();
  await expect(s.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await valueBox(page).fill("https://open.spotify.com/track/abc");
  await expect(s.getByRole("alert")).toHaveCount(0);
});

test("the references-only editor blocks Done until the link is valid", async ({
  page,
}) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Jam in A" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Change references" }).click();
  await s.getByRole("button", { name: "Add row" }).click();
  await labelBox(page).fill("YouTube Music");
  await valueBox(page).fill("https://youtu.be/abc");
  await expect(s.getByRole("alert")).toBeVisible();
  await expect(s.getByRole("button", { name: "Done" })).toBeDisabled();
  await valueBox(page).fill("https://music.youtube.com/watch?v=abc");
  await expect(s.getByRole("button", { name: "Done" })).toBeEnabled();
  await s.getByRole("button", { name: "Done" }).click();
  await expect(s.getByTestId("reference-link").last()).toContainText(
    "YouTube Music",
  );
});

test("saving a lower-case magic key stores the canonical label", async ({
  page,
  testApi,
}) => {
  await editWithNewRow(page);
  const s = sheet(page);
  await labelBox(page).fill("spotify");
  await valueBox(page).fill("https://open.spotify.com/track/abc");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(
    s.getByTestId("reference-link").filter({ hasText: "Spotify" }),
  ).toHaveCount(1);
  await expect(
    s.getByTestId("reference-link").filter({ hasText: /^spotify/ }),
  ).toHaveCount(0);

  const api = await apiAs(testApi, USERS.ava.email);
  const songs = await (await api.get(base)).json();
  const jam = songs.find((x: { title: string }) => x.title === "Jam in A");
  const detail = await (await api.get(`${base}/${jam.id}`)).json();
  expect(detail.references.map((r: { label: string }) => r.label)).toContain(
    "Spotify",
  );
});

test("valid provider links save in the form", async ({ page }) => {
  await editWithNewRow(page);
  const s = sheet(page);
  const links = [
    ["Spotify", "https://open.spotify.com/track/abc"],
    ["YouTube", "https://youtu.be/abc"],
    ["Apple Music", "https://music.apple.com/us/song/x"],
  ] as const;
  for (const [i, [label, value]] of links.entries()) {
    if (i > 0) await s.getByRole("button", { name: "Add row" }).click();
    await labelBox(page).fill(label);
    await valueBox(page).fill(value);
  }
  await expect(s.getByRole("alert")).toHaveCount(0);
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("button", { name: "Edit" })).toBeVisible();
  for (const [label] of links) {
    await expect(
      s.getByTestId("reference-link").filter({ hasText: label }),
    ).toHaveCount(1);
  }
});
