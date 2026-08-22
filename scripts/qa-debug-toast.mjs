import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (t.includes("404") || t.includes("Failed to load resource")) return;
  errors.push(t);
});

await page.goto("http://127.0.0.1:8080/game/index.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 8000 });
await page.locator("#startBtn").click();
await page.waitForTimeout(1400);
await page.waitForFunction(() => window.__HAEMU__?.map, { timeout: 20000 });

await page.locator("body").press("F9");
await page.waitForTimeout(120);
const afterOn = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const box = document.getElementById("toast");
  return {
    on: !!H.state.debug,
    toast: box ? box.textContent : "",
  };
});

await page.locator("body").press("F9");
await page.waitForTimeout(120);
const afterOff = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const box = document.getElementById("toast");
  return {
    on: !!H.state.debug,
    toast: box ? box.textContent : "",
  };
});

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const snap = H.snapshotSave();
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapHasDebug: Object.prototype.hasOwnProperty.call(snap, "debug"),
    phases,
  };
});

await page.screenshot({ path: "/workspace/screenshots/debug-toast-after.png" });
await browser.close();

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!afterOn.on || !String(afterOn.toast || "").includes("깔개를 켰다")) fail.push("on " + JSON.stringify(afterOn));
if (afterOff.on || !String(afterOff.toast || "").includes("깔개를 껐다")) fail.push("off " + JSON.stringify(afterOff));
if (info.snapHasDebug) fail.push("snap debug");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, afterOn, afterOff, info };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
