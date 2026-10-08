import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync, writeFileSync, linkSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { db, databasePath } from "./lab/store";
import type {
  ModelProfile,
  ModelSettings,
  Preferences,
} from "./model-settings-types";

type StoredProfile = Omit<ModelProfile, "hasApiKey">;
type ProfileRow = { body: string; secret: string | null };
export type ProfileInput = Omit<ModelProfile, "id" | "hasApiKey"> & {
  id?: string;
  apiKey?: string;
  clearApiKey?: boolean;
};

function masterKey(): Buffer {
  if (process.env.ONEGROUND_SETTINGS_KEY) {
    const key = Buffer.from(process.env.ONEGROUND_SETTINGS_KEY, "base64");
    if (key.length !== 32)
      throw new Error(
        "ONEGROUND_SETTINGS_KEY must be a base64-encoded 32-byte key.",
      );
    return key;
  }
  const target = join(dirname(databasePath()), ".settings.key");
  try {
    return readFileSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, randomBytes(32), { flag: "wx", mode: 0o600 });
  try {
    linkSync(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    unlinkSync(temporary);
  }
  return readFileSync(target);
}
function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((value) => value.toString("base64"))
    .join(".");
}
function decrypt(value: string) {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
export function canonicalEndpoint(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Endpoint must be HTTP(S), without credentials, query or fragment.",
    );
  return url.toString().replace(/\/+$/, "");
}
function initialize() {
  db().exec(
    "CREATE TABLE IF NOT EXISTS model_profiles (id TEXT PRIMARY KEY, body TEXT NOT NULL, secret TEXT); CREATE TABLE IF NOT EXISTS app_settings (id TEXT PRIMARY KEY, body TEXT NOT NULL);",
  );
  db()
    .transaction(() => {
      if (
        db().prepare("SELECT id FROM app_settings WHERE id='preferences'").get()
      )
        return;
      const seeds = [
        {
          id: "system-one-hosted",
          name: "System One hosted",
          kind: "system-one" as const,
          model: "jev-latest",
          baseUrl: "https://api.typesafe.ai",
          apiKey: process.env.TYPESAFE_API_KEY,
        },
        {
          id: "system-one-local",
          name: "System One local",
          kind: "system-one" as const,
          model: "jev-latest",
          baseUrl: process.env.KEV_BASE_URL || "http://127.0.0.1:8008",
          apiKey: process.env.LOCAL_SYSTEM_ONE_API_KEY,
        },
        ...(process.env.LLM_API_KEY
          ? [
              {
                id: "llm-imported",
                name: "LLM",
                kind: "llm" as const,
                model: process.env.LLM_MODEL || "",
                baseUrl:
                  process.env.LLM_BASE_URL || "https://api.openai.com/v1",
                apiKey: process.env.LLM_API_KEY,
              },
            ]
          : []),
      ];
      for (const { apiKey, ...seed } of seeds) {
        const profile: StoredProfile = {
          ...seed,
          baseUrl: canonicalEndpoint(seed.baseUrl),
          prompt: "Apply the question definitions consistently.",
          inputPrice: null,
          outputPrice: null,
        };
        db()
          .prepare("INSERT OR IGNORE INTO model_profiles VALUES (?,?,?)")
          .run(
            profile.id,
            JSON.stringify(profile),
            apiKey?.trim() ? encrypt(apiKey.trim()) : null,
          );
      }
      db()
        .prepare("INSERT INTO app_settings VALUES ('preferences',?)")
        .run(
          JSON.stringify({
            defaultProfileId: "system-one-hosted",
            stateMode: "single",
            delimiter: "newline",
          } satisfies Preferences),
        );
    })
    .immediate();
}
export function getModelSettings(): ModelSettings {
  initialize();
  const rows = db()
    .prepare("SELECT body,secret FROM model_profiles ORDER BY rowid")
    .all() as ProfileRow[];
  const preferences = db()
    .prepare("SELECT body FROM app_settings WHERE id='preferences'")
    .get() as { body: string };
  return {
    models: rows.map((row) => ({
      ...JSON.parse(row.body),
      hasApiKey: !!row.secret,
    })),
    preferences: JSON.parse(preferences.body),
  };
}
export function getModelProfile(id?: string): StoredProfile {
  const settings = getModelSettings();
  const profile = settings.models.find(
    (model) => model.id === (id || settings.preferences.defaultProfileId),
  );
  if (!profile) throw new Error("Saved model profile not found.");
  const { hasApiKey: _masked, ...stored } = profile;
  void _masked;
  return stored;
}
export function saveModelProfile(input: ProfileInput): ModelProfile {
  initialize();
  const id = input.id || randomUUID(),
    baseUrl = canonicalEndpoint(input.baseUrl);
  if (!input.name.trim() || !input.model.trim())
    throw new Error("Profile name and model are required.");
  return db()
    .transaction(() => {
      const existing = db()
        .prepare("SELECT body,secret FROM model_profiles WHERE id=?")
        .get(id) as ProfileRow | undefined;
      if (input.id && !existing)
        throw new Error("Saved model profile not found.");
      const profile: StoredProfile = {
        id,
        name: input.name.trim(),
        kind: input.kind,
        model: input.model.trim(),
        baseUrl,
        prompt: input.prompt,
        inputPrice: input.inputPrice,
        outputPrice: input.outputPrice,
      };
      const secret = input.clearApiKey
        ? null
        : input.apiKey?.trim()
          ? encrypt(input.apiKey.trim())
          : (existing?.secret ?? null);
      db()
        .prepare(
          "INSERT INTO model_profiles VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,secret=excluded.secret",
        )
        .run(id, JSON.stringify(profile), secret);
      return { ...profile, hasApiKey: !!secret };
    })
    .immediate();
}
export function savePreferences(change: Partial<Preferences>) {
  initialize();
  db()
    .transaction(() => {
      const settings = getModelSettings();
      const preferences = { ...settings.preferences, ...change };
      if (change.defaultProfileId && change.profileIds === undefined)
        preferences.profileIds = [change.defaultProfileId];
      if (
        preferences.defaultProfileId &&
        !settings.models.some(
          (profile) =>
            profile.id === preferences.defaultProfileId &&
            profile.kind === "system-one",
        )
      )
        throw new Error(
          "Default Playground model must be a saved System One profile.",
        );
      if (preferences.profileIds) {
        if (
          preferences.profileIds.length > 6 ||
          new Set(preferences.profileIds).size !== preferences.profileIds.length
        )
          throw new Error(
            "Playground models must be unique and limited to six profiles.",
          );
        for (const id of preferences.profileIds)
          if (
            !settings.models.some(
              (profile) => profile.id === id && profile.kind === "system-one",
            )
          )
            throw new Error(
              "Playground models must be saved System One profiles.",
            );
      }
      db()
        .prepare("UPDATE app_settings SET body=? WHERE id='preferences'")
        .run(JSON.stringify(preferences));
    })
    .immediate();
  return getModelSettings();
}
export function deleteModelProfile(id: string) {
  initialize();
  db()
    .transaction(() => {
      db().prepare("DELETE FROM model_profiles WHERE id=?").run(id);
      const settings = getModelSettings();
      const preferences = { ...settings.preferences };
      if (preferences.profileIds?.includes(id))
        preferences.profileIds = preferences.profileIds.filter(
          (profileId) => profileId !== id,
        );
      if (settings.preferences.defaultProfileId === id)
        preferences.defaultProfileId =
          settings.models.find((model) => model.kind === "system-one")?.id ??
          "";
      db()
        .prepare("UPDATE app_settings SET body=? WHERE id='preferences'")
        .run(JSON.stringify(preferences));
    })
    .immediate();
  return getModelSettings();
}
export function resolveApiKey(config: {
  profileId?: string;
  kind: "system-one" | "llm";
  baseUrl: string;
  model: string;
}) {
  const settings = getModelSettings();
  const endpoint = canonicalEndpoint(config.baseUrl);
  const profile = config.profileId
    ? settings.models.find((profile) => profile.id === config.profileId)
    : (settings.models.find(
        (profile) =>
          profile.kind === config.kind &&
          canonicalEndpoint(profile.baseUrl) === endpoint &&
          profile.model === config.model,
      ) ??
      settings.models.find(
        (profile) =>
          profile.kind === config.kind &&
          canonicalEndpoint(profile.baseUrl) === endpoint &&
          profile.hasApiKey,
      ));
  if (
    config.profileId &&
    (!profile ||
      profile.kind !== config.kind ||
      canonicalEndpoint(profile.baseUrl) !== endpoint)
  )
    throw new Error(
      "Saved credential does not match this evaluator endpoint. Save/select the matching model profile.",
    );
  if (!profile) return undefined;
  const row = db()
    .prepare("SELECT secret FROM model_profiles WHERE id=?")
    .get(profile.id) as { secret: string | null };
  return row.secret ? decrypt(row.secret) : undefined;
}
