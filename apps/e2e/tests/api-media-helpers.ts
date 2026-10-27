import { BANDS } from "@greenroom/db";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { API_URL } from "../src/env.js";
import { expect } from "../src/fixtures.js";
import { apiWithCookie } from "./spotify-helpers.js";

export const BAND = BANDS.nightOwls.id;
export const DRIVE = `/bands/${BAND}/integrations/google/drive`;

// 1x1 PNG.
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export interface Fx {
  id: string;
  name: string;
  parentId: string | null;
  trashed: boolean;
  mimeType: string;
}

export async function clientFor(
  testApi: {
    login(email: string): Promise<{ cookie: { name: string; value: string } }>;
  },
  email: string,
): Promise<APIRequestContext> {
  const { cookie } = await testApi.login(email);
  return apiWithCookie(cookie);
}

export function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL });
}

/** Runs the fake Google sign-in for Drive as `api`'s user. */
export async function linkDrive(api: APIRequestContext): Promise<void> {
  const res = await api.get(`/bands/${BAND}/integrations/google/drive/start`, {
    params: { redirectTo: "/band/media" },
    maxRedirects: 0,
  });
  const state = new URL(res.headers()["location"]!).searchParams.get("state")!;
  const cb = await api.get("/integrations/google/callback", {
    params: { code: "fake-code:band@example.com", state },
    maxRedirects: 0,
  });
  expect(cb.status()).toBe(302);
}

/** Links Drive and picks the first fake-picker folder. Returns the status JSON. */
export async function setupDrive(
  api: APIRequestContext,
  folderName = "Band stuff",
) {
  await linkDrive(api);
  const picker = await (await api.get(`${DRIVE}/fake-picker`)).json();
  const folder = picker.folders.find(
    (f: { name: string }) => f.name === folderName,
  );
  const res = await api.post(`${DRIVE}/folder`, {
    data: { folderId: folder.id },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

export class FakeDrive {
  constructor(private readonly api: APIRequestContext) {}

  static async create(): Promise<FakeDrive> {
    return new FakeDrive(await anon());
  }

  async files(): Promise<Fx[]> {
    return (await this.api.get("/__test__/media/files")).json();
  }

  async byName(name: string): Promise<Fx | undefined> {
    return (await this.files()).find((f) => f.name === name);
  }

  async external(body: Record<string, unknown>) {
    const res = await this.api.post("/__test__/media/external", { data: body });
    expect(res.status()).toBe(200);
    return res.json();
  }

  async poll() {
    const res = await this.api.post("/__test__/media/poll");
    expect(res.status()).toBe(200);
    return res.json();
  }

  async content(fileId: string): Promise<Buffer> {
    return Buffer.from(
      await (
        await this.api.get(`/__test__/media/files/${fileId}/content`)
      ).body(),
    );
  }
}
