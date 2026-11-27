import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertLocalDatabase, RemoteDatabaseError } from "./guard-remote-db.js";

const refuses = (url: string, env: Record<string, string> = {}) =>
  assert.throws(() => assertLocalDatabase(url, env), RemoteDatabaseError);

describe("assertLocalDatabase", () => {
  it("allows localhost, 127.0.0.1 and ::1", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      assertLocalDatabase(`postgres://u:p@${host}:5432/x`, {});
    }
  });

  it("refuses other hosts and names the host without the password", () => {
    const url = "postgres://u:s3cret@db.example.com:5432/x";
    try {
      assertLocalDatabase(url, {});
      assert.fail("expected a refusal");
    } catch (err) {
      assert.ok(err instanceof RemoteDatabaseError);
      assert.match(err.message, /db\.example\.com/);
      assert.match(err.message, /ALLOW_REMOTE_DB=1/);
      assert.doesNotMatch(err.message, /s3cret/);
    }
  });

  it("refuses CI and Fly internal hosts", () => {
    refuses("postgres://u:p@postgres:5432/x");
    refuses("postgres://u:p@greenroom-staging-db.internal:5432/x");
  });

  it("is not fooled by userinfo or a host query override", () => {
    refuses("postgres://localhost:pw@db.example.com/x");
    refuses("postgres://localhost/x?host=db.example.com");
  });

  it("refuses an unparseable URL", () => {
    refuses("not a url");
  });

  it("is bypassed only by ALLOW_REMOTE_DB=1", () => {
    const url = "postgres://u:p@db.example.com:5432/x";
    assertLocalDatabase(url, { ALLOW_REMOTE_DB: "1" });
    refuses(url, { ALLOW_REMOTE_DB: "true" });
    refuses(url, { ALLOW_REMOTE_DB: "0" });
  });
});
