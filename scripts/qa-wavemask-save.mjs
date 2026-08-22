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
  H.state.waveMaskUnlocked = true;
  H.state.waveMaskCycle = 82;
  H.state.waveMaskT = 5.5;
  H.state.noises = [];
  H.emitNoise(23, 65, 10, "발소리");
  const maskedR = H.state.noises.length ? H.state.noises[H.state.noises.length - 1].r : null;

  const snap = H.snapshotSave();

  H.rebuildWorld();
  const wiped = {
    t: H.state.waveMaskT,
    cycle: H.state.waveMaskCycle,
    unlocked: H.state.waveMaskUnlocked
  };
  H.applySave(snap);
  const after = {
    t: H.state.waveMaskT,
    cycle: H.state.waveMaskCycle,
    unlocked: H.state.waveMaskUnlocked
  };
  H.state.noises = [];
  H.emitNoise(23, 65, 10, "발소리");
  const afterR = H.state.noises.length ? H.state.noises[H.state.noises.length - 1].r : null;

  H.rebuildWorld();
  const old = H.snapshotSave();
  old.waveMaskUnlocked = true;
  old.waveMaskCycle = 82;
  delete old.waveMaskT;
  H.applySave(old);
  const oldT = H.state.waveMaskT;
  H.state.noises = [];
  H.emitNoise(23, 65, 10, "발소리");
  const oldR = H.state.noises.length ? H.state.noises[H.state.noises.length - 1].r : null;

  H.rebuildWorld();
  H.state.waveMaskUnlocked = true;
  H.state.waveMaskCycle = 82;
  H.state.waveMaskT = 5.5;
  H.writeSave(true);
  H.continueMission();
  const cont = {
    t: H.state.waveMaskT,
    cycle: H.state.waveMaskCycle,
    unlocked: H.state.waveMaskUnlocked
  };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapT: snap.waveMaskT,
    snapCycle: snap.waveMaskCycle,
    snapUnlocked: snap.waveMaskUnlocked,
    maskedR,
    wiped,
    after,
    afterR,
    oldT,
    oldR,
    cont,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  if (!(H.state.waveMaskT > 0)) H.state.waveMaskT = 5.5;
  H.state.waveMaskUnlocked = true;
  H.selectAgent("wolsim");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 파도 굉음이 소리를 덮는다";
    box.appendChild(el);
  }
  return { t: H.state.waveMaskT, cycle: H.state.waveMaskCycle, unlocked: H.state.waveMaskUnlocked };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/wavemask-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.waveMaskT = 0;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/wavemask-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapT !== 5.5) fail.push("snapT " + info.snapT);
if (info.snapCycle !== 82) fail.push("snapCycle " + info.snapCycle);
if (!info.snapUnlocked) fail.push("snap unlocked");
if (Math.abs(info.maskedR - 10 * 0.34) >= 1e-12) fail.push("maskedR " + info.maskedR);
if (info.wiped.t !== 0) fail.push("rebuild t " + info.wiped.t);
if (info.after.t !== 5.5) fail.push("after t " + info.after.t);
if (info.after.cycle !== 82) fail.push("after cycle " + info.after.cycle);
if (!info.after.unlocked) fail.push("after unlocked");
if (Math.abs(info.afterR - 10 * 0.34) >= 1e-12) fail.push("afterR " + info.afterR);
if (info.oldT !== 0) fail.push("old t " + info.oldT);
if (info.oldR !== 10) fail.push("oldR " + info.oldR);
if (info.cont.t !== 5.5) fail.push("continue t " + info.cont.t);
if (info.cont.cycle !== 82) fail.push("continue cycle " + info.cont.cycle);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
