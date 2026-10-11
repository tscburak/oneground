import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { databasePath, defaultDatabasePath } from "../lib/lab/store";

const originalDb = process.env.ONEGROUND_DB_PATH;
const originalXdg = process.env.XDG_DATA_HOME;
function restore() {
  if (originalDb === undefined) delete process.env.ONEGROUND_DB_PATH;
  else process.env.ONEGROUND_DB_PATH = originalDb;
  if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdg;
}

test("explicit ONEGROUND_DB_PATH wins (absolute and cwd-relative)", async (t) => {
  t.after(restore);
  process.env.ONEGROUND_DB_PATH = join("tmp", "explicit.sqlite");
  assert.equal(
    databasePath(),
    join(process.cwd(), "tmp", "explicit.sqlite"),
  );
  process.env.ONEGROUND_DB_PATH = join(tmpdir(), "oneground-abs-test.sqlite");
  assert.equal(databasePath(), resolve(process.env.ONEGROUND_DB_PATH));
});

test("default database path is absolute and per-user", async (t) => {
  t.after(restore);
  delete process.env.ONEGROUND_DB_PATH;
  const fallback = defaultDatabasePath();
  assert.ok(isAbsolute(fallback));
  assert.ok(fallback.endsWith(join("oneground", "oneground.sqlite")));
  assert.equal(databasePath(), fallback);
  if (process.platform !== "win32" && process.platform !== "darwin") {
    process.env.XDG_DATA_HOME = "/tmp/xdg-test";
    assert.equal(
      defaultDatabasePath(),
      "/tmp/xdg-test/oneground/oneground.sqlite",
    );
  }
});
