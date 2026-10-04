import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`popup layout stays stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en");
    const panel = page.locator(".workspace-panel:visible");
    const original = await panel.boundingBox();
    const stable = async () => {
      const box = await panel.boundingBox();
      expect(Math.abs(box!.x - original!.x)).toBeLessThan(1);
      expect(Math.abs(box!.width - original!.width)).toBeLessThan(1);
    };
    const trigger = page.locator('[data-slot="select-trigger"]').first();
    await trigger.click();
    const menu = page.locator('[data-slot="select-content"]');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("data-side", "bottom");
    await expect.poll(async () => {
      const anchor = await trigger.boundingBox();
      const box = await menu.boundingBox();
      return Math.abs(box!.y - (anchor!.y + anchor!.height + 4));
    }).toBeLessThan(1);
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(8);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 8);
    await stable();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await stable();
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.locator("body").evaluate((body) => ({
      overflow: getComputedStyle(body).overflow,
      margin: getComputedStyle(body).marginRight,
      compensation: getComputedStyle(body).getPropertyValue("--removed-body-scroll-bar-size").trim(),
    }))).toEqual({ overflow: "hidden", margin: "0px", compensation: "0px" });
    await stable();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await stable();
  });
}
