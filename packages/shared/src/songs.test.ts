import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeMusicReferenceUrl } from "./songs.js";

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
