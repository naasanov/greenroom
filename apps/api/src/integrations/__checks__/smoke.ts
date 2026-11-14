// Run after build: INTEGRATIONS_MODE=fake node dist/integrations/__checks__/smoke.js
import "reflect-metadata";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import {
  EMAIL,
  GITHUB,
  GOOGLE_DRIVE,
  GOOGLE_OAUTH,
  GOOGLE_PLACES,
  SONGSTERR,
  SPOTIFY,
  YOUTUBE,
  FAKE_PRIVATE_PLAYLIST_ID,
  FAKE_PUBLIC_PLAYLIST_ID,
  FAKE_SPOTIFY_OWNER_TOKEN,
  FAKE_DRIVE_ROOT_ID,
  FakeIntegrationsRegistry,
  IntegrationsModule,
  type EmailAdapter,
  type GithubAdapter,
  type GoogleDriveAdapter,
  type GoogleOAuthAdapter,
  type GooglePlacesAdapter,
  type SongsterrAdapter,
  type SpotifyAdapter,
  type YoutubeAdapter,
} from "../index.js";
import {
  chunkContentRange,
  parseReceivedBytes,
  thumbnailUrl,
} from "../google-drive/google-drive.mapping.js";

async function drain(s: AsyncIterable<unknown>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(Buffer.from(c as Uint8Array));
  return Buffer.concat(parts);
}

