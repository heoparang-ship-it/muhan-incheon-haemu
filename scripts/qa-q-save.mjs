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
  const haeju = H.agents.find((a) => a.id === "haeju");
  const dochi = H.agents.find((a) => a.id === "dochi");
  const now0 = H.state.now;
  const beforeCool = haeju.coolUntil || 0;
  haeju.disguise = now0 + 22000;
  haeju.coolUntil = now0 + 20000;
  dochi.waterWalk = true;
  dochi.waterUntil = now0 + 18000;
  dochi.coolUntil = now0 + 14000;

  const snap = H.snapshotSave();
  const recH = snap.agents.find((a) => a.id === "haeju");
  const recD = snap.agents.find((a) => a.id === "dochi");

  H.rebuildWorld();
  H.applySave(snap);
  const afterH = H.agents.find((a) => a.id === "haeju");
  const afterD = H.agents.find((a) => a.id === "dochi");
  const clock = performance.now();
  const remCool = Math.max(0, (afterH.coolUntil || 0) - clock);
  const remDisg = Math.max(0, (afterH.disguise || 0) - clock);
  const remWater = Math.max(0, (afterD.waterUntil || 0) - clock);
  const remDochiCool = Math.max(0, (afterD.coolUntil || 0) - clock);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldH = old.agents.find((a) => a.id === "haeju");
  const oldD = old.agents.find((a) => a.id === "dochi");
  delete oldH.coolUntil;
  delete oldH.disguise;
  delete oldD.waterUntil;
  delete oldD.coolUntil;
  delete oldD.waterWalk;
  H.applySave(old);
  const oldAfterH = H.agents.find((a) => a.id === "haeju");
  const oldAfterD = H.agents.find((a) => a.id === "dochi");
  const oldClock = performance.now();
  const oldRemCool = Math.max(0, (oldAfterH.coolUntil || 0) - oldClock);
  const oldRemDisg = Math.max(0, (oldAfterH.disguise || 0) - oldClock);
  const oldRemWater = Math.max(0, (oldAfterD.waterUntil || 0) - oldClock);
  const oldWalk = !!oldAfterD.waterWalk;

  H.rebuildWorld();
  const h2 = H.agents.find((a) => a.id === "haeju");
  const d2 = H.agents.find((a) => a.id === "dochi");
  const n2 = H.state.now;
  h2.disguise = n2 + 22000;
  h2.coolUntil = n2 + 20000;
  d2.waterWalk = true;
  d2.waterUntil = n2 + 18000;
  d2.coolUntil = n2 + 14000;
  H.writeSave(true);
  H.continueMission();
  const contH = H.agents.find((a) => a.id === "haeju");
  const contD = H.agents.find((a) => a.id === "dochi");
  const contClock = performance.now();
  const contCool = Math.max(0, (contH.coolUntil || 0) - contClock);
  const contDisg = Math.max(0, (contH.disguise || 0) - contClock);
  const contWater = Math.max(0, (contD.waterUntil || 0) - contClock);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    beforeCool,
    snapCool: recH && recH.coolUntil,
    snapDisg: recH && recH.disguise,
    snapWater: recD && recD.waterUntil,
    snapDochiCool: recD && recD.coolUntil,
    snapWalk: recD && recD.waterWalk,
    remCool,
    remDisg,
    remWater,
    remDochiCool,
    afterWalk: !!afterD.waterWalk,
    blocked: remCool > 0,
    oldRemCool,
    oldRemDisg,
    oldRemWater,
    oldWalk,
    contCool,
    contDisg,
    contWater,
    contWalk: !!contD.waterWalk,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (!(haeju.disguise > performance.now())) {
    haeju.disguise = performance.now() + 22000;
    haeju.coolUntil = performance.now() + 20000;
  }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 변장과 Q 대기가 남았다";
    box.appendChild(el);
  }
  return {
    remCool: Math.max(0, (haeju.coolUntil || 0) - performance.now()),
    remDisg: Math.max(0, (haeju.disguise || 0) - performance.now())
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/q-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const a of H.agents) {
    a.coolUntil = 0;
    a.disguise = 0;
    a.waterUntil = 0;
    a.waterWalk = false;
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.selectAgent("haeju");
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/q-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.beforeCool) fail.push("already cooling " + info.beforeCool);
if (Math.abs(info.snapCool - 20000) > 1) fail.push("snap cool " + info.snapCool);
if (Math.abs(info.snapDisg - 22000) > 1) fail.push("snap disg " + info.snapDisg);
if (Math.abs(info.snapWater - 18000) > 1) fail.push("snap water " + info.snapWater);
if (Math.abs(info.snapDochiCool - 14000) > 1) fail.push("snap dochi cool " + info.snapDochiCool);
if (!info.snapWalk) fail.push("snap walk");
if (!(info.remCool > 19000 && info.remCool <= 20000)) fail.push("remCool " + info.remCool);
if (!(info.remDisg > 21000 && info.remDisg <= 22000)) fail.push("remDisg " + info.remDisg);
if (!(info.remWater > 17000 && info.remWater <= 18000)) fail.push("remWater " + info.remWater);
if (!(info.remDochiCool > 13000 && info.remDochiCool <= 14000)) fail.push("remDochiCool " + info.remDochiCool);
if (!info.afterWalk) fail.push("after walk false");
if (!info.blocked) fail.push("not blocked");
if (info.oldRemCool > 50) fail.push("old remCool " + info.oldRemCool);
if (info.oldRemDisg > 50) fail.push("old remDisg " + info.oldRemDisg);
if (info.oldRemWater > 50) fail.push("old remWater " + info.oldRemWater);
if (info.oldWalk) fail.push("old walk");
if (!(info.contCool > 19000 && info.contCool <= 20000)) fail.push("contCool " + info.contCool);
if (!(info.contDisg > 21000 && info.contDisg <= 22000)) fail.push("contDisg " + info.contDisg);
if (!(info.contWater > 17000 && info.contWater <= 18000)) fail.push("contWater " + info.contWater);
if (!info.contWalk) fail.push("cont walk");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
