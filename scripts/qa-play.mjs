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
await page.waitForTimeout(1800);
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const before = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents[0];
  const art = H.ART.img.agent_haeju;
  return {
    running: H.state.running,
    paused: H.state.paused,
    agents: H.agents.length,
    guards: H.guards.length,
    zoom: +H.cam.zoom.toFixed(2),
    haeju: { tx: a.tx, ty: a.ty, alive: a.alive },
    dirs: art && art.meta.dirs,
    cellH: art && art.meta.cellH,
    acolyteRange: H.GUARD_TYPES.acolyte.range,
    acolyteSpeed: H.GUARD_TYPES.acolyte.speed,
  };
});
await page.screenshot({ path: "/workspace/screenshots/play-start.png" });

const moved = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents[0];
  const ok = H.setPath(a, a.tx + 4, a.ty - 3);
  return { ok, from: [a.tx, a.ty], pathLen: a.path && a.path.length };
});
await page.waitForTimeout(2200);
const after = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents[0];
  return { tx: a.tx, ty: a.ty, moveT: a.moveT, angle: a.angle };
});
await page.screenshot({ path: "/workspace/screenshots/play-moved.png" });

const fail = [];
if (!before.running || before.paused) fail.push("not running");
if (before.agents !== 4) fail.push("agents " + before.agents);
if (before.guards < 10) fail.push("guards " + before.guards);
if (before.dirs !== 4) fail.push("haeju dirs " + before.dirs);
if (before.acolyteRange !== 3.8) fail.push("vision not halved");
if (!moved.ok || moved.pathLen < 2) fail.push("path failed " + JSON.stringify(moved));
const dist = Math.hypot(after.tx - before.haeju.tx, after.ty - before.haeju.ty);
if (dist < 0.8) fail.push("did not walk, dist=" + dist);
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ before, moved, after, dist, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
