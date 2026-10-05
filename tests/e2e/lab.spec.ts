import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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
  await expect(page.getByText("How to run", { exact: true })).toBeVisible();
  await expect(page.getByText("npm run worker", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Worker online" })).toBeVisible();
  await page.getByRole("button", { name: "Next: Map fields →" }).click();
  await expect(page.getByText("2. Map fields & preview", { exact: true })).toBeVisible();
  await page.getByLabel("state field", { exact: true }).selectOption("state");
  await page
    .getByLabel("Label field urgent", { exact: true })
    .selectOption("expected.urgent");
  const mappedPreview = page.locator("details").filter({ hasText: "Mapped preview" });
  await expect(mappedPreview).toHaveAttribute("open", "");
  await mappedPreview.locator("summary").click();
  await expect(mappedPreview).not.toHaveAttribute("open");
  await mappedPreview.locator("summary").click();
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
  await page.getByRole("button", { name: "Next: Configure experiment →" }).click();
  await page.getByRole("button", { name: "+ rules", exact: true }).click();
  await page
    .getByLabel("Experiment name", { exact: true })
    .fill(`Browser smoke ${Date.now()}`);
  await page
    .getByRole("button", { name: "Start experiment", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Analysis & replay", exact: true }),
  ).toHaveAttribute("data-state", "active");
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

test("Model vs runs selected saved profiles and reports answers and metrics", async ({
  page,
  request,
}) => {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body) as {
      model: string;
      messages: { content: string }[];
    };
    const yes = input.model === "model-vs-yes";
    const systemPrompt = input.messages[0].content;
    const marker = "Questions: ";
    const questions = JSON.parse(
      systemPrompt.slice(systemPrompt.lastIndexOf(marker) + marker.length),
    ) as Record<string, unknown>;
    const answers = Object.fromEntries(
      Object.keys(questions).map((id) => [id, yes]),
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        model: input.model,
        choices: [
          {
            message: {
              content: JSON.stringify({ answers }),
            },
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 3 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const ids: string[] = [];
  try {
    for (const model of ["model-vs-yes", "model-vs-no"]) {
      const response = await request.post("/api/settings", {
        data: {
          action: "save-model",
          name: `${model} ${Date.now()}`,
          kind: "llm",
          model,
          baseUrl,
          prompt: "Return the requested decision.",
          apiKey: "local-model-vs-test-key",
          inputPrice: 1,
          outputPrice: 2,
        },
      });
      expect(response.ok()).toBe(true);
      ids.push((await response.json()).savedProfileId);
    }
    await page.goto("/en");
    await page.getByRole("tab", { name: "Model vs", exact: true }).click();
    await page.getByRole("button", { name: "Add decision", exact: true }).click();
    await page.getByRole("menuitem", { name: /Noul/ }).click();
    await page
      .getByPlaceholder("What should the model judge?")
      .nth(1)
      .fill("Should support add-on decision?");
    for (const id of ids)
      await page.getByLabel(`Select model ${id}`, { exact: true }).check();
    await page.getByRole("button", { name: "Compare (2 models)", exact: true }).click();
    await expect(page.getByText("Comparison results", { exact: true })).toBeVisible();
    const results = page.locator("table").filter({ hasText: "model-vs-yes" });
    await expect(results).toContainText("Yes");
    await expect(results).toContainText("No");
    await expect(results).toContainText("11");
    await expect(results).toContainText("3");
    await expect(results).toContainText("14");
    await expect(results).toContainText("$0.000017");
    await expect(results).toContainText("ms");
    await expect(results).toContainText("q2");
  } finally {
    for (const id of ids)
      await request.post("/api/settings", {
        data: { action: "delete-model", id },
      });
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
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
