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

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const read = () => {
    const on = [];
    document.querySelectorAll("#saveSlots button").forEach((b) => {
      if (b.classList.contains("on")) on.push(b.getAttribute("data-slot"));
    });
    return on;
  };

  H.writeSave(true, 1);
  const afterSet = read();

  H.rebuildWorld();
  const afterRebuild = read();

  H.applySave(H.snapshotSave());
  const afterApply = read();

  H.writeSave(true, 1);
  H.continueMission();
  const afterContinue = read();

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    afterSet,
    afterRebuild,
    afterApply,
    afterContinue,
    hasMark: typeof H.markSaveSlot === "function",
    phases,
  };
});

await page.evaluate(() => window.__HAEMU__.setMenuPause(true));
await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/slot-save-after.png" });

const oldInfo = await page.evaluate(() => {
  try { localStorage.removeItem("haemu-save-v2:last"); } catch (e) {}
  window.__HAEMU__.markSaveSlot();
  const on = [];
  document.querySelectorAll("#saveSlots button").forEach((b) => {
    if (b.classList.contains("on")) on.push(b.getAttribute("data-slot"));
  });
  return on;
});

await page.evaluate(() => {
  try { localStorage.removeItem("haemu-save-v2:last"); } catch (e) {}
  window.__HAEMU__.rebuildWorld();
  window.__HAEMU__.setMenuPause(true);
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/workspace/screenshots/slot-save-clear.png" });
await browser.close();

const only1 = (a) => Array.isArray(a) && a.length === 1 && a[0] === "1";
const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push(`map ${info.map}`);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push(`roles ${info.roles}`);
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push(`tide ${t.p} ${t.wl}`);
}
if (!info.hasMark) fail.push("markSaveSlot 없음");
if (!only1(info.afterSet)) fail.push(`set ${JSON.stringify(info.afterSet)}`);
if (!only1(info.afterRebuild)) fail.push(`rebuild ${JSON.stringify(info.afterRebuild)}`);
if (!only1(info.afterApply)) fail.push(`apply ${JSON.stringify(info.afterApply)}`);
if (!only1(info.afterContinue)) fail.push(`continue ${JSON.stringify(info.afterContinue)}`);
if (oldInfo.length) fail.push(`old ${JSON.stringify(oldInfo)}`);
if (errors.length) fail.push(`console ${errors.length}: ${errors.join(" | ")}`);

const out = { ok: fail.length === 0, fail, errors, info, oldInfo };
console.log(JSON.stringify(out, null, 2));
if (fail.length) process.exit(1);
