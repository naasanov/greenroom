import { BANDS, USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import { apiAs, cards, openLibrary, sheet } from "./library-helpers.js";

test.beforeEach(async ({ testApi, loginAs }) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
});

test("reference-tags endpoint lists distinct tags, most used first", async ({
  testApi,
}) => {
  const api = await apiAs(testApi, USERS.ava.email);
  const url = `/bands/${BANDS.nightOwls.id}/songs/reference-tags`;
  const before = await (await api.get(url)).json();
  expect(before.map((t: { label: string }) => t.label)).toContain("Demo");

  const songs = await (
    await api.get(`/bands/${BANDS.nightOwls.id}/songs`)
  ).json();
  for (const s of songs.slice(0, 2)) {
    await api.patch(`/bands/${BANDS.nightOwls.id}/songs/${s.id}`, {
      data: { references: [{ label: "demo", value: "https://x.example.com" }] },
    });
  }
  const after = await (await api.get(url)).json();
  expect(after[0].count).toBe(2);
  expect(after[0].label.toLowerCase()).toBe("demo");
  expect(
    after.filter((t: { label: string }) => t.label.toLowerCase() === "demo"),
  ).toHaveLength(1);
});

test("label input suggests used tags; keyboard, click and new names work", async ({
  page,
}) => {
  await openLibrary(page);
  await cards(page).filter({ hasText: "Jam in A" }).click();
  const s = sheet(page);
  await s.getByRole("button", { name: "Edit" }).click();
  await s.getByRole("button", { name: "Add row" }).click();
  const label = s.getByRole("combobox", { name: "Reference label" });

  await label.fill("tab");
  const list = s.getByRole("listbox", { name: "Suggested tags" });
  await expect(list.getByRole("option")).toHaveText([/Guitar tab/]);
  await label.press("ArrowDown");
  await label.press("Enter");
  await expect(label).toHaveValue("Guitar tab");
  await expect(list).toHaveCount(0);

  await s.getByRole("button", { name: "Add row" }).click();
  const second = s.getByRole("combobox", { name: "Reference label" }).last();
  await second.fill("l");
  await s.getByRole("option", { name: /Lyrics/ }).click();
  await expect(second).toHaveValue("Lyrics");

  await s.getByRole("button", { name: "Add row" }).click();
  const third = s.getByRole("combobox", { name: "Reference label" }).last();
  await third.fill("Brand new tag");
  await expect(s.getByRole("listbox")).toHaveCount(0);
  await expect(third).toHaveValue("Brand new tag");
});
