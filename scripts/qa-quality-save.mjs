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
    const btn = document.getElementById("qualityBtn");
    return {
      auto: !!H.cam.qualityAuto,
      q: H.cam.quality,
      active: !!(btn && btn.classList.contains("active")),
    };
  };

  H.setQualityMode(3, { quiet: true });
  const afterSet = read();
  const snap = H.snapshotSave();

  H.rebuildWorld();
  const afterRebuild = read();

  H.applySave(snap);
  const afterApply = read();

  H.setQualityMode(3, { quiet: true });
  H.writeSave(true);
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
    snapMode: snap.qualityMode,
    afterSet,
    afterRebuild,
    afterApply,
    afterContinue,
    hasSet: typeof H.setQualityMode === "function",
    phases,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/quality-save-after.png" });

const oldInfo = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const old = H.snapshotSave();
  delete old.qualityMode;
  H.setQualityMode(3, { quiet: true });
  H.applySave(old);
  const btn = document.getElementById("qualityBtn");
  return {
    auto: !!H.cam.qualityAuto,
    active: !!(btn && btn.classList.contains("active")),
  };
});

await page.evaluate(() => {
  window.__HAEMU__.rebuildWorld();
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/workspace/screenshots/quality-save-clear.png" });
await browser.close();

const low = (r) => !r.auto && Math.abs(r.q - 0.6) < 1e-9 && r.active;
const auto = (r) => r.auto && !r.active;
const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push(`map ${info.map}`);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push(`roles ${info.roles}`);
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push(`tide ${t.p} ${t.wl}`);
}
if (!info.hasSet) fail.push("setQualityMode 없음");
if (info.snapMode !== 3) fail.push(`snap ${info.snapMode}`);
if (!low(info.afterSet)) fail.push(`set ${JSON.stringify(info.afterSet)}`);
if (!auto(info.afterRebuild)) fail.push(`rebuild ${JSON.stringify(info.afterRebuild)}`);
if (!low(info.afterApply)) fail.push(`apply ${JSON.stringify(info.afterApply)}`);
if (!low(info.afterContinue)) fail.push(`continue ${JSON.stringify(info.afterContinue)}`);
if (!oldInfo.auto || oldInfo.active) fail.push(`old ${JSON.stringify(oldInfo)}`);
if (errors.length) fail.push(`console ${errors.length}: ${errors.join(" | ")}`);

const out = { ok: fail.length === 0, fail, errors, info, oldInfo };
console.log(JSON.stringify(out, null, 2));
if (fail.length) process.exit(1);
