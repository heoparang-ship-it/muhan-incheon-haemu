import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const iPhone = devices["iPhone 14 Pro"] || devices["iPhone 13 Pro"];
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  ...iPhone,
  viewport: { width: 430, height: 932 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e.message || e)));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(800);
const afterHome = { url: page.url(), title: await page.title() };
await page.screenshot({ path: "/workspace/screenshots/iphone-home.png" });

// If still on launcher, tap the native link
if (!page.url().includes("haemu.html")) {
  const link = page.locator('a[href="/haemu.html"]');
  if (await link.count()) await link.tap();
  await page.waitForTimeout(600);
}

await page.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 8000 });
await page.waitForTimeout(700);
await page.screenshot({ path: "/workspace/screenshots/iphone-title.png" });

const title = await page.evaluate(() => ({
  h1: document.querySelector("#titleScreen h1")?.textContent,
  startH: document.querySelector("#startBtn")?.getBoundingClientRect().height,
  titleZ: getComputedStyle(document.getElementById("titleScreen")).zIndex,
  touchAction: getComputedStyle(document.body).touchAction,
  userSelect: getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect,
  ready: !!window.__haemuReady,
  go: typeof window.__haemuGo,
}));

await page.locator("#startBtn").tap();
await page.waitForTimeout(1400);
await page.screenshot({ path: "/workspace/screenshots/iphone-play.png" });

const play = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const ts = document.getElementById("titleScreen");
  return {
    want: window.__haemuWant,
    ready: window.__haemuReady,
    hidden: ts.classList.contains("hide"),
    paused: H?.state?.paused,
    running: H?.state?.running,
    agents: H?.agents?.length,
    follow: H?.state?.followSel,
  };
});

console.log(JSON.stringify({ afterHome, title, play, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(2);
if (!play.hidden || play.paused || !play.running) process.exit(3);
process.exit(0);
