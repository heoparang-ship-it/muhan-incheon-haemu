#!/usr/bin/env node
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err?.message || err)));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 45000 });
const iframe = page.frameLocator("iframe");
await iframe.locator("#startBtn").click();
await iframe.locator("#titleScreen.hide").waitFor({ timeout: 8000 });
await page.waitForTimeout(400);
await iframe.locator("body").evaluate(() => {
  const H = window.__HAEMU__;
  H.state.timeLeft = 2000;
  H.completeObjective("trace");
  H.writeSave(true);
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
const iframe2 = page.frameLocator("iframe");
await iframe2.locator("#continueBtn").waitFor({ state: "visible", timeout: 8000 });
await iframe2.locator("#continueBtn").click();
await iframe2.locator("#titleScreen.hide").waitFor({ timeout: 8000 });
const probe = await iframe2.locator("body").evaluate(() => {
  const H = window.__HAEMU__;
  return {
    timeLeft: Math.round(H.state.timeLeft),
    trace: !!H.state.objectives.trace,
    paused: H.state.paused,
    running: H.state.running,
  };
});
await page.screenshot({ path: "/workspace/screenshots/qa-continue.png" });
console.log(JSON.stringify({ probe, errors }, null, 2));
await browser.close();
if (errors.length || !probe.trace || probe.timeLeft > 2100) process.exit(1);
