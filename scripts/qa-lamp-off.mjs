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
  const lamp0 = (H.map.lamps || []).find((l) => !l.signal) || H.map.lamps[0];
  const now0 = H.state.now;
  lamp0.on = false;
  lamp0.offAt = now0 - 8000;
  lamp0.relighter = null;

  const snap = H.snapshotSave();
  const rec = (snap.lamps || []).find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);

  H.rebuildWorld();
  const mid = H.map.lamps.find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);
  const wipedOn = mid && mid.on;
  H.applySave(snap);
  const after = H.map.lamps.find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);
  const clock = performance.now();
  H.state.now = clock;
  const elapsed = after ? clock - after.offAt : null;
  H.updateLamps();
  const afterRelighter = after && after.relighter;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.lamps || []).find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);
  if (oldRec) {
    oldRec.on = false;
    delete oldRec.offFor;
  }
  H.applySave(old);
  const oldL = H.map.lamps.find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);
  const oldClock = performance.now();
  H.state.now = oldClock;
  const oldElapsed = oldL ? oldClock - (oldL.offAt || 0) : null;

  H.rebuildWorld();
  const l2 = H.map.lamps.find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);
  l2.on = false;
  l2.offAt = H.state.now - 8000;
  H.writeSave(true);
  H.continueMission();
  const cont = H.map.lamps.find((l) => l.tx === lamp0.tx && l.ty === lamp0.ty);
  const contClock = performance.now();
  H.state.now = contClock;
  const contElapsed = cont ? contClock - cont.offAt : null;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    lamp: { tx: lamp0.tx, ty: lamp0.ty },
    snapOn: rec && rec.on,
    snapOffFor: rec && rec.offFor,
    wipedOn,
    afterOn: after && after.on,
    elapsed,
    afterRelighter,
    oldOn: oldL && oldL.on,
    oldElapsed,
    contOn: cont && cont.on,
    contElapsed,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const l = H.map.lamps.find((x) => !x.on) || H.map.lamps[0];
  const a = H.agents.find((x) => x.id === "mujin");
  if (a && l) { a.tx = l.tx; a.ty = l.ty; }
  H.selectAgent("mujin");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 등불이 꺼진 시간이 남았다";
    box.appendChild(el);
  }
  const clock = performance.now();
  return {
    at: l && [l.tx, l.ty],
    on: l && l.on,
    elapsed: l && l.offAt ? clock - l.offAt : 0
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/lamp-off-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const l of H.map.lamps) { l.on = true; l.offAt = 0; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/lamp-off-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapOn !== false) fail.push("snap on " + info.snapOn);
if (Math.abs(info.snapOffFor - 8000) > 1) fail.push("snapOffFor " + info.snapOffFor);
if (info.wipedOn !== true) fail.push("rebuild not on");
if (info.afterOn !== false) fail.push("after on " + info.afterOn);
if (!(info.elapsed > 7000 && info.elapsed < 9000)) fail.push("elapsed " + info.elapsed);
if (info.afterRelighter) fail.push("relighter too soon " + info.afterRelighter);
if (info.oldOn !== false) fail.push("old on " + info.oldOn);
if (!(info.oldElapsed > -50 && info.oldElapsed < 80)) fail.push("oldElapsed " + info.oldElapsed);
if (info.contOn !== false) fail.push("cont on " + info.contOn);
if (!(info.contElapsed > 7000 && info.contElapsed < 9000)) fail.push("contElapsed " + info.contElapsed);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
