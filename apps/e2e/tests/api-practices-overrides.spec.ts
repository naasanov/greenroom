import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const FROM = "2099-01-01T00:00:00Z";
const TO = "2099-02-01T00:00:00Z";

async function setup(testApi: import("../src/test-api.js").TestApi) {
  const { cookie } = await testApi.login("a@example.com");
  const api: APIRequestContext = await pwRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Cookie: `${cookie.name}=${cookie.value}` },
  });
  const band = await (
    await api.post("/bands", { data: { name: "The Foxes" } })
  ).json();
  const series = await (
    await api.post(`/bands/${band.id}/practices`, {
      data: {
        title: "Practice",
        startDate: "2099-01-06",
        startTime: "19:00",
        durationMinutes: 120,
        timeZone: "UTC",
        recurrence: { freq: "weekly" },
      },
    })
  ).json();
  const list = async (includeCancelled = false): Promise<Json[]> =>
    (
      await api.get(`/bands/${band.id}/events`, {
        params: {
          from: FROM,
          to: TO,
          ...(includeCancelled ? { includeCancelled: "true" } : {}),
        },
      })
    ).json();
  const occ = (key: string) =>
    `/bands/${band.id}/practices/${series.id}/occurrences/${key}`;
  return { api, band, series, list, occ };
}

test("an All events rename reaches occurrences edited with This event", async ({
  testApi,
}) => {
  const { api, list, occ } = await setup(testApi);
  const jan13 = "20990113T190000Z";
  const jan20 = "20990120T190000Z";
  // The full-form payload repeats the unchanged title and location.
  await api.patch(occ(jan13), {
    data: {
      scope: "this",
      title: "Practice",
      startDate: "2099-01-13",
      startTime: "20:00",
    },
  });
  await api.patch(occ(jan20), {
    data: { scope: "this", title: "Special night" },
  });
  const res = await api.patch(occ("20990106T190000Z"), {
    data: { scope: "all", title: "Rehearsal" },
  });
  expect(res.status()).toBe(200);
  const titles = Object.fromEntries(
    (await list()).map((e) => [e.occurrenceKey, e.title]),
  );
  expect(titles[jan13]).toBe("Rehearsal");
  expect(titles[jan20]).toBe("Special night");
  await api.dispose();
});

test("cancelled occurrences are listed only on request and flagged", async ({
  testApi,
}) => {
  const { api, list, occ } = await setup(testApi);
  const key = "20990113T190000Z";
  await api.delete(`${occ(key)}?scope=this`);
  expect((await list()).map((e) => e.occurrenceKey)).not.toContain(key);
  const all = await list(true);
  const hit = all.find((e) => e.occurrenceKey === key);
  expect(hit).toMatchObject({ cancelled: true });
  expect(all.filter((e) => e.cancelled)).toHaveLength(1);
  await api.dispose();
});
