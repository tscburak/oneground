# OneGround

> Test before you integrate.

Open-source playground and evaluation toolkit for testing, comparing, and benchmarking decision models before integration.

## Run

Requires Node.js 22.5+.

```sh
npx oneground@latest --open
```

`npx` (no install, always fresh) is the recommended way to run releases.
`npm i -g oneground` works too, then run `oneground --open`. Flags:
`--port 3001`, `--hostname 127.0.0.1`, `--db-path <file>`, `--open`.

Docker (reproducible, no Node toolchain on the host):

```sh
docker compose up --build
# or: docker run -p 3001:3000 -v oneground-data:/data ghcr.io/tscburak/oneground
```

From source:

```sh
npm install
npm run dev
```

Open http://localhost:3001/. Playground is the first and default tab; Eval Lab sits beside it. The interface language (English/Türkçe) is stored with the other preferences in SQLite and switched from Settings → Preferences; no locale path prefix is used. Both use the same responsive page width and padding, with reserved scrollbar space to prevent horizontal movement between tabs.

The Tutorial / Öğretici button in the header starts a Driver.js tour for the Playground. Tours support English/Turkish, previous/next steps, Escape/close, and reduced-motion preferences. Tours explain controls without changing records or starting API calls.

This deployment is intended for a local, trusted workspace. Multi-user authentication, per-user data isolation, distributed storage and ephemeral/serverless deployment are outside this implementation.

## Data and backup

Settings, model profiles and encrypted API keys live in one SQLite file.
Default location (override with `ONEGROUND_DB_PATH` or `--db-path`):

- Linux: `~/.local/share/oneground/oneground.sqlite` (`$XDG_DATA_HOME` respected)
- macOS: `~/Library/Application Support/oneground/oneground.sqlite`
- Windows: `%APPDATA%\oneground\oneground.sqlite`
- Docker: `/data/oneground.sqlite` (persist with a volume)

Back up the `.sqlite` file **plus** its adjacent `.settings.key` file (or your
configured `ONEGROUND_SETTINGS_KEY`); without the key, saved credentials cannot
be decrypted after restore. SQLite uses WAL mode, so never copy the raw files
while the server runs — back up with a SQLite-aware tool instead:

```sh
sqlite3 "$ONEGROUND_DB_PATH" "VACUUM INTO 'oneground-backup.sqlite';"
```

then copy the backup and the `.settings.key` beside it.

## Saved settings and models

Open **Settings / Ayarlar** in the header or the Playground gear button. Create model profiles with a name, evaluator type, model ID, API URL, optional token prices and API key. Save changes explicitly. The **Questions** tab lists the question profiles shared by Playground and Eval Lab; add new ones or edit/delete existing ones with the same Noul/Choice/Score editor used across the app. Model profiles and preferences are stored in the SQLite database (WAL mode, see Data and backup); set `ONEGROUND_DB_PATH` to change the location. API keys are encrypted with AES-256-GCM and never included in settings responses or repeated inference requests from the browser. Blank key input preserves a saved key; **Clear key** followed by **Save model** removes it. New key input replaces it.

The default Playground model, single/bulk mode and delimiter persist. Playground and Eval Lab send a saved profile ID; the server loads its model, endpoint and key. A saved credential is only used for the profile's configured endpoint. Deleting a model removes its credential.

No model profiles are created automatically. Add them in Settings; a **Support ticket** question profile is seeded on first initialization. Subsequent credentials, model and question changes are managed through Settings.

The encryption key is generated in `.settings.key` beside the SQLite file. Alternatively, set `ONEGROUND_SETTINGS_KEY` to a stable base64-encoded 32-byte key before creating credentials. Keep that choice stable for existing encrypted records; changing the master key does not automatically re-encrypt saved keys.

## Playground

Enter text or JSON (single or bulk mode), define Noul/Choice/Score questions, choose a saved model profile and run inference. Results show the answers, the request and the raw response. Playground never persists inputs; it only reads saved settings.

## Eval Lab

A five-step wizard: pick a question profile first (load a saved one or define questions manually), drop a labeled dataset file (JSON, JSONL, CSV, TSV, XML) or paste it manually, preview the top 20 rows, match the state field plus one expected-answer column per question, then run the first 10 rows on one to six saved System One profiles. Results show the dataset name, per-model accuracy (exact match vs ground truth), per-question accuracy, latency, errors and row-level correct/incorrect marks, with JSON/CSV export. Question profiles are stored in the workspace SQLite database (latest 20, backed up with the database file) and shared with the Playground, which can load any saved profile into its question editor. Datasets and runs are never stored — swap the dataset while keeping the profile, or keep the dataset and change models. Keep a held-out test split and never tune prompts on it; tune on validation, report on test.

## Evaluators

- **System One:** select a saved model profile and configure its key in Settings. Model aliases and endpoints are configurable; the actual returned model ID is stored when provided.
- **LLM:** OpenAI-compatible `/v1/chat/completions` with JSON output and temperature zero; save a model/key profile in Settings and select it. Outputs must satisfy the same question domains as System One. Missing/invalid output is reported with the raw response and any available usage. No self-reported confidence is used.

Credentials are read server-side from encrypted database records and are never sent to the browser. Set optional input/output USD-per-million-token prices to estimate costs. Unknown usage/prices produce an unknown cost. Provider 429/502/503/504 responses retry up to three times; each attempt times out after 30 seconds.

## Checks

```sh
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/provider tests use a local mock HTTP server and never call paid APIs. Playwright starts the production web server on port 3100 with an isolated `data/e2e.sqlite` database, then checks Playground, Eval Lab dataset parsing, settings persistence, mobile layout and Turkish/English navigation.
