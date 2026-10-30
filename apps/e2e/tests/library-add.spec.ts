import type { Page } from "@playwright/test";
import { USERS } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";
import type { TestApi } from "../src/test-api.js";
import {
  apiAs,
  cards,
  fabAction,
  openLibrary,
  sheet,
} from "./library-helpers.js";
import { apiWithCookie, connectSpotify } from "./spotify-helpers.js";

async function startAdd(
  page: Page,
  testApi: TestApi,
  loginAs: (email: string) => Promise<unknown>,
) {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  await fabAction(page, "add-song");
  await expect(sheet(page)).toContainText("Add song");
}

const smart = (page: Page) =>
  sheet(page).getByRole("textbox", { name: "Song link or search" });

test("FAB offers Add song and Import playlist", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await openLibrary(page);
  await page.getByRole("button", { name: "Add music" }).click();
  await expect(page.getByTestId("fab-action-add-song")).toBeVisible();
  await expect(page.getByTestId("fab-action-import-playlist")).toBeVisible();
});

test("only the smart input shows until a match or manual entry", async ({
  page,
  testApi,
  loginAs,
}) => {
  await startAdd(page, testApi, loginAs);
  await expect(smart(page)).toBeVisible();
  await expect(sheet(page).getByLabel("Title")).toHaveCount(0);
  await expect(
    sheet(page).getByRole("button", { name: "Enter manually" }),
  ).toBeVisible();
});

test("add via a Spotify link", async ({ page, testApi, loginAs }) => {
  await startAdd(page, testApi, loginAs);
  await smart(page).fill("https://open.spotify.com/track/fakeTrack3");
  const candidate = sheet(page).getByTestId("candidate");
  await expect(candidate).toContainText("Take Me Out");
  await expect(candidate).toContainText("Franz Ferdinand");
  await candidate.click();

  await expect(sheet(page).getByLabel("Title")).toHaveValue("Take Me Out");
  await expect(sheet(page).getByLabel("Artist")).toHaveValue("Franz Ferdinand");
  await expect(sheet(page).getByLabel("Duration")).toHaveValue("3:57");
  await expect(sheet(page).getByLabel("Reference value")).toHaveValue(
    "https://open.spotify.com/track/fakeTrack3",
  );
  await sheet(page).getByRole("button", { name: "Done" }).click();

  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]+$/);
  await expect(sheet(page).getByTestId("song-view")).toContainText(
    "Take Me Out",
  );
  await expect(sheet(page).getByTestId("reference-link")).toContainText(
    "Spotify",
  );
  await expect(cards(page).filter({ hasText: "Take Me Out" })).toHaveCount(1);
});

test("add via a YouTube link", async ({ page, testApi, loginAs }) => {
  await startAdd(page, testApi, loginAs);
  await smart(page).fill("https://www.youtube.com/watch?v=fakeVid0001");
  await sheet(page).getByTestId("candidate").click();
  await expect(sheet(page).getByLabel("Title")).toHaveValue(
    "Fake Band - Live at the Garage",
  );
  await expect(sheet(page).getByLabel("Artist")).toHaveValue("Fake Band");
  await expect(sheet(page).getByLabel("Duration")).toHaveValue("3:35");
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(sheet(page).getByTestId("song-view")).toContainText(
    "Fake Band - Live at the Garage",
  );
});

test("add via search and picking a candidate", async ({
  page,
  testApi,
  loginAs,
}) => {
  await startAdd(page, testApi, loginAs);
  await smart(page).fill("seven nation");
  await sheet(page).getByTestId("candidate").click();
  await expect(sheet(page).getByLabel("Title")).toHaveValue(
    "Seven Nation Army",
  );
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(
    cards(page).filter({ hasText: "Seven Nation Army" }),
  ).toHaveCount(1);
});

