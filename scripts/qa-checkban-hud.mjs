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

const leftover = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.type === "steward");
  const a = H.agents[0];
  H.startStewardCheck(g, a);
  const ban = document.getElementById("checkBanner");
  return {
    hold: !!a.checkHold,
    show: !!(ban && ban.classList.contains("show")),
    text: ban ? ban.textContent : "",
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/checkban-hud-on.png" });

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const snap = H.snapshotSave();
  H.writeSave(true);
  H.continueMission();
  H.state.paused = true;
  const ban = document.getElementById("checkBanner");
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    afterContinue: {
      hold: H.agents.some((x) => x.checkHold > 0),
      show: !!(ban && ban.classList.contains("show")),
    },
    snapHasHold: (snap.agents || []).some((x) => Object.prototype.hasOwnProperty.call(x, "checkHold")),
    phases,
  };
});

await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/checkban-hud-after.png" });

const afterRebuild = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.type === "steward");
  H.startStewardCheck(g, H.agents[0]);
  H.rebuildWorld();
  const ban = document.getElementById("checkBanner");
  return {
    hold: H.agents.some((x) => x.checkHold > 0),
    show: !!(ban && ban.classList.contains("show")),
  };
});

await browser.close();

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!leftover.hold || !leftover.show) fail.push("leftover " + JSON.stringify(leftover));
if (info.afterContinue.hold || info.afterContinue.show) fail.push("continue " + JSON.stringify(info.afterContinue));
if (afterRebuild.hold || afterRebuild.show) fail.push("rebuild " + JSON.stringify(afterRebuild));
if (info.snapHasHold) fail.push("snap checkHold");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, leftover, info, afterRebuild };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
