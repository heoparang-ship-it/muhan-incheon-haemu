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
  const btn = () => {
    const el = document.getElementById("muteBtn");
    return el ? el.textContent : "";
  };

  H.applyMuted(true);
  const snapOn = H.snapshotSave();
  const btnOn = btn();

  H.applyMuted(false);
  const midOff = !!H.audio.muted;

  H.applySave(snapOn);
  const afterOn = !!H.audio.muted;
  const btnAfter = btn();

  H.applyMuted(false);
  const snapOff = H.snapshotSave();
  H.applyMuted(true);
  H.applySave(snapOff);
  const afterOff = !!H.audio.muted;
  const btnOff = btn();

  const old = H.snapshotSave();
  delete old.muted;
  H.applyMuted(true);
  H.applySave(old);
  const oldMuted = !!H.audio.muted;

  H.applyMuted(true);
  H.writeSave(true);
  H.continueMission();
  const cont = !!H.audio.muted;
  const btnCont = btn();

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapOn: !!snapOn.muted,
    snapOff: !!snapOff.muted,
    midOff,
    afterOn,
    btnOn,
    btnAfter,
    afterOff,
    btnOff,
    oldMuted,
    cont,
    btnCont,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.applyMuted(true);
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.0;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 음소거가 남는다";
    box.appendChild(el);
  }
  const mb = document.getElementById("muteBtn");
  return { muted: !!H.audio.muted, btn: mb ? mb.textContent : "" };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/mute-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.applyMuted(false);
  H.state.paused = true;
  H.centerOnSelected();
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/mute-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapOn !== true) fail.push("snapOn " + info.snapOn);
if (info.midOff !== false) fail.push("midOff " + info.midOff);
if (info.afterOn !== true) fail.push("afterOn " + info.afterOn);
if (info.btnAfter !== "🔇") fail.push("btnAfter " + info.btnAfter);
if (info.afterOff !== false) fail.push("afterOff " + info.afterOff);
if (info.btnOff !== "🔊") fail.push("btnOff " + info.btnOff);
if (info.oldMuted !== false) fail.push("old " + info.oldMuted);
if (info.cont !== true) fail.push("continue " + info.cont);
if (info.btnCont !== "🔇") fail.push("btnCont " + info.btnCont);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
