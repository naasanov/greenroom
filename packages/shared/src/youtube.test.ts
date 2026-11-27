import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeVideoId } from "./youtube.js";

test("youtubeVideoId reads watch, music, short, embed and youtu.be links", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=abcDEF12345&t=3",
    "https://music.youtube.com/watch?v=abcDEF12345&si=x",
    "https://youtu.be/abcDEF12345?si=x",
    "https://www.youtube.com/shorts/abcDEF12345",
    "https://www.youtube.com/embed/abcDEF12345",
    "https://m.youtube.com/live/abcDEF12345",
  ]) {
    assert.equal(youtubeVideoId(url), "abcDEF12345", url);
  }
});

test("youtubeVideoId is null for playlists, other hosts and junk", () => {
  for (const url of [
    "https://music.youtube.com/playlist?list=PLmusic01",
    "https://example.com/watch?v=abcDEF12345",
    "not a url",
    "",
    null,
    undefined,
  ]) {
    assert.equal(youtubeVideoId(url), null);
  }
});
