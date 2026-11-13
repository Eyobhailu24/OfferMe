import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function signIn(page: Page, phone: string, name: string) {
  await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  let code = "";
  await expect
    .poll(async () => {
      const fixture = JSON.parse(
        await readFile(resolve("../backend/.local/e2e-fixture.json"), "utf8"),
      );
      code = fixture.codes["+251" + phone.slice(1)] || "";
      return code.length;
    })
    .toBe(6);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Save");
}

test("seller posts; buyer finds, saves, chats, offers and arranges a meetup", async ({
  browser,
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good finds. Great neighbors." }),
  ).toBeVisible();
  await page.getByLabel("Language").selectOption("am");
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(
    page.getByRole("heading", { name: "ጥሩ ዕቃዎች። ጥሩ ጎረቤቶች።" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Language")).toHaveValue("am");
  await page.getByLabel("Language").selectOption("om");
  await expect(
    page.getByRole("heading", { name: "Meeshaa gaarii. Ollaa gaarii." }),
  ).toBeVisible();
  await page.getByLabel("Language").selectOption("en");
  await signIn(page, "0900000201", "Browser Seller");
  await page.goto("/sell");
  // Browser-generated PNG fixture goes through the real upload/processing API.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e6e8db";
    ctx.fillRect(0, 0, 240, 240);
    ctx.fillStyle = "#174d3e";
    ctx.fillRect(75, 35, 90, 170);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await expect(page.getByLabel("Add photos")).toBeAttached();
  await page.context().setOffline(true);
  await page.getByLabel("Add photos").setInputFiles({
    name: "phone.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByText("Photos waiting to upload", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled({ timeout: 25000 });
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByAltText("Listing photo 1")).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Browser test secondhand phone");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("phones");
  await page
    .getByRole("combobox", { name: "Subcategory", exact: true })
    .selectOption("smartphones");
  await page.getByLabel("Model", { exact: true }).fill("Test phone model");
  await page
    .getByLabel("Battery condition", { exact: true })
    .fill("Holds a charge");
  await page
    .getByRole("combobox", { name: "Lock status", exact: true })
    .selectOption("unlocked");
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Browser test secondhand phone",
  );
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue(
    "Test phone model",
  );
  await expect(page.getByAltText("Listing photo 1")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Condition", exact: true })
    .selectOption("good");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A carefully tested secondhand phone, available in Bole.");
  await page
    .getByLabel("Known defects or wear")
    .fill("Small scratch on the back.");
  await page.getByLabel("Price (Br)", { exact: true }).fill("2500");
  await page
    .getByRole("combobox", { name: "Neighborhood", exact: true })
    .selectOption("Bole");
  await page
    .getByRole("button", { name: "Publish listing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/items\/[^/]+$/);
  const itemUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "Browser test secondhand phone" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("listing-desktop.png"),
    fullPage: true,
  });
  const buyerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: "http://127.0.0.1:3101",
  });
  const buyer = await buyerContext.newPage();
  buyer.on("pageerror", (e) => errors.push(e.message));
  await signIn(buyer, "0900000202", "Browser Buyer");
  await buyer.goto("/");
  await buyer
    .getByRole("textbox", { name: "What are you looking for?" })
    .fill("secondhand phone");
  await buyer.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    buyer.getByRole("heading", { name: "Browser test secondhand phone" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      buyer.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  buyer.once("dialog", (d) => d.accept("Phone search"));
  await buyer
    .getByRole("button", { name: "Save this search", exact: true })
    .click();
  await buyer.screenshot({
    path: testInfo.outputPath("browse-mobile.png"),
    fullPage: true,
  });
  await buyer.goto(itemUrl);
  await buyer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    buyer.getByRole("button", { name: "Remove from saved" }),
  ).toHaveAttribute("aria-pressed", "true");
  await buyer.goto("/saved");
  await expect(
    buyer.getByRole("heading", { name: "Browser test secondhand phone" }),
  ).toBeVisible();
  await buyer.goto(itemUrl);
  await buyer
    .getByRole("button", { name: "Message seller", exact: true })
    .click();
  await expect(buyer).toHaveURL(/\/messages\/[^/]+$/);
  const threadUrl = buyer.url();
  await buyer
    .getByRole("textbox", { name: "Write a message" })
    .fill("Hello, can I inspect the phone in Bole?");
  await buyer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(buyer.locator(".bubble")).toContainText(
    "Hello, can I inspect the phone in Bole?",
  );
  await buyerContext.setOffline(true);
  await buyer
    .getByRole("textbox", { name: "Write a message" })
    .fill("This message survives a connection failure.");
  await buyer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    buyer.getByText("Pending - saved on this device", { exact: true }),
  ).toBeVisible();
  await buyer
    .getByRole("textbox", { name: "Write a message" })
    .fill("A second offline message.");
  await buyer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    buyer.getByText("Pending - saved on this device", { exact: true }),
  ).toHaveCount(2);
  await buyerContext.setOffline(false);
  await expect(
    buyer.getByText("Pending - saved on this device", { exact: true }),
  ).toHaveCount(0);
  await buyer.reload();
  await expect(
    buyer
      .locator(".bubble")
      .filter({ hasText: "This message survives a connection failure." }),
  ).toHaveCount(1);
  await buyer
    .getByRole("button", { name: "Make an offer", exact: true })
    .click();
  await buyer.getByLabel("Price (Br)", { exact: true }).fill("2400");
  await buyer.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    buyer.locator(".event-card").filter({ hasText: "2,400 Br" }),
  ).toContainText("2,400 Br");
  await page.goto(threadUrl);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.locator(".event-card .badge")).toHaveText("Accepted");
  await buyer
    .getByRole("button", { name: "Plan a meetup", exact: true })
    .click();
  await buyer
    .getByLabel("Public meeting place")
    .fill("Public cafe near Bole, Addis Ababa");
  const tomorrow = new Date(Date.now() + 86400000 + 3 * 3600000)
    .toISOString()
    .slice(0, 16);
  await buyer.getByLabel(/Date & time/).fill(tomorrow);
  await buyer.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    buyer.getByText("Public cafe near Bole, Addis Ababa", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.locator(".event-card").filter({ hasText: "Public cafe" }),
  ).toContainText("Confirmed");
  await page
    .getByRole("button", {
      name: "Reserve for this buyer for 24 hours",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel reservation", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Mark sold to this buyer", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark sold to this buyer", exact: true }),
  ).toHaveCount(0);
  await page.goto("/account");
  await expect(page.locator(".manage-item .badge")).toHaveText("Sold");
  await buyer.goto("/account");
  buyer.once("dialog", (d) => d.accept());
  await buyer
    .getByRole("button", { name: "Confirm completed exchange", exact: true })
    .click();
  await buyer
    .getByLabel("Your review", { exact: true })
    .fill("Great inspection and meetup.");
  await buyer
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(
    buyer.getByText("Review submitted", { exact: true }),
  ).toBeVisible();
  await expect(
    buyer.getByRole("link", { name: "Phone search", exact: true }),
  ).toBeVisible();
  const download = buyer.waitForEvent("download");
  await buyer
    .getByRole("button", { name: "Export my data", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "offerme-account-export.json",
  );
  await buyer.goto(itemUrl);
  await expect(
    buyer.getByRole("button", { name: "Message seller", exact: true }),
  ).toBeDisabled();
  await expect(
    buyer.getByText("Great inspection and meetup.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3101/");
  expect(errors).toEqual([]);
  await buyerContext.close();
});
