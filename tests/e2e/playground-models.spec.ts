import { test, expect, type Page } from "@playwright/test";

async function selectTwoModels(page: Page) {
  const trigger = page.locator('[data-tour="playground-model"]');
  await trigger.click();
  const items = page.locator('[role="menuitemcheckbox"]');
  const checked = page.locator('[role="menuitemcheckbox"][aria-checked="true"]');
  for (let i = await checked.count(); i > 0; i = await checked.count())
    await checked.first().click();
  await expect(items.first()).toHaveAttribute("aria-checked", "false");
  await items.first().click();
  await items.nth(1).click();
  await expect(trigger).toContainText("2 models");
  await page.keyboard.press("Escape");
}

test("playground compares several selected models on one state", async ({
  page,
  request,
}) => {
  const initial = await (await request.get("/api/settings")).json();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/en");
    await selectTwoModels(page);
    await page.getByRole("tab", { name: "Single", exact: true }).click();
    await page.locator('[data-tour="playground-preset"]').click();
    await page.locator('[role="option"]').nth(1).click();
    await page.locator('[data-tour="playground-run"]').click();

    const table = page.locator('[data-tour="playground-results"] table');
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("tbody")).toContainText(/Done|Failed/);
    expect(errors).toEqual([]);

    await page.reload();
    await expect(
      page.locator('[data-tour="playground-model"]'),
    ).toContainText("2 models");
  } finally {
    await request.post("/api/settings", {
      data: { action: "preferences", ...initial.preferences },
    });
  }
});

test("bulk mode runs every selected model", async ({ page, request }) => {
  const initial = await (await request.get("/api/settings")).json();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/en");
    await selectTwoModels(page);
    await page.locator('[data-tour="playground-preset"]').click();
    await page.locator('[role="option"]').nth(1).click();
    await page.getByRole("tab", { name: "Bulk", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Bulk", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
    await page
      .locator('[data-tour="playground-state"] textarea')
      .fill("first state\nsecond state");
    await page.locator('[data-tour="playground-run"]').click();

    const table = page.locator('[data-tour="playground-results"] table');
    await expect(table).toHaveCount(1);
    await expect(table.locator("tbody tr")).toHaveCount(4);
    expect(errors).toEqual([]);
  } finally {
    await request.post("/api/settings", {
      data: { action: "preferences", ...initial.preferences },
    });
  }
});
