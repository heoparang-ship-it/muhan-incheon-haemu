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
  const mujin = H.agents.find((a) => a.id === "mujin");
  const wolsim = H.agents.find((a) => a.id === "wolsim");
  const now0 = H.state.now;
  const before2 = mujin.coolUntil2 || 0;
  mujin.coolUntil2 = now0 + 16000;
  wolsim.incenseUntil = now0 + 6000;

  const snap = H.snapshotSave();
  const recM = snap.agents.find((a) => a.id === "mujin");
  const recW = snap.agents.find((a) => a.id === "wolsim");

  H.rebuildWorld();
  H.applySave(snap);
  const afterM = H.agents.find((a) => a.id === "mujin");
  const afterW = H.agents.find((a) => a.id === "wolsim");
  const rem2 = Math.max(0, (afterM.coolUntil2 || 0) - H.state.now);
  const remInc = Math.max(0, (afterW.incenseUntil || 0) - H.state.now);

  H.state.selected = "mujin";
  const blocked = rem2 > 0;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldM = old.agents.find((a) => a.id === "mujin");
  delete oldM.coolUntil2;
  delete old.agents.find((a) => a.id === "wolsim").incenseUntil;
  oldM.coolUntil2 = undefined;
  H.applySave(old);
  const oldAfter = H.agents.find((a) => a.id === "mujin");
  const oldRem = Math.max(0, (oldAfter.coolUntil2 || 0) - H.state.now);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    before2,
    snapCool2: recM && recM.coolUntil2,
    snapInc: recW && recW.incenseUntil,
    rem2,
    remInc,
    blocked,
    oldRem,
    now: H.state.now,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const mujin = H.agents.find((a) => a.id === "mujin");
  mujin.coolUntil2 = H.state.now + 16000;
  const snap = H.snapshotSave();
  H.rebuildWorld();
  H.applySave(snap);
  H.state.selected = "mujin";
  if (H.centerOnSelected) H.centerOnSelected();
  const after = H.agents.find((a) => a.id === "mujin");
  return { rem2: Math.max(0, (after.coolUntil2 || 0) - H.state.now) };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/cool2-save-qa.png" });
await page.screenshot({ path: "/workspace/screenshots/cool2-save-hud.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.before2) fail.push("already cooling " + info.before2);
if (!(info.snapCool2 > 0)) fail.push("snap cool2 " + info.snapCool2);
if (!(info.snapInc > 0)) fail.push("snap incense " + info.snapInc);
if (!(info.rem2 > 14000 && info.rem2 <= 16000)) fail.push("rem2 " + info.rem2);
if (!(info.remInc > 0 && info.remInc <= 6000)) fail.push("remInc " + info.remInc);
if (!info.blocked) fail.push("not blocked");
if (info.oldRem !== 0) fail.push("old rem " + info.oldRem);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
