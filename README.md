# OneGround

A local workspace for typed decisions: Playground for single/bulk inference and Model Compare for side-by-side evaluation of saved model profiles.

## Run

Requires Node.js 22+, npm, and a persistent writable disk.

```sh
npm install
```

Copy `.env.example` to `.env.local` if you need to change the database path or bootstrap existing environment credentials, then start the dev server:

```sh
npm run dev
```

Open http://localhost:3000/en or http://localhost:3000/tr. Playground is the first and default tab; Model Compare sits beside it. Both use the same responsive page width and padding, with reserved scrollbar space to prevent horizontal movement between tabs.

The Tutorial / Öğretici button in the header starts a Driver.js tour for the current section: Playground or Model Compare. Tours support English/Turkish, previous/next steps, Escape/close, and reduced-motion preferences. Tours explain controls without changing records or starting API calls.

This deployment is intended for a local, trusted workspace. Multi-user authentication, per-user data isolation, distributed storage and ephemeral/serverless deployment are outside this implementation. Back up the database with a SQLite-aware backup tool and preserve its adjacent `.settings.key` file (or your configured `ONEGROUND_SETTINGS_KEY`) so saved credentials can be decrypted after restoration.

## Saved settings and models

Open **Settings / Ayarlar** in the header or the Playground gear button. Create model profiles with a name, evaluator type, model ID, API URL, optional token prices and API key. Save changes explicitly. Model profiles and preferences are stored in `data/oneground.sqlite` (SQLite WAL); set `ONEGROUND_DB_PATH` to change the location. API keys are encrypted with AES-256-GCM and never included in settings responses or repeated inference requests from the browser. Blank key input preserves a saved key; **Clear key** followed by **Save model** removes it. New key input replaces it.

The default Playground model, single/bulk mode and delimiter persist. Playground and Model Compare send a saved profile ID; the server loads its model, endpoint and key. A saved credential is only used for the profile's configured endpoint. Deleting a model removes its credential.

On first initialization, System One hosted/local profiles are created and existing `TYPESAFE_API_KEY`, `LOCAL_SYSTEM_ONE_API_KEY`, `KEV_BASE_URL`, and optional `LLM_API_KEY`/`LLM_MODEL`/`LLM_BASE_URL` values are imported once. Later environment changes do not overwrite database settings. Subsequent credentials and model changes are managed through Settings. If an imported LLM profile has no model ID, edit it before using it.

The encryption key is generated in `.settings.key` beside the SQLite file. Alternatively, set `ONEGROUND_SETTINGS_KEY` to a stable base64-encoded 32-byte key before creating credentials. Keep that choice stable for existing encrypted records; changing the master key does not automatically re-encrypt saved keys.

## Playground

Enter text or JSON (single or bulk mode), define Noul/Choice/Score questions, choose a saved model profile and run inference. Results show the answers, the request and the raw response. Playground never persists inputs; it only reads saved settings.

## Model Compare

Pick two to six saved model profiles and one input, define up to 25 decision questions, then run the comparison. Every profile answers the same input; results show answers, latency, token usage and estimated cost when token prices are configured.

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

Unit/provider tests use a local mock HTTP server and never call paid APIs. Playwright starts the production web server on port 3100 with an isolated `data/e2e.sqlite` database, then checks Playground and Model Compare flows, settings persistence, mobile layout and Turkish/English navigation.
