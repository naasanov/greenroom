import { USERS } from "@greenroom/db";
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
  await send.click();
  await expect(page.getByTestId("feedback-sent")).toBeVisible();
  const [issue] = await testApi.githubIssues();
  expect(issue!.body).toContain("The widget works");
  expect(issue!.body).toContain("/events");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("shows an error when sending fails", async ({
  page,
  loginAs,
  testApi,
}) => {
  await testApi.seed("band");
  await loginAs(USERS.ava.email);
  await page.route("**/feedback", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await page.goto("/events");
  await page.getByRole("button", { name: "Send feedback" }).click();
  const dialog = page.getByTestId("feedback-dialog");
  await dialog.getByLabel("Message").fill("x");
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not send");
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
