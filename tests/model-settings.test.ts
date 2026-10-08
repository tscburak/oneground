import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../lib/lab/store";
import {
  deleteModelProfile,
  getModelSettings,
  resolveApiKey,
  saveModelProfile,
  savePreferences,
} from "../lib/model-settings";

const directory = mkdtempSync(join(tmpdir(), "oneground-settings-")),
  path = join(directory, "settings.sqlite");
process.env.ONEGROUND_DB_PATH = path;
const originalMaster = process.env.ONEGROUND_SETTINGS_KEY;
delete process.env.ONEGROUND_SETTINGS_KEY;
after(() => {
  db().close();
  unlinkSync(path);
  if (existsSync(join(directory, ".settings.key")))
    unlinkSync(join(directory, ".settings.key"));
  rmdirSync(directory);
  if (originalMaster !== undefined)
    process.env.ONEGROUND_SETTINGS_KEY = originalMaster;
});
test("Settings and encrypted model keys survive closing and reopening SQLite", () => {
  const profile = saveModelProfile({
    name: "Persistent local",
    kind: "system-one",
    model: "saved-model",
    baseUrl: "http://127.0.0.1:8765",
    prompt: "test",
    inputPrice: 1,
    outputPrice: 2,
    apiKey: "secret-test-token",
  });
  savePreferences({
    defaultProfileId: profile.id,
    stateMode: "bulk",
    delimiter: "jsonl",
  });
  assert.deepEqual(getModelSettings().preferences.profileIds, [profile.id]);
  assert.throws(() => savePreferences({ profileIds: ["missing"] }), /System One/);
  savePreferences({ profileIds: [profile.id] });
  const stored = db()
    .prepare("SELECT body,secret FROM model_profiles WHERE id=?")
    .get(profile.id) as { body: string; secret: string };
  assert.ok(!JSON.stringify(stored).includes("secret-test-token"));
  assert.ok(!JSON.stringify(getModelSettings()).includes("secret-test-token"));
  db().close();
  assert.equal(getModelSettings().preferences.defaultProfileId, profile.id);
  assert.equal(getModelSettings().preferences.delimiter, "jsonl");
  assert.equal(
    resolveApiKey({
      profileId: profile.id,
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      model: profile.model,
    }),
    "secret-test-token",
  );
  assert.throws(
    () =>
      resolveApiKey({
        profileId: profile.id,
        kind: profile.kind,
        baseUrl: "http://127.0.0.1:9999",
        model: profile.model,
      }),
    /does not match/,
  );
  const kept = saveModelProfile({ ...profile, apiKey: "", name: "Renamed" });
  assert.equal(kept.hasApiKey, true);
  const rotated = saveModelProfile({ ...kept, apiKey: "replacement-token" });
  assert.equal(
    resolveApiKey({
      profileId: profile.id,
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      model: profile.model,
    }),
    "replacement-token",
  );
  const cleared = saveModelProfile({ ...rotated, clearApiKey: true });
  assert.equal(cleared.hasApiKey, false);
  assert.equal(
    resolveApiKey({
      profileId: profile.id,
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      model: profile.model,
    }),
    undefined,
  );
  const remaining = deleteModelProfile(profile.id);
  assert.ok(!remaining.models.some((model) => model.id === profile.id));
  assert.notEqual(remaining.preferences.defaultProfileId, profile.id);
});
