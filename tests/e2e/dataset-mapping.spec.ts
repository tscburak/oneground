import { test, expect } from "@playwright/test";

for (const format of ["csv", "json", "jsonl"] as const) {
  test(`visual mapping supports ${format}`, async ({ page }) => {
    page.setDefaultTimeout(10_000);
    const records = [
      { key: "a", message: "Urgent payment", expected: { urgent: true } },
      { key: "b", message: "Hello there", expected: { urgent: false } },
    ];
    const data = format === "csv"
      ? "key,message,expected.urgent\na,Urgent payment,true\nb,Hello there,false"
      : format === "json" ? JSON.stringify(records) : records.map(record => JSON.stringify(record)).join("\n");
    await page.goto("/en");
    await page.getByRole("tab", { name: "Evaluation lab", exact: true }).click();
    await page.getByLabel("Format", { exact: true }).selectOption(format);
    await page.locator("input[type=file]").setInputFiles({ name: `sample.${format}`, mimeType: "text/plain", buffer: Buffer.from(data) });
    await page.getByRole("button", { name: /Next: Map fields/ }).click();
    await expect(page.getByText("Source data", { exact: true })).toBeVisible();
    await page.getByRole("button").filter({ has: page.locator("code", { hasText: /^message$/ }) }).click();
    await expect(page.getByLabel("state field", { exact: true })).toHaveValue("message");
    await page.getByLabel("id field", { exact: true }).selectOption("key");
    await page.getByLabel("split field", { exact: true }).selectOption("");
    await page.getByLabel("segment field", { exact: true }).selectOption("");
    await page.getByRole("button", { name: /^Expected answer.*urgent/ }).click();
    await page.getByRole("button").filter({ has: page.locator("code", { hasText: /^expected\.urgent$/ }) }).click();
    await expect(page.getByLabel("Label field urgent", { exact: true })).toHaveValue("expected.urgent");
    await page.getByRole("button", { name: "Next record", exact: true }).click();
    await expect(page.getByText("Sample record 2 / 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save dataset version", exact: true })).toBeEnabled();
    await expect(page.locator("details").filter({ hasText: "Mapped preview" })).toContainText("Hello there");
  });
}
