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
  const c = H.civilians.find((x) => x.type !== "prisoner" && x.type !== "patient") || H.civilians[0];
  const spots = [];
  for (let y = 46; y <= 58; y++) {
    for (let x = 16; x <= 32; x++) {
      if (H.walkableAt(x, y, 0, c)) spots.push([x, y]);
    }
  }
  if (spots.length) { c.tx = spots[0][0]; c.ty = spots[0][1]; }
  c.panic = 0.8;
  c.screamed = true;
  c.path = [];
  H.state.publicMood = 0.5;
  const at = { id: c.id, type: c.type, xy: [c.tx, c.ty], panic: c.panic, screamed: c.screamed };

  const snap = H.snapshotSave();
  const rec = (snap.civilians || []).find((x) => x.id === c.id);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === c.id);
  const wiped = { panic: mid && mid.panic, screamed: !!(mid && mid.screamed) };

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === c.id);
  const afterPanic = after && after.panic;
  const afterScreamed = after && after.screamed;
  H.state.publicMood = 0.5;
  H.state.paused = true;
  H.updateCivilians(0.05);
  const afterTick = {
    panic: after && after.panic,
    screamed: after && after.screamed,
    mood: H.state.publicMood,
    wouldScream: after && after.panic > 0.55 && !after.screamed
  };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.civilians || []).find((x) => x.id === c.id);
  if (oldRec) {
    oldRec.panic = 0.8;
    delete oldRec.screamed;
  }
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === c.id);
  const oldBeforeTick = {
    panic: oldAfter && oldAfter.panic,
    screamed: !!(oldAfter && oldAfter.screamed),
    wouldScream: oldAfter && oldAfter.panic > 0.55 && !oldAfter.screamed
  };
  H.state.publicMood = 0.5;
  H.updateCivilians(0.05);
  const oldTick = {
    panic: oldAfter && oldAfter.panic,
    screamed: !!(oldAfter && oldAfter.screamed),
    mood: H.state.publicMood
  };

  H.rebuildWorld();
  const c2 = H.civilians.find((x) => x.id === c.id);
  if (spots.length) { c2.tx = spots[0][0]; c2.ty = spots[0][1]; }
  c2.panic = 0.8;
  c2.screamed = true;
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === c.id);

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
    snapPanic: rec && rec.panic,
    snapScreamed: rec && rec.screamed,
    wiped,
    afterPanic,
    afterScreamed,
    afterTick,
    oldBeforeTick,
    oldTick,
    contPanic: cont && cont.panic,
    contScreamed: !!(cont && cont.screamed),
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const c = H.civilians.find((x) => x.screamed) || H.civilians[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (a && c) { a.tx = c.tx; a.ty = c.ty; }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 이미 지른 비명은 다시 나지 않는다";
    box.appendChild(el);
  }
  return { id: c && c.id, panic: c && c.panic, screamed: !!(c && c.screamed) };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/scream-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const c = H.civilians.find((x) => x.screamed);
  if (c) { c.panic = 0; c.screamed = false; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/scream-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapPanic !== 0.8) fail.push("snap panic " + info.snapPanic);
if (info.snapScreamed !== true) fail.push("snap screamed " + info.snapScreamed);
if (info.wiped && info.wiped.screamed) fail.push("rebuild kept screamed");
if (info.afterPanic !== 0.8) fail.push("after panic " + info.afterPanic);
if (info.afterScreamed !== true) fail.push("after screamed " + info.afterScreamed);
if (info.afterTick.wouldScream) fail.push("after tick still would scream");
if (Math.abs((info.afterTick.mood || 0) - 0.5) > 1e-12) fail.push("after tick mood " + info.afterTick.mood);
if (!info.oldBeforeTick.wouldScream) fail.push("old save should scream");
if (Math.abs((info.oldTick.mood || 0) - 0.44) > 1e-12) fail.push("old tick mood " + info.oldTick.mood);
if (!info.oldTick.screamed) fail.push("old tick did not set screamed");
if (info.contPanic !== 0.8) fail.push("continue panic " + info.contPanic);
if (!info.contScreamed) fail.push("continue screamed " + info.contScreamed);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
