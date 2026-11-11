import { USERS } from "@greenroom/db";
import { request as pwRequest } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test("opens, sends, and confirms; the issue reaches the fake", async ({
  page,
  loginAs,
  testApi,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/events");
  await page.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  await expect(dialog).toBeVisible();
  const send = dialog.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Message").fill("The widget works");
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Category").selectOption({ label: "UI" });
  await expect(dialog.getByLabel("Area")).toHaveValue("Events");
  await send.click();
  await expect(page.getByTestId("feedback-sent")).toBeVisible();
  const [issue] = await testApi.githubIssues();
  expect(issue!.body).toContain("The widget works");
  expect(issue!.body).toContain("/events");
  expect(issue!.body).toContain("Category: UI");
  expect(issue!.body).toContain("Area: Events");
  expect(issue!.labels).toEqual(["feedback"]);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("Done closes without flashing the form back", async ({
  page,
  loginAs,
  testApi,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/roster");
  await page.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  await expect(dialog.getByLabel("Area")).toHaveValue("Roster");
  await dialog.getByLabel("Category").selectOption({ label: "Bug" });
  await dialog.getByLabel("Message").fill("closing check");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("feedback-sent")).toBeVisible();
  // Record whether the textbox ever reappears while the dialog is closing.
  await page.evaluate(() => {
    const w = window as unknown as { formSeen: boolean };
    w.formSeen = false;
    new MutationObserver(() => {
      if (document.getElementById("feedback-message")) w.formSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(
      () => (window as unknown as { formSeen: boolean }).formSeen,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(dialog.getByLabel("Message")).toHaveValue("");
});

test("Ctrl+Enter sends only when Send is enabled", async ({
  page,
  loginAs,
  testApi,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/events");
  await page.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  const box = dialog.getByLabel("Message");
  await dialog.getByLabel("Category").selectOption({ label: "Bug" });
  await box.press("Control+Enter");
  await expect(page.getByTestId("feedback-sent")).toBeHidden();
  await box.fill("sent by keyboard");
  await box.press("Control+Enter");
  await expect(page.getByTestId("feedback-sent")).toBeVisible();
  const issues = await testApi.githubIssues();
  expect(issues).toHaveLength(1);
});

test("keeps a partial draft when closed and reopened", async ({
  page,
  loginAs,
  testApi,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.goto("/events");
  const open = page.getByRole("button", { name: "Send feedback" });
  const dialog = page.getByTestId("feedback-dialog");
  await open.click();
  await dialog.getByLabel("Message").fill("half a thought");
  await dialog.getByLabel("Category").selectOption({ label: "Bug" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await open.click();
  await expect(dialog.getByLabel("Message")).toHaveValue("half a thought");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("feedback-sent")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await open.click();
  await expect(dialog.getByLabel("Message")).toHaveValue("");
});

test("shows an error when sending fails", async ({
  page,
  loginAs,
  testApi,
}) => {
  await testApi.seed("band");
  const { cookie } = await loginAs(USERS.ava.email);
  // Exhaust the per-user rate limit so the widget's own send is rejected.
  const api = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  // The counter survives resets, so post until the limit is hit.
  let limited = false;
  for (let i = 0; i < 6 && !limited; i++) {
    const res = await api.post("/feedback", { data: { message: `m${i}` } });
    limited = res.status() === 429;
  }
  expect(limited).toBe(true);
  await page.goto("/events");
  await page.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  await dialog.getByLabel("Message").fill("one too many");
  await dialog.getByLabel("Category").selectOption({ label: "Bug" });
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("try again later");
  await expect(page.getByTestId("feedback-sent")).toBeHidden();
});

for (const width of [320, 390]) {
  test(`header controls do not overlap at ${width}px`, async ({
    page,
    loginAs,
    testApi,
  }) => {
    await testApi.seed("band");
    await loginAs(USERS.ava.email);
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/events");
    const bar = page.getByTestId("top-bar");
    const boxes = [];
    for (const name of [
      /Switch band/,
      "Send feedback",
      "Profile and settings",
    ]) {
      const el = bar.getByRole("button", { name });
      await expect(el).toBeVisible();
      boxes.push((await el.boundingBox())!);
    }
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i]!.x + boxes[i]!.width).toBeLessThanOrEqual(
        boxes[i + 1]!.x,
      );
    }
    const last = boxes.at(-1)!;
    expect(last.x + last.width).toBeLessThanOrEqual(width);
  });
}
