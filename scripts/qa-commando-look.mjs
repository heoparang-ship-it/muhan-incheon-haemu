import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const iPhone = devices["iPhone 14 Pro"] || devices["iPhone 13 Pro"];
const ctx = await browser.newContext({
  ...iPhone,
  viewport: { width: 932, height: 430 },
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 8000 });
await page.locator("#startBtn").tap();
await page.waitForTimeout(1600);
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 15000 }).catch(() => {});

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const chapel = H.map.buildings.find((b) => b.id === "chapel");
  H.state.followSel = false;
  H.cam.targetZoom = H.cam.zoom = 0.46;
  if (chapel) {
    H.cam.x = (chapel.x + chapel.w / 2 - chapel.y - chapel.h / 2) * 32;
    H.cam.y = (chapel.x + chapel.w / 2 + chapel.y + chapel.h / 2) * 16;
  }
  return {
    zoom: H.cam.zoom,
    minZ: H.cam.minZoom,
    running: H.state.running,
    vw: H.cam.vw,
    vh: H.cam.vh,
    artBody: chapel && chapel.artBody,
  };
});
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/commando-chapel.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.cam.zoom = H.cam.targetZoom = 0.46;
  // village tavern
  H.cam.x = (19 + 2.5 - 46 - 2) * 32;
  H.cam.y = (19 + 2.5 + 46 + 2) * 16;
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/commando-village.png" });

console.log(JSON.stringify({ info, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(2);
process.exit(0);
