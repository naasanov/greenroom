import { API_URL } from "../src/env.js";
import { expect, test } from "../src/fixtures.js";

test.skip(({ isMobile }) => isMobile, "API-level spec, desktop only");

// The e2e API runs without STAGING_LOGIN_PASSCODE, so passcode sign-in must be inert.
// The enabled flow is verified by running the built API with the env set (see infra/fly/README.md).
test("passcode sign-in routes do not exist without the passcode env", async ({
  request,
}) => {
  const get = await request.get(`${API_URL}/fake-google/authorize`);
  expect(get.status()).toBe(404);
  const post = await request.post(`${API_URL}/fake-google/authorize`, {
    form: { passcode: "x" },
  });
  expect(post.status()).toBe(404);
});

test("google start still points at the fake accounts host", async ({
  request,
}) => {
  const res = await request.get(`${API_URL}/auth/google/start`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toContain(
    "https://fake-accounts.google.test/",
  );
});