async function main(): Promise<void> {
  process.env.INTEGRATIONS_MODE = "fake";
  const app = await NestFactory.createApplicationContext(IntegrationsModule, {
    logger: false,
  });
  const reg = app.get(FakeIntegrationsRegistry);

  // DI binds tokens to the registry's fakes
  assert.ok(app.get(GOOGLE_DRIVE));
  const oauth = app.get<GoogleOAuthAdapter>(GOOGLE_OAUTH);
  const drive = app.get<GoogleDriveAdapter>(GOOGLE_DRIVE);
  const places = app.get<GooglePlacesAdapter>(GOOGLE_PLACES);
  const spotify = app.get<SpotifyAdapter>(SPOTIFY);
  const yt = app.get<YoutubeAdapter>(YOUTUBE);
  const songsterr = app.get<SongsterrAdapter>(SONGSTERR);
  const gh = app.get<GithubAdapter>(GITHUB);
  const email = app.get<EmailAdapter>(EMAIL);

  // oauth
  assert.match(
    oauth.buildAuthUrl({ redirectUri: "http://x/cb", state: "s1" }),
    /state=s1/,
  );
  const ex = await oauth.exchangeCode({
    code: "fake-code:sam@band.test",
    redirectUri: "http://x/cb",
  });
  assert.equal(ex.status, "ok");
  if (ex.status === "ok") {
    assert.equal(ex.profile.email, "sam@band.test");
    const r = await oauth.refreshAccessToken(ex.tokens.refreshToken ?? "");
    assert.equal(r.status, "ok");
  }
  assert.equal(
    (await oauth.exchangeCode({ code: "bogus", redirectUri: "x" })).status,
    "invalid-code",
  );

  const TOKEN = "fake-google-access-token";

  // drive: tree, trash, 404
  const gigs = await drive.createFolder(TOKEN, {
    name: "Gigs",
    parentId: FAKE_DRIVE_ROOT_ID,
  });
  const start = await drive.getStartPageToken(TOKEN);
  const { sessionUri } = await drive.startResumableUpload(TOKEN, {
    name: "clip.mp4",
    parentId: gigs.id,
    mimeType: "video/mp4",
    totalSize: 10,
  });
  const first = await drive.uploadChunk(TOKEN, sessionUri, {
    start: 0,
    end: 3,
    total: 10,
    data: Buffer.from("abcd"),
  });
  assert.deepEqual(first, { status: "incomplete", receivedBytes: 4 });
  reg.googleDrive.interruptUpload(sessionUri, 2);
  await assert.rejects(
    drive.uploadChunk(TOKEN, sessionUri, {
      start: 4,
      end: 9,
      total: 10,
      data: Buffer.from("efghij"),
    }),
  );
  const st = await drive.getUploadStatus(TOKEN, sessionUri);
  assert.deepEqual(st, { status: "incomplete", receivedBytes: 6 });
  const done = await drive.uploadChunk(TOKEN, sessionUri, {
    start: 6,
    end: 9,
    total: 10,
    data: Buffer.from("ghij"),
  });
  assert.equal(done.status, "complete");
  if (done.status !== "complete") throw new Error("unreachable");
  const fileId = done.file.id;
  const dl = await drive.download(TOKEN, fileId);
  assert.equal(dl.status, "ok");
  if (dl.status === "ok")
    assert.equal((await drain(dl.stream)).toString(), "abcdefghij");
  await drive.rename(TOKEN, fileId, "clip2.mp4");
  await drive.trash(TOKEN, fileId);
  assert.equal((await drive.listChildren(TOKEN, gigs.id)).length, 0);
  const ch = await drive.getChanges(TOKEN, start);
  assert.ok(ch.changes.some((c) => c.fileId === fileId && c.file?.trashed));
  assert.deepEqual(
    (await drive.getChanges(TOKEN, ch.newStartPageToken)).changes,
    [],
  );
  reg.googleDrive.externalDelete(fileId);
  assert.equal((await drive.getFile(TOKEN, fileId)).status, "not-found");

  assert.equal(parseReceivedBytes("bytes=0-262143"), 262144);
  assert.equal(parseReceivedBytes(null), 0);
  assert.equal(chunkContentRange(0, 9, 10), "bytes 0-9/10");
  assert.equal(chunkContentRange(0, -1, 0), "bytes */0");
  assert.equal(thumbnailUrl("https://x.test/a=s220"), "https://x.test/a=s400");

  // drive: external changes and thumbnails
  const tokenBefore = await drive.getStartPageToken(TOKEN);
  const added = reg.googleDrive.externalAddFile("pic.png", gigs.id, "x");
  const thumb = await drive.getThumbnail(TOKEN, added.id);
  assert.equal(thumb.status, "ok");
  if (thumb.status === "ok") {
    assert.ok((await drain(thumb.stream)).toString().includes("pic.png"));
  }
  assert.equal((await drive.getThumbnail(TOKEN, gigs.id)).status, "not-found");
  const ext = await drive.getChanges(TOKEN, tokenBefore);
  assert.ok(ext.changes.some((c) => c.fileId === added.id && !c.removed));

  // places
  const preds = await places.autocomplete("bowery");
  assert.equal(preds.length, 1);
  const pd = await places.getDetails(preds[0]?.placeId ?? "");
  assert.ok(pd.status === "ok" && pd.place.photoUrls.length > 0);
  assert.equal((await places.getDetails("nope")).status, "not-found");

  // spotify
  assert.ok((await spotify.searchTracks("brightside")).length === 1);
  assert.equal(
    (await spotify.getTrack("https://open.spotify.com/track/fakeTrack2?si=1"))
      .status,
    "ok",
  );
  assert.equal(
    (await spotify.getPlaylist("not-a-token", FAKE_PUBLIC_PLAYLIST_ID)).status,
    "unauthorized",
  );
  assert.equal(
    (await spotify.getPlaylist("fake-spotify-other", FAKE_PUBLIC_PLAYLIST_ID))
      .status,
    "ok",
  );
  assert.equal(
    (await spotify.getPlaylist("fake-spotify-other", FAKE_PRIVATE_PLAYLIST_ID))
      .status,
    "forbidden",
  );
  assert.equal(
    (
      await spotify.getPlaylist(
        FAKE_SPOTIFY_OWNER_TOKEN,
        FAKE_PRIVATE_PLAYLIST_ID,
      )
    ).status,
    "ok",
  );
  const sx = await spotify.exchangeCode({
    code: "fake-code:smoke",
    redirectUri: "http://x/cb",
  });
  assert.equal(sx.status, "ok");
  if (sx.status === "ok") {
    assert.equal(
      (await spotify.refreshAccessToken(sx.tokens.refreshToken)).status,
      "ok",
    );
    reg.spotify.revokeRefreshTokens();
    assert.equal(
      (await spotify.refreshAccessToken(sx.tokens.refreshToken)).status,
      "invalid-grant",
    );
  }
  const pl = await spotify.createPlaylist("fake-spotify-u1", { name: "Set" });
  assert.equal(pl.status, "ok");
  if (pl.status === "ok") {
    await spotify.addTracksToPlaylist("fake-spotify-u1", pl.playlist.id, [
      "spotify:track:fakeTrack1",
    ]);
    assert.equal(
      reg.spotify.getStoredPlaylist(pl.playlist.id)?.tracks.length,
      1,
    );
  }

  // youtube, songsterr, github, email
  const v = await yt.getVideoMetadata("https://youtu.be/fakeVid0001");
  assert.ok(v.status === "ok" && v.video.channelName === "Fake Band");
  assert.equal(
    (await yt.getVideoMetadata("https://youtu.be/zzzzzzzzzz")).status,
    "not-found",
  );
  assert.ok(
    (await songsterr.findTabs({ title: "Mr. Brightside", artist: "Killers" }))
      ?.guitar,
  );
  assert.deepEqual(await songsterr.findTabs({ title: "Nothing" }), {});
  const issue = await gh.createIssue({
    title: "t",
    body: "b",
    labels: ["feedback"],
  });
  assert.equal(issue.number, 1);
  assert.equal(reg.github.createdIssues().length, 1);
  await email.sendMagicLink({ to: "a@x.test", link: "http://x/m/1" });
  assert.equal(reg.email.lastMagicLinkFor("a@x.test"), "http://x/m/1");

  // reset
  reg.resetAll();
  assert.equal(reg.github.createdIssues().length, 0);
  assert.equal(reg.email.sentMagicLinks().length, 0);
  assert.equal(reg.googleDrive.allFiles().length, 1);

  // real email adapter: offline checks against a stubbed fetch
  const { RealEmailAdapter, EmailNotConfiguredError } =
    await import("../index.js");
  const savedKey = process.env.RESEND_API_KEY;
  const savedFetch = globalThis.fetch;
  try {
    delete process.env.RESEND_API_KEY;
    await assert.rejects(
      new RealEmailAdapter().sendMagicLink({
        to: "a@x.test",
        link: "http://x",
      }),
      EmailNotConfiguredError,
    );
    process.env.RESEND_API_KEY = "re_smoke_key";
    let seen: {
      url: string;
      auth: string;
      body: Record<string, unknown>;
    } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = {
        url,
        auth: (init.headers as Record<string, string>).Authorization ?? "",
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      };
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await new RealEmailAdapter().sendMagicLink({
      to: "a@x.test",
      link: "http://x/m/1",
    });
    assert.equal(seen!.url, "https://api.resend.com/emails");
    assert.equal(seen!.auth, "Bearer re_smoke_key");
    assert.deepEqual(seen!.body.to, ["a@x.test"]);
    assert.match(String(seen!.body.text), /http:\/\/x\/m\/1/);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "domain not verified" }), {
        status: 403,
      })) as typeof fetch;
    await assert.rejects(
      new RealEmailAdapter().sendMagicLink({
        to: "a@x.test",
        link: "http://x",
      }),
      (e: Error) => /403/.test(e.message) && !e.message.includes("re_smoke"),
    );
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
  }

  await app.close();
  console.log("integrations smoke: ok");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
