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
  const noiseR = (radius) => {
    H.state.noises = [];
    H.emitNoise(20, 50, radius, "시험");
    const n = H.state.noises[H.state.noises.length - 1];
    return n && n.r;
  };

  H.state.bellRinging = 1.8;
  const beforeR = noiseR(10);
  const snap = H.snapshotSave();

  H.rebuildWorld();
  const wiped = { bell: H.state.bellRinging, r: noiseR(10) };

  H.applySave(snap);
  const afterR = noiseR(10);
  const afterBell = H.state.bellRinging;

  H.rebuildWorld();
  const old = H.snapshotSave();
  delete old.bellRinging;
  H.applySave(old);
  const oldBell = H.state.bellRinging;
  const oldR = noiseR(10);

  H.rebuildWorld();
  H.state.bellRinging = 1.8;
  H.writeSave(true);
  H.continueMission();
  const contBell = H.state.bellRinging;
  const contR = noiseR(10);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapBell: snap.bellRinging,
    beforeR,
    wiped,
    afterBell,
    afterR,
    oldBell,
    oldR,
    contBell,
    contR,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.state.bellRinging = 1.8;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) { a.tx = 74; a.ty = 70; }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 종소리가 소음을 가린다";
    box.appendChild(el);
  }
  return { bell: H.state.bellRinging, at: a && [a.tx, a.ty] };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/bellring-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.bellRinging = 0;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/bellring-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (Math.abs((info.snapBell || 0) - 1.8) > 1e-9) fail.push("snap bell " + info.snapBell);
if (Math.abs((info.beforeR || 0) - 5.5) > 1e-9) fail.push("before r " + info.beforeR);
if (info.wiped && info.wiped.bell > 0) fail.push("rebuild kept bell " + info.wiped.bell);
if (Math.abs((info.wiped && info.wiped.r) - 10) > 1e-9) fail.push("rebuild r " + (info.wiped && info.wiped.r));
if (Math.abs((info.afterBell || 0) - 1.8) > 1e-9) fail.push("after bell " + info.afterBell);
if (Math.abs((info.afterR || 0) - 5.5) > 1e-9) fail.push("after r " + info.afterR);
if (info.oldBell) fail.push("old bell should be 0, got " + info.oldBell);
if (Math.abs((info.oldR || 0) - 10) > 1e-9) fail.push("old r " + info.oldR);
if (Math.abs((info.contBell || 0) - 1.8) > 1e-9) fail.push("continue bell " + info.contBell);
if (Math.abs((info.contR || 0) - 5.5) > 1e-9) fail.push("continue r " + info.contR);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
