import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e.message || e)));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(900);
const frame = page.frameLocator("iframe");
await frame.locator("#titleScreen").waitFor({ timeout: 8000 });
await page.screenshot({ path: "/workspace/screenshots/mobile-title.png" });

const title = {
  h1: await frame.locator("#titleScreen h1").innerText(),
  orient: await frame.locator("#orientation").evaluate((el) => getComputedStyle(el).display),
  startH: await frame.locator("#startBtn").evaluate((el) => el.getBoundingClientRect().height),
  overflow: await frame.locator("html").evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2),
};

await frame.locator("#startBtn").tap();
await page.waitForTimeout(900);
await page.screenshot({ path: "/workspace/screenshots/mobile-play.png" });

const play = await frame.locator("body").evaluate(() => {
  const H = window.__HAEMU__;
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display, visible: cs.display !== "none" && cs.visibility !== "hidden" && r.height > 0 };
  };
  const cards = [...document.querySelectorAll(".agentCard")].map((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const acts = [...document.querySelectorAll(".action")].map((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  return {
    paused: H.state.paused,
    running: H.state.running,
    follow: H.state.followSel,
    zoom: +H.cam.zoom.toFixed(2),
    agents: H.agents.length,
    tex: Object.keys(H.state && window.ART ? {} : {}),
    probe: {
      artTex: typeof ART !== "undefined" ? Object.keys(ART.tex).length : 0,
      artImg: typeof ART !== "undefined" ? Object.keys(ART.img).length : 0,
    },
    top: box("#top"),
    bottom: box("#bottom"),
    objMini: box(".objMini"),
    mapTools: box("#mapTools"),
    orientation: box("#orientation"),
    cards,
    acts,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    vh: window.innerHeight,
    vw: window.innerWidth,
  };
});

await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/mobile-land.png" });

console.log(JSON.stringify({ title, play, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(2);
if (title.orient !== "none") process.exit(3);
if (title.startH < 44) process.exit(4);
if (play.overflowX) process.exit(5);
process.exit(0);
