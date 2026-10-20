// Run after build: INTEGRATIONS_MODE=fake node dist/integrations/__checks__/smoke.js
import "reflect-metadata";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import {
  EMAIL,
  GITHUB,
  GOOGLE_CALENDAR,
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
  NotImplementedError,
  type EmailAdapter,
  type GithubAdapter,
  type GoogleCalendarAdapter,
  type GoogleDriveAdapter,
  type GoogleOAuthAdapter,
  type GooglePlacesAdapter,
  type SongsterrAdapter,
  type SpotifyAdapter,
  type YoutubeAdapter,
} from "../index.js";

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
  assert.equal(app.get(GOOGLE_DRIVE), reg.googleDrive);
  const oauth = app.get<GoogleOAuthAdapter>(GOOGLE_OAUTH);
  const drive = app.get<GoogleDriveAdapter>(GOOGLE_DRIVE);
  const cal = app.get<GoogleCalendarAdapter>(GOOGLE_CALENDAR);
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

  // drive: tree, trash, 404
  const gigs = await drive.createFolder({
    name: "Gigs",
    parentId: FAKE_DRIVE_ROOT_ID,
  });
  const start = await drive.getStartPageToken();
  const { sessionUri } = await drive.startResumableUpload({
    name: "clip.mp4",
    parentId: gigs.id,
    mimeType: "video/mp4",
    totalSize: 10,
  });
  const first = await drive.uploadChunk(sessionUri, {
    start: 0,
    end: 3,
    total: 10,
    data: Buffer.from("abcd"),
  });
  assert.deepEqual(first, { status: "incomplete", receivedBytes: 4 });
  reg.googleDrive.interruptUpload(sessionUri, 2);
  await assert.rejects(
    drive.uploadChunk(sessionUri, {
      start: 4,
      end: 9,
      total: 10,
      data: Buffer.from("efghij"),
    }),
  );
  const st = await drive.getUploadStatus(sessionUri);
  assert.deepEqual(st, { status: "incomplete", receivedBytes: 6 });
  const done = await drive.uploadChunk(sessionUri, {
    start: 6,
    end: 9,
    total: 10,
    data: Buffer.from("ghij"),
  });
  assert.equal(done.status, "complete");
  if (done.status !== "complete") throw new Error("unreachable");
  const fileId = done.file.id;
  const dl = await drive.download(fileId);
  assert.equal(dl.status, "ok");
  if (dl.status === "ok")
    assert.equal((await drain(dl.stream)).toString(), "abcdefghij");
  await drive.rename(fileId, "clip2.mp4");
  await drive.trash(fileId);
  assert.equal((await drive.listChildren(gigs.id)).length, 0);
  const ch = await drive.getChanges(start);
  assert.ok(ch.changes.some((c) => c.fileId === fileId && c.file?.trashed));
  assert.deepEqual((await drive.getChanges(ch.newStartPageToken)).changes, []);
  reg.googleDrive.externalDelete(fileId);
  assert.equal((await drive.getFile(fileId)).status, "not-found");

  // calendar: etags, instance, external decline, sync token expiry
  const { calendarId } = await cal.createCalendar({
    summary: "Band",
    timeZone: "UTC",
  });
  const baseline = await cal.listChanges(calendarId);
  assert.equal(baseline.status, "ok");
  if (baseline.status !== "ok") throw new Error("unreachable");
  const ev = await cal.createEvent(calendarId, {
    summary: "Practice",
    start: "2026-11-03T19:00:00Z",
    end: "2026-11-03T21:00:00Z",
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU"],
    attendeeEmails: ["a@x.test"],
  });
  const upd = await cal.updateEvent(calendarId, ev.id, { location: "Garage" });
  assert.ok(upd.status === "ok" && upd.event.etag !== ev.etag);
  assert.equal(
    (await cal.updateEvent(calendarId, ev.id, { location: "Y" }, ev.etag))
      .status,
    "etag-mismatch",
  );
  const inst = await cal.patchInstance(
    calendarId,
    ev.id,
    "2026-11-10T19:00:00Z",
    { cancelled: true },
  );
  assert.ok(inst.status === "ok" && inst.event.cancelled);
  reg.googleCalendar.simulateAttendeeResponse(
    calendarId,
    ev.id,
    "a@x.test",
    "declined",
  );
  const delta = await cal.listChanges(calendarId, baseline.nextSyncToken);
  assert.ok(delta.status === "ok");
  if (delta.status === "ok") {
    const e = delta.events.find((x) => x.id === ev.id);
    assert.equal(e?.attendees[0]?.responseStatus, "declined");
  }
  reg.googleCalendar.expireSyncTokens(calendarId);
  assert.equal(
    (await cal.listChanges(calendarId, baseline.nextSyncToken)).status,
    "sync-token-expired",
  );
  assert.equal((await cal.deleteEvent(calendarId, ev.id)).status, "ok");

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
    (await spotify.getPublicPlaylist(FAKE_PUBLIC_PLAYLIST_ID)).status,
    "ok",
  );
  assert.equal(
    (await spotify.getPublicPlaylist(FAKE_PRIVATE_PLAYLIST_ID)).status,
    "not-found-or-private",
  );
  assert.equal(
    (
      await spotify.getPrivatePlaylist(
        FAKE_SPOTIFY_OWNER_TOKEN,
        FAKE_PRIVATE_PLAYLIST_ID,
      )
    ).status,
    "ok",
  );
  assert.equal(
    (
      await spotify.getPrivatePlaylist(
        "fake-spotify-other",
        FAKE_PRIVATE_PLAYLIST_ID,
      )
    ).status,
    "not-found-or-private",
  );
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
    await songsterr.searchTab({ title: "Mr. Brightside", artist: "Killers" }),
  );
  assert.equal(await songsterr.searchTab({ title: "Nothing" }), null);
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

  // real stubs throw
  const { RealEmailAdapter } = await import("../index.js");
  await assert.rejects(
    new RealEmailAdapter().sendMagicLink(),
    NotImplementedError,
  );

  await app.close();
  console.log("integrations smoke: ok");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
