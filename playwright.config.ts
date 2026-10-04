import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100/en",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ONEGROUND_DB_PATH: "data/e2e.sqlite" },
  },
});
