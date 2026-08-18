import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const errors = [];
function attach(page) {
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const iPhone = devices["iPhone 14 Pro"] || devices["iPhone 13 Pro"];

// Portrait phone — must be playable landscape, no rotate nag
const pctx = await browser.newContext({
  ...iPhone,
  viewport: { width: 430, height: 932 },
  isMobile: true,
  hasTouch: true,
});
const ppage = await pctx.newPage();
attach(ppage);
await ppage.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await ppage.waitForSelector("#startBtn", { timeout: 8000 });
await ppage.waitForTimeout(400);
await ppage.screenshot({ path: "/workspace/screenshots/force-land-title.png" });

const portrait = await ppage.evaluate(() => {
  const o = document.getElementById("orientation");
  const L = window.__haemuLand;
  const app = document.getElementById("app");
  const btn = document.getElementById("startBtn").getBoundingClientRect();
  return {
    hasOrientEl: !!o,
    force: document.documentElement.classList.contains("force-land"),
    landOn: !!(L && L.on),
    landW: L && L.w,
    landH: L && L.h,
    appW: app.clientWidth,
    appH: app.clientHeight,
    appTf: app.style.transform,
    startVisible: btn.width > 20 && btn.height > 20,
    startText: document.querySelector("#startBtn")?.textContent,
  };
});

await ppage.locator("#startBtn").tap();
await ppage.waitForTimeout(1400);
await ppage.screenshot({ path: "/workspace/screenshots/force-land-play.png" });
const playP = await ppage.evaluate(() => {
  const H = window.__HAEMU__;
  const ts = document.getElementById("titleScreen");
  return {
    hidden: ts.classList.contains("hide"),
    paused: H?.state?.paused,
    running: H?.state?.running,
    agents: H?.agents?.length,
    vw: H?.cam?.vw,
    vh: H?.cam?.vh,
    wide: H?.cam?.vw > H?.cam?.vh,
  };
});
await pctx.close();

// Native landscape — no force rotate
const lctx = await browser.newContext({
  ...iPhone,
  viewport: { width: 932, height: 430 },
  isMobile: true,
  hasTouch: true,
});
const lpage = await lctx.newPage();
attach(lpage);
await lpage.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await lpage.waitForSelector("#startBtn", { timeout: 8000 });
await lpage.waitForTimeout(300);
const landscape = await lpage.evaluate(() => ({
  force: document.documentElement.classList.contains("force-land"),
  landOn: !!(window.__haemuLand && window.__haemuLand.on),
  h1: document.querySelector("#titleScreen h1")?.textContent,
}));
await lpage.locator("#startBtn").tap();
await lpage.waitForTimeout(1200);
await lpage.screenshot({ path: "/workspace/screenshots/force-land-native.png" });
const playL = await lpage.evaluate(() => {
  const H = window.__HAEMU__;
  return {
    hidden: document.getElementById("titleScreen").classList.contains("hide"),
    running: H?.state?.running,
    wide: H?.cam?.vw > H?.cam?.vh,
  };
});
await lctx.close();
await browser.close();

const fail = [];
if (portrait.hasOrientEl) fail.push("orientation overlay still in DOM");
if (!portrait.force || !portrait.landOn) fail.push("portrait did not force landscape");
if (!(portrait.appW > portrait.appH)) fail.push("app not landscape sized: " + portrait.appW + "x" + portrait.appH);
if (!portrait.startVisible) fail.push("start button not visible");
if (!playP.hidden || playP.paused || !playP.running) fail.push("portrait start failed");
if (!playP.wide) fail.push("canvas not landscape: " + playP.vw + "x" + playP.vh);
if (landscape.force || landscape.landOn) fail.push("native landscape still forced");
if (!playL.hidden || !playL.running || !playL.wide) fail.push("native landscape play failed");
if (errors.length) fail.push("console: " + errors.join(" | "));

console.log(JSON.stringify({ portrait, playP, landscape, playL, errors, fail }, null, 2));
process.exit(fail.length ? 3 : 0);
