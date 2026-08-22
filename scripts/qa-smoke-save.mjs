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
  const wolsim = H.agents.find((a) => a.id === "wolsim");
  wolsim.tx = 25;
  wolsim.ty = 66;
  H.state.smoke = [{ tx: wolsim.tx, ty: wolsim.ty, r: 3.6, life: 9.25, max: 14 }];

  const snap = H.snapshotSave();
  const snapSmoke = (snap.smoke || [])[0];
  const snapN = (snap.smoke || []).length;

  H.rebuildWorld();
  const wiped = (H.state.smoke || []).length;
  H.applySave(snap);
  const after = H.state.smoke || [];
  const afterWolsim = H.agents.find((a) => a.id === "wolsim");

  H.rebuildWorld();
  const old = H.snapshotSave();
  delete old.smoke;
  H.applySave(old);
  const oldN = (H.state.smoke || []).length;

  H.rebuildWorld();
  H.applySave(snap);
  const dead = JSON.parse(JSON.stringify(snap));
  dead.smoke = [{ tx: 25, ty: 66, r: 3.6, life: 0, max: 14 }];
  H.applySave(dead);
  const deadN = (H.state.smoke || []).length;

  H.rebuildWorld();
  const w2 = H.agents.find((a) => a.id === "wolsim");
  w2.tx = 25;
  w2.ty = 66;
  H.state.smoke = [{ tx: 25, ty: 66, r: 3.6, life: 9.25, max: 14 }];
  H.writeSave(true);
  H.continueMission();
  const cont = H.state.smoke || [];

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapN,
    snapSmoke,
    wiped,
    afterN: after.length,
    afterSmoke: after[0] || null,
    afterWolsim: afterWolsim && [afterWolsim.tx, afterWolsim.ty],
    oldN,
    deadN,
    contN: cont.length,
    contSmoke: cont[0] || null,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "wolsim");
  if (a) { a.tx = 25; a.ty = 66; }
  if (!H.state.smoke.length) {
    H.state.smoke = [{ tx: 25, ty: 66, r: 3.6, life: 9.25, max: 14 }];
  }
  H.selectAgent("wolsim");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 향 연기가 남았다";
    box.appendChild(el);
  }
  return {
    wolsim: a && [a.tx, a.ty],
    smoke: (H.state.smoke || []).map((s) => ({ tx: s.tx, ty: s.ty, r: s.r, life: s.life, max: s.max }))
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/smoke-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.smoke = [];
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/smoke-save-empty.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapN !== 1) fail.push("snapN " + info.snapN);
if (!info.snapSmoke) fail.push("no snap smoke");
if (info.snapSmoke && info.snapSmoke.tx !== 25) fail.push("snap tx " + info.snapSmoke.tx);
if (info.snapSmoke && info.snapSmoke.ty !== 66) fail.push("snap ty " + info.snapSmoke.ty);
if (info.snapSmoke && info.snapSmoke.r !== 3.6) fail.push("snap r " + info.snapSmoke.r);
if (info.snapSmoke && info.snapSmoke.life !== 9.25) fail.push("snap life " + info.snapSmoke.life);
if (info.snapSmoke && info.snapSmoke.max !== 14) fail.push("snap max " + info.snapSmoke.max);
if (info.wiped !== 0) fail.push("rebuild did not wipe " + info.wiped);
if (info.afterN !== 1) fail.push("afterN " + info.afterN);
if (!info.afterSmoke) fail.push("no after smoke");
if (info.afterSmoke && info.afterSmoke.life !== 9.25) fail.push("after life " + info.afterSmoke.life);
if (info.afterSmoke && info.afterSmoke.r !== 3.6) fail.push("after r " + info.afterSmoke.r);
if (info.afterSmoke && (info.afterSmoke.tx !== 25 || info.afterSmoke.ty !== 66)) {
  fail.push("after at " + JSON.stringify([info.afterSmoke.tx, info.afterSmoke.ty]));
}
if (info.oldN !== 0) fail.push("old field missing should be 0, got " + info.oldN);
if (info.deadN !== 0) fail.push("life 0 kept " + info.deadN);
if (info.contN !== 1) fail.push("continue N " + info.contN);
if (info.contSmoke && info.contSmoke.life !== 9.25) fail.push("continue life " + info.contSmoke.life);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
