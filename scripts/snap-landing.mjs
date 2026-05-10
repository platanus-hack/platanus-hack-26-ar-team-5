import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("http://localhost:22231/", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/landing-full.png", fullPage: true });

// Also snap just the FlowsSection — find by heading text
const heading = page.locator("text=Two paths to a signed bundle");
await heading.scrollIntoViewIfNeeded();
const section = page.locator("section").filter({ has: heading });
await section.screenshot({ path: "/tmp/landing-flows.png" });

console.log("ok — /tmp/landing-full.png and /tmp/landing-flows.png");
await browser.close();
