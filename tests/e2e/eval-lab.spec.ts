import { test, expect, type Page } from "@playwright/test";

async function addNoulQuestion(page: Page, scope: string, instructions: string) {
  const card = page.locator(scope);
  await card.getByRole("button", { name: "noul", exact: true }).click();
  await card.locator("textarea").first().fill(instructions);
}

test("eval lab stepper walks questions to run without inference", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Eval Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evaluation Lab" })).toBeVisible();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(
    page.locator('[data-tour="eval-questions"]'),
  ).toContainText("No questions yet");
  await expect(
    page.locator('[data-tour="eval-questions"]').getByRole("button", { name: "Load Profile" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-tour="eval-questions"]').getByRole("button", { name: "Save Profile" }),
  ).toBeVisible();
  await addNoulQuestion(page, '[data-tour="eval-questions"]', "Is it urgent?");
  await page
    .locator('[data-tour="eval-questions"]')
    .getByRole("button", { name: "Continue" })
    .click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await expect(page.locator('[data-tour="eval-dataset"]')).toContainText("Drag & drop");
  await page
    .locator('[data-tour="eval-dataset"]')
    .getByRole("tab", { name: "Manual input" })
    .click();
  await page
    .locator('[data-tour="eval-dataset"]')
    .getByPlaceholder("Paste dataset here…")
    .fill(
      JSON.stringify(
        [
          { id: "1", text: "Urgent: payment failed, fix it now", urgent: true },
          { id: "2", text: "What are your opening hours?", urgent: false },
          { id: "3", text: "Please help immediately with my account", urgent: true },
          { id: "4", text: "Thanks for your help", urgent: false },
          { id: "5", text: "Urgent: charged twice", urgent: true },
        ],
      ),
    );
  await page
    .locator('[data-tour="eval-dataset"]')
    .getByRole("button", { name: "Continue" })
    .click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await expect(page.locator('[data-tour="eval-preview"]')).toContainText("5 rows");
  await page
    .locator('[data-tour="eval-preview"]')
    .getByRole("button", { name: "Continue" })
    .click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  const matching = page.locator('[data-tour="eval-matching"]');
  await matching.getByRole("combobox", { name: "Expected answer column for q1" }).click();
  await page.getByRole("option", { name: "urgent", exact: true }).click();
  await matching.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
  await expect(page.locator('[data-tour="eval-run"]')).toBeVisible();
  await page
    .locator('[data-tour="eval-run"]')
    .getByRole("button", { name: "Back" })
    .click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  expect(errors).toEqual([]);
});

test("eval lab stepper blocks jumping to run without questions or dataset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Eval Lab", exact: true }).click();
  await page.locator("nav[aria-label='Evaluation Lab']").getByRole("button", { name: /Run/ }).click();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
});

test("question profiles persist in sqlite and load in playground", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `e2e-profile-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("tab", { name: "Eval Lab", exact: true }).click();
  const questions = page.locator('[data-tour="eval-questions"]');
  await addNoulQuestion(page, '[data-tour="eval-questions"]', "Needs immediate action?");
  await questions.getByRole("button", { name: "Save Profile" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Profile name").fill(name);
  await dialog.getByRole("button", { name: "Save Profile" }).click();
  await expect(dialog).toHaveCount(0);
  await questions.getByRole("button", { name: "Load Profile" }).click();
  await expect(page.getByRole("dialog").getByText(name)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("tab", { name: "Eval Lab", exact: true }).click();
  await page
    .locator('[data-tour="eval-questions"]')
    .getByRole("button", { name: "Load Profile" })
    .click();
  await expect(page.getByRole("dialog").getByText(name)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Playground", exact: true }).click();
  await page
    .locator('[data-tour="playground-questions"]')
    .getByRole("button", { name: "Load Profile" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Load" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('[data-tour="playground-questions"]'),
  ).toContainText("Needs immediate action?");
  await page.getByRole("tab", { name: "Eval Lab", exact: true }).click();
  await page
    .locator('[data-tour="eval-questions"]')
    .getByRole("button", { name: "Load Profile" })
    .click();
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByRole("dialog").getByText(name)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("eval lab turkish tab renders", async ({ page, request }) => {
  const initial = await (await request.get("/api/settings")).json();
  try {
    await request.post("/api/settings", {
      data: { action: "preferences", locale: "tr" },
    });
    await page.goto("/");
    await page.getByRole("tab", { name: "Değerlendirme", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Değerlendirme Laboratuvarı" })).toBeVisible();
  } finally {
    await request.post("/api/settings", {
      data: { action: "preferences", locale: initial.preferences.locale ?? "en" },
    });
  }
});
