import { test, expect } from "@playwright/test";

// Radix (react-remove-scroll-bar) injects
// `body[data-scroll-locked] { margin-right: <gap>px !important; ... }`
// into <head> at runtime, after the app stylesheet. In headless Chromium the
// scrollbar gap is 0 so the resulting sideways page jump never shows up;
// simulate the injection with a nonzero gap instead.
test("body scroll-lock compensation does not shift layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const panel = page.locator(".workspace-panel:visible");
  const original = await panel.boundingBox();

  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-testid", "fake-radix-compensation");
    style.textContent = [
      "body[data-scroll-locked] { margin-right: 17px !important; }",
      "body[data-scroll-locked] { --removed-body-scroll-bar-size: 17px; }",
    ].join("\n");
    // Appended last, like the real runtime injection: on equal
    // specificity this rule would win unless globals.css out-specifies it.
    document.head.appendChild(style);
    document.body.setAttribute("data-scroll-locked", "1");
  });

  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).marginRight))
    .toBe("0px");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue(
        "--removed-body-scroll-bar-size",
      ),
    ),
  ).toBe("0px");

  const box = await panel.boundingBox();
  expect(Math.abs(box!.x - original!.x)).toBeLessThan(1);
  expect(Math.abs(box!.width - original!.width)).toBeLessThan(1);
});
