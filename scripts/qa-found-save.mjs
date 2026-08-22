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
  H.state.prints = [];
  const down = H.guards.find((x) => !x.unconscious) || H.guards[0];
  const watcher = H.guards.find((x) => x.id !== down.id && !x.unconscious) || H.guards[1];
  const spots = [];
  for (let y = 46; y <= 58; y++) {
    for (let x = 16; x <= 32; x++) {
      if (H.walkableAt(x, y, 0, down)) spots.push([x, y]);
    }
  }
  if (spots.length >= 2) {
    down.tx = spots[0][0]; down.ty = spots[0][1];
    watcher.tx = spots[1][0]; watcher.ty = spots[1][1];
  }
  down.unconscious = true;
  down.tied = false;
  down.hidden = false;
  down.hidingAwake = false;
  down.found = true;
  down.ai = "down";
  watcher.ai = "patrol";
  watcher.path = [];
  const at = { down: down.id, watcher: watcher.id, xy: [down.tx, down.ty], wxy: [watcher.tx, watcher.ty] };

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((x) => x.id === down.id);

  H.rebuildWorld();
  const mid = H.guards.find((x) => x.id === down.id);
  const wiped = { unconscious: !!(mid && mid.unconscious), found: !!(mid && mid.found) };

  H.applySave(snap);
  const after = H.guards.find((x) => x.id === down.id);
  const wAfter = H.guards.find((x) => x.id === watcher.id);
  H.state.prints = [];
  for (const d of H.map.doors || []) d.noticed = true;
  for (const l of H.map.lamps || []) l.noticed = true;
  const alarmBefore = H.state.alarmLevel;
  wAfter.ai = "patrol";
  wAfter.path = [];
  H.checkTraces(wAfter);
  const afterTrace = {
    found: !!(after && after.found),
    watcherAi: wAfter.ai,
    alarm: H.state.alarmLevel,
    alarmGrew: H.state.alarmLevel > alarmBefore
  };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((x) => x.id === down.id);
  if (oldRec) {
    oldRec.unconscious = true;
    oldRec.tied = false;
    oldRec.hidden = false;
    delete oldRec.found;
  }
  H.applySave(old);
  const oldDown = H.guards.find((x) => x.id === down.id);
  const oldWatch = H.guards.find((x) => x.id === watcher.id);
  const oldBefore = { found: !!(oldDown && oldDown.found), alarm: H.state.alarmLevel };
  if (spots.length >= 2) {
    oldDown.tx = spots[0][0]; oldDown.ty = spots[0][1];
    oldWatch.tx = spots[1][0]; oldWatch.ty = spots[1][1];
  }
  oldDown.unconscious = true;
  oldDown.tied = false;
  oldDown.hidden = false;
  oldWatch.ai = "patrol";
  oldWatch.path = [];
  H.state.prints = [];
  for (const d of H.map.doors || []) d.noticed = true;
  for (const l of H.map.lamps || []) l.noticed = true;
  H.checkTraces(oldWatch);
  const oldTrace = { found: !!(oldDown && oldDown.found), alarm: H.state.alarmLevel };

  H.rebuildWorld();
  const d2 = H.guards.find((x) => x.id === down.id);
  if (spots.length) { d2.tx = spots[0][0]; d2.ty = spots[0][1]; }
  d2.unconscious = true;
  d2.tied = false;
  d2.hidden = false;
  d2.found = true;
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((x) => x.id === down.id);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at,
    snapUncon: rec && rec.unconscious,
    snapFound: rec && rec.found,
    wiped,
    afterUncon: after && after.unconscious,
    afterFound: after && after.found,
    afterTrace,
    oldBefore,
    oldTrace,
    contUncon: !!(cont && cont.unconscious),
    contFound: !!(cont && cont.found),
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.found) || H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (a && g) { a.tx = g.tx; a.ty = g.ty; }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 이미 발견된 쓰러진 경비는 다시 경보하지 않는다";
    box.appendChild(el);
  }
  return { id: g && g.id, found: !!(g && g.found), unconscious: !!(g && g.unconscious) };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/found-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.found);
  if (g) { g.found = false; g.unconscious = false; g.ai = "patrol"; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/found-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapFound !== true) fail.push("snap found " + info.snapFound);
if (info.snapUncon !== true) fail.push("snap uncon " + info.snapUncon);
if (info.wiped && info.wiped.found) fail.push("rebuild kept found");
if (info.afterFound !== true) fail.push("after found " + info.afterFound);
if (info.afterTrace.alarmGrew) fail.push("found still raised alarm");
if (info.afterTrace.found !== true) fail.push("after trace lost found");
if (info.oldBefore.found) fail.push("old found should be false");
if (!info.oldTrace.found) fail.push("old trace should set found");
if (!(info.oldTrace.alarm > info.oldBefore.alarm) && !info.oldTrace.found) fail.push("old trace no discovery");
if (!info.contFound) fail.push("continue found " + info.contFound);
if (!info.contUncon) fail.push("continue uncon " + info.contUncon);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
