import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

let worker: ChildProcess;
test.beforeAll(() => {
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/lab-worker.ts"],
    {
      env: { ...process.env, ONEGROUND_DB_PATH: resolve("data/e2e.sqlite") },
      stdio: "pipe",
      windowsHide: true,
    },
  );
});
test.afterAll(() => worker?.kill());

test("import, publish schema, bulk rules, inspect, persist, and replay", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  await page.goto("/en");
  await page.getByRole("tab", { name: "Evaluation lab", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Measure, compare, replay decisions." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save dataset version" }).click();
  await expect(
    page.getByText("Dataset version saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Decision schema", exact: true }).click();
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(
    page.getByText("Schema version saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "New experiment", exact: true }).click();
  await page.getByRole("button", { name: "+ rules", exact: true }).click();
  await page
    .getByLabel("Experiment name", { exact: true })
    .fill(`Browser smoke ${Date.now()}`);
  await page
    .getByRole("button", { name: "Start experiment", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Analysis & replay", exact: true })
    .click();
  await expect(
    page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: /Browser smoke .* · complete/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Confusion matrix", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Tutorial", exact: true }).click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Choose an experiment",
  );
  for (const title of [
    "Set the analysis scope",
    "Tune on your data",
    "Inspect mistakes",
    "Compare evaluators",
    "Replay a change",
  ]) {
    await page.locator(".driver-popover-next-btn").click();
    await expect(page.locator(".driver-popover-title")).toHaveText(title);
  }
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover")).toHaveCount(0);
  await expect(page.getByText("66.7%", { exact: true }).first()).toBeVisible();
  const runId = await page.getByLabel("Run history").inputValue();
  await page.reload();
  await page.getByRole("tab", { name: "Evaluation lab", exact: true }).click();
  await page
    .getByRole("tab", { name: "Analysis & replay", exact: true })
    .click();
  await page.getByLabel("Run history").selectOption(runId);
  await expect(
    page.getByText("Confusion matrix", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replay policy · no API calls", exact: true })
    .click();
  await expect(
    page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: /policy replay · complete/ }),
  ).toBeVisible();
  await expect(page.getByText(/Replay Δ/)).toBeVisible();
  await page
    .getByRole("button", { name: "Replay inference · uses API", exact: true })
    .click();
  await expect(
    page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: /inference replay · complete/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Measure, compare, replay decisions." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/lab-mobile.png",
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);
});

test("Turkish workspace and original playground remain accessible", async ({
  page,
}) => {
  await page.goto("/tr");
  await page.getByRole("tab", { name: "Evaluation lab", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Kararları ölç, karşılaştır, tekrar oynat.",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Playground", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Evaluation lab", exact: true }),
  ).toBeVisible();
});
