import { API_URL } from "../src/env.js";
import { eq } from "drizzle-orm";
import { bands, memberships } from "@greenroom/db";
import { expect, test } from "../src/fixtures.js";

test("api health reports the database up", async ({ request }) => {
  const res = await request.get(`${API_URL}/health`);
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", database: "up" });
});

test("web home redirects signed-out visitors to the sign-in page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Your band's home base" }),
  ).toBeVisible();
});

test("seed band returns fixtures that exist in the database", async ({
  testApi,
  db,
}) => {
  const seeded = await testApi.seed("band");
  expect(seeded.bands.nightOwls.slug).toBe("night-owls");

  const [band] = await db
    .select()
    .from(bands)
    .where(eq(bands.id, seeded.bands.nightOwls.id));
  expect(band?.name).toBe("The Night Owls");

  const members = await db
    .select()
    .from(memberships)
    .where(eq(memberships.bandId, seeded.bands.nightOwls.id));
  expect(members).toHaveLength(4);
});

test("reset empties the database and the email fake", async ({
  testApi,
  db,
}) => {
  await testApi.seed("band");
  await testApi.reset();
  expect(await db.select().from(bands)).toHaveLength(0);
  expect(await testApi.magicLinksFor("ava@example.com")).toEqual([]);
});