test("manual entry carries the typed text into Title", async ({
  page,
  testApi,
  loginAs,
}) => {
  await startAdd(page, testApi, loginAs);
  await smart(page).fill("My Original Song");
  await sheet(page).getByRole("button", { name: "Enter manually" }).click();
  await expect(sheet(page).getByLabel("Title")).toHaveValue("My Original Song");
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(cards(page).filter({ hasText: "My Original Song" })).toHaveCount(
    1,
  );
});

test("no results suggests manual entry and title is required", async ({
  page,
  testApi,
  loginAs,
}) => {
  await startAdd(page, testApi, loginAs);
  await smart(page).fill("qqqqzzzz");
  await expect(sheet(page).getByTestId("no-matches")).toContainText(
    "enter the song manually",
  );
  await sheet(page).getByRole("button", { name: "Enter manually" }).click();
  await sheet(page).getByLabel("Title").fill("");
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(sheet(page).getByText("Title is required")).toBeVisible();
});

test("duplicate warning links to the song and allows add anyway", async ({
  page,
  testApi,
  loginAs,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  const api = await apiAs(testApi, USERS.ava.email);
  const bands = (await (await api.get("/bands")).json()) as {
    id: string;
    name: string;
  }[];
  const bandId = bands.find((b) => b.name === "The Night Owls")!.id;
  const existing = await (
    await api.post(`/bands/${bandId}/songs`, {
      data: {
        title: "Mr. Brightside",
        artist: "The Killers",
        spotifyTrackId: "fakeTrack1",
      },
    })
  ).json();

  await openLibrary(page);
  await fabAction(page, "add-song");
  await smart(page).fill("brightside");
  const candidate = sheet(page).getByTestId("candidate");
  await expect(candidate).toContainText("Already in your library");
  await candidate.click();
  await sheet(page).getByRole("button", { name: "Done" }).click();

  const notice = sheet(page).getByTestId("duplicate-notice");
  await expect(notice).toContainText("already in your library");
  await notice.getByRole("button", { name: "Open it" }).click();
  await expect(page).toHaveURL(new RegExp(`/songs/${existing.id}$`));

  // Back through the add flow and force the duplicate.
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await fabAction(page, "add-song");
  await smart(page).fill("brightside");
  await sheet(page).getByTestId("candidate").click();
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await sheet(page)
    .getByTestId("duplicate-notice")
    .getByRole("button", { name: "Add anyway" })
    .click();
  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]+$/);
  await expect(page).not.toHaveURL(new RegExp(existing.id));
  await expect(cards(page).filter({ hasText: "Mr. Brightside" })).toHaveCount(
    2,
  );
});

test("Songsterr suggestion is added with one tap", async ({
  page,
  testApi,
  loginAs,
}) => {
  await startAdd(page, testApi, loginAs);
  await smart(page).fill("brightside");
  await sheet(page).getByTestId("candidate").click();
  const suggestion = sheet(page).getByTestId("songsterr-suggestion");
  await expect(suggestion).toContainText("Found a tab on Songsterr. Add it?");
  await suggestion.getByRole("button", { name: "Add tab" }).click();
  await expect(suggestion).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(
    sheet(page).getByTestId("reference-link").filter({ hasText: "Songsterr" }),
  ).toBeVisible();
});

test("a pasted playlist link switches to the import flow", async ({
  page,
  testApi,
  loginAs,
}) => {
  await startAdd(page, testApi, loginAs);
  // Import needs a Spotify login; connect through the API.
  const api = await apiWithCookie(
    (await testApi.login(USERS.ava.email)).cookie,
  );
  await connectSpotify(api);
  await api.dispose();
  await smart(page).fill(
    "https://open.spotify.com/playlist/fakePlaylistPublic",
  );
  await sheet(page).getByRole("button", { name: "Import playlist" }).click();
  const dialog = page.getByRole("dialog", { name: "Import playlist" });
  await expect(
    dialog.getByRole("textbox", { name: "Playlist link" }),
  ).toHaveValue("https://open.spotify.com/playlist/fakePlaylistPublic");
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog.getByTestId("import-summary")).toHaveText(
    "3 added, 0 already in library",
  );
});
