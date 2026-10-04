import { test, expect } from "@playwright/test";

test("settings sections fit desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/en");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("tab", { name: "Defaults", exact: true }),
  ).toHaveAttribute("data-state", "active");
  await dialog.screenshot({
    path: testInfo.outputPath("settings-desktop.png"),
  });
  const defaultsBox = await dialog.boundingBox();
  await dialog.getByRole("tab", { name: "Models", exact: true }).click();
  await expect(
    dialog.getByLabel("Profile name", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("API URL", { exact: true })).toBeVisible();
  const modelsBox = await dialog.boundingBox();
  expect(modelsBox!.height).toBeCloseTo(defaultsBox!.height, 0);
  const sidebarBox = await dialog.getByRole("tablist").boundingBox();
  expect(sidebarBox!.y + sidebarBox!.height).toBeCloseTo(
    modelsBox!.y + modelsBox!.height,
    0,
  );
  await dialog.getByText("Advanced settings", { exact: true }).click();
  expect((await dialog.boundingBox())!.height).toBeCloseTo(
    defaultsBox!.height,
    0,
  );
  await dialog.screenshot({ path: testInfo.outputPath("models-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const viewport = dialog.locator('[data-slot="scroll-area-viewport"]');
  await expect(
    dialog.locator('[data-slot="scroll-area-scrollbar"]'),
  ).toBeVisible();
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    dialog.getByRole("button", { name: "Save model", exact: true }),
  ).toBeInViewport();
  await dialog.screenshot({ path: testInfo.outputPath("models-mobile.png") });
});

test("saved models, keys and preferences survive reload and are shared with Lab", async ({
  page,
  request,
}) => {
  const name = `Saved model ${Date.now()}`,
    secret = "e2e-private-test-token";
  const initial = await (await request.get("/api/settings")).json();
  let profileId: string | undefined;
  try {
    await page.goto("/en");
    await page
      .getByRole("button", { name: "Settings", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("combobox", { name: "Input mode", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("tab", { name: "Models", exact: true }).click();
    await dialog.getByRole("button", { name: "New", exact: true }).click();
    await dialog.getByLabel("Profile name", { exact: true }).fill(name);
    await dialog.getByLabel("Model", { exact: true }).fill("persisted-model");
    await dialog
      .getByLabel("API URL", { exact: true })
      .fill("http://127.0.0.1:8999");
    await dialog.getByLabel("API key", { exact: true }).fill(secret);
    await dialog
      .getByRole("button", { name: "Save model", exact: true })
      .click();
    await expect(
      dialog.getByText("API key saved", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
    const responseText = await (await request.get("/api/settings")).text();
    expect(responseText).not.toContain(secret);
    const saved = JSON.parse(responseText);
    profileId = saved.models.find(
      (profile: { name: string }) => profile.name === name,
    ).id;
    await dialog.getByRole("tab", { name: "Defaults", exact: true }).click();
    await dialog
      .getByLabel("Default Playground model")
      .selectOption(profileId!);
    await expect(dialog.getByLabel("Default Playground model")).toHaveValue(
      profileId!,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Bulk", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Bulk", exact: true }),
    ).toHaveAttribute("data-state", "active");
    await page.reload();
    await expect(page.locator('[data-tour="playground-model"]')).toHaveValue(
      profileId!,
    );
    await expect(
      page.getByRole("tab", { name: "Bulk", exact: true }),
    ).toHaveAttribute("data-state", "active");
    await page
      .getByRole("button", { name: "Settings", exact: true })
      .first()
      .click();
    await dialog.getByRole("tab", { name: "Models", exact: true }).click();
    await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute(
      "placeholder",
      /Saved/,
    );
    await dialog
      .getByLabel("Profile name", { exact: true })
      .fill(`${name} renamed`);
    await dialog
      .getByRole("button", { name: "Save model", exact: true })
      .click();
    await expect(
      dialog.getByText("API key saved", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("tab", { name: "Evaluation lab", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "New experiment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "+ system-one", exact: true })
      .click();
    const savedModel = page.getByLabel(/^Saved model /);
    await savedModel.selectOption(profileId!);
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue(
      "persisted-model",
    );
    await expect(page.getByLabel("Base URL", { exact: true })).toHaveValue(
      "http://127.0.0.1:8999",
    );
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await dialog.getByRole("tab", { name: "Models", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Clear key", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Save model", exact: true })
      .click();
    await expect(dialog.getByText("No API key", { exact: true })).toBeVisible();
    const cleared = await (await request.get("/api/settings")).json();
    expect(
      cleared.models.find((profile: { id: string }) => profile.id === profileId)
        .hasApiKey,
    ).toBe(false);
  } finally {
    if (profileId)
      await request.post("/api/settings", {
        data: { action: "delete-model", id: profileId },
      });
    await request.post("/api/settings", {
      data: { action: "preferences", ...initial.preferences },
    });
  }
});
