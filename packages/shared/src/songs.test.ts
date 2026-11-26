import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveSpotifyTrackId,
  deriveYoutubeUrl,
  isSpotifyShortLink,
  spotifyReferenceUrl,
  spotifyTrackIdFromUrl,
  youtubeMusicReferenceUrl,
  youtubeReferenceUrl,
} from "./songs.js";
import { youtubeVideoId } from "./youtube.js";

test("youtubeMusicReferenceUrl returns the first YouTube Music row, matching the label loosely", () => {
  const refs = [
    { label: "YouTube", value: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
    {
      label: " youtube MUSIC ",
      value: "https://music.youtube.com/watch?v=bbb",
    },
    { label: "YouTube Music", value: "https://music.youtube.com/watch?v=ccc" },
  ];
  assert.equal(
    youtubeMusicReferenceUrl(refs),
    "https://music.youtube.com/watch?v=bbb",
  );
});

test("youtubeMusicReferenceUrl is null without a YouTube Music row", () => {
  assert.equal(youtubeMusicReferenceUrl([]), null);
  assert.equal(
    youtubeMusicReferenceUrl([{ label: "Lyrics", value: "https://x.test" }]),
    null,
  );
});

test("spotifyTrackIdFromUrl reads track links with intl prefixes and queries", () => {
  for (const url of [
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123",
    "https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=x",
    "  https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC/  ",
  ]) {
    assert.equal(spotifyTrackIdFromUrl(url), "4uLU6hMCjMI75M1A2tKUQC", url);
  }
});

test("spotifyTrackIdFromUrl is null for other kinds, hosts and junk", () => {
  for (const url of [
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "https://open.spotify.com/album/abc",
    "https://spotify.link/AbCdEf",
    "https://evil.example.com/track/abc",
    "https://open.spotify.com.evil.example/track/abc",
    "http://open.spotify.com/track/abc",
    "spotify:track:abc",
    "not a url",
    "",
    null,
    undefined,
  ]) {
    assert.equal(spotifyTrackIdFromUrl(url), null, String(url));
  }
});

test("reference helpers pick the first Spotify and YouTube rows case-insensitively", () => {
  const refs = [
    { label: "Lyrics", value: "https://lyrics.example.com/x" },
    { label: " spotify ", value: "https://open.spotify.com/track/first" },
    { label: "SPOTIFY", value: "https://open.spotify.com/track/second" },
    { label: "youtube", value: "https://youtu.be/abcDEF12345" },
    { label: "YouTube Music", value: "https://music.youtube.com/watch?v=mus" },
  ];
  assert.equal(
    spotifyReferenceUrl(refs),
    "https://open.spotify.com/track/first",
  );
  assert.equal(youtubeReferenceUrl(refs), "https://youtu.be/abcDEF12345");
  assert.equal(youtubeVideoId(youtubeReferenceUrl(refs)), "abcDEF12345");
  assert.equal(spotifyReferenceUrl([]), null);
  assert.equal(youtubeReferenceUrl([refs[0]!]), null);
});

test("deriveSpotifyTrackId prefers the reference and falls back only without one", () => {
  const ref = (value: string) => [{ label: "Spotify", value }];
  assert.equal(
    deriveSpotifyTrackId(ref("https://open.spotify.com/track/fromRef"), "col"),
    "fromRef",
  );
  assert.equal(deriveSpotifyTrackId([], "col"), "col");
  assert.equal(deriveSpotifyTrackId([], null), null);
  // An unresolved short link means no id, even with a stored column.
  assert.equal(
    deriveSpotifyTrackId(ref("https://spotify.link/abc"), "col"),
    null,
  );
});

test("deriveYoutubeUrl prefers the reference and falls back to the stored link", () => {
  const refs = [{ label: "YouTube", value: "https://youtu.be/abcDEF12345" }];
  assert.equal(
    deriveYoutubeUrl(refs, "https://youtu.be/other"),
    refs[0]!.value,
  );
  assert.equal(
    deriveYoutubeUrl([], "https://youtu.be/other"),
    "https://youtu.be/other",
  );
  assert.equal(deriveYoutubeUrl([], null), null);
});

test("isSpotifyShortLink matches only https spotify.link", () => {
  assert.equal(isSpotifyShortLink("https://spotify.link/AbCdEf"), true);
  assert.equal(isSpotifyShortLink("http://spotify.link/AbCdEf"), false);
  assert.equal(isSpotifyShortLink("https://open.spotify.com/track/x"), false);
  assert.equal(
    isSpotifyShortLink("https://spotify.link.evil.example/x"),
    false,
  );
});
