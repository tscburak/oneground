import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`stable panel width and tutorials at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [],
      mutations: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "POST") mutations.push(request.url());
    });
    await page.goto("/");
    const dimensions = () =>
      page.locator(".workspace-panel:visible").evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, left: box.left };
      });
    const original = await dimensions();
    await page.getByRole("button", { name: "Tutorial", exact: true }).click();
    await expect(page.locator(".driver-popover-title")).toHaveText(
      "Start with an example",
    );
    const titles = [
      "Your input",
      "Define the decision",
      "Load a saved profile",
      "Save the questions",
      "Choose models",
      "Run inference",
      "Inspect the answers",
    ];
    for (const title of titles) {
      await page.locator(".driver-popover-next-btn").click();
      await expect(page.locator(".driver-popover-title")).toHaveText(title);
    }
    await expect(page.locator(".driver-popover-progress-text")).toHaveText(
      "8 / 8",
    );
    await page.locator(".driver-popover-next-btn").click();
    await expect(page.locator(".driver-popover")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tutorial", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tab", { name: "Model vs", exact: true }),
    ).toHaveCount(0);
    expect(await dimensions()).toEqual(original);
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const width of [1440]) {
  test(`eval lab tutorial follows the wizard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [],
      mutations: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "POST") mutations.push(request.url());
    });
    await page.goto("/");
    await page.getByRole("tab", { name: "Eval Lab", exact: true }).click();
    await page.getByRole("button", { name: "Tutorial", exact: true }).click();
    await expect(page.locator(".driver-popover-title")).toHaveText(
      "Follow the steps",
    );
    const titles = [
      "Pick the questions",
      "Drop the dataset",
      "Check the preview",
      "Match the columns",
      "Run and compare",
    ];
    for (const title of titles) {
      await page.locator(".driver-popover-next-btn").click();
      await expect(page.locator(".driver-popover-title")).toHaveText(title);
    }
    await expect(page.locator(".driver-popover-progress-text")).toHaveText(
      "6 / 6",
    );
    await page.locator(".driver-popover-next-btn").click();
    await expect(page.locator(".driver-popover")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tutorial", exact: true }),
    ).toBeFocused();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Turkish tutorial supports previous, dismissal and restarting", async ({
  page,
  request,
}) => {
  const initial = await (await request.get("/api/settings")).json();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await request.post("/api/settings", {
    data: { action: "preferences", locale: "tr" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Öğretici", exact: true }).click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Bir örnekle başla",
  );
  await page.locator(".driver-popover-next-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Değerlendirilecek veri",
  );
  await page.locator(".driver-popover-prev-btn").click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Bir örnekle başla",
  );
  await page.locator(".driver-popover-close-btn").click();
  await expect(page.locator(".driver-popover")).toHaveCount(0);
  await page.getByRole("button", { name: "Öğretici", exact: true }).click();
  await expect(page.locator(".driver-popover-progress-text")).toHaveText(
    "1 / 8",
  );
  await page.keyboard.press("Escape");
  await request.post("/api/settings", {
    data: { action: "preferences", locale: initial.preferences.locale ?? "en" },
  });
});
