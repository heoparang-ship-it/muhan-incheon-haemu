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
  const g = H.guards.find((x) => x.type === "acolyte" && !x.unconscious) || H.guards[0];
  const lamp = (H.map.lamps || []).find((l) => l.tx === 45 && l.ty === 25) || (H.map.lamps || [])[0];
  const spots = [];
  for (let y = 20; y <= 58; y++) {
    for (let x = 16; x <= 50; x++) {
      if (H.walkableAt(x, y, 0, g)) spots.push([x, y]);
    }
  }
  let here = null, beforePath = 0;
  for (const s of spots) {
    const p = H.findPath(s[0], s[1], lamp.tx, lamp.ty, g);
    if (p.length > 0) { here = s; beforePath = p.length; g.path = p; break; }
  }
  if (here) { g.tx = here[0]; g.ty = here[1]; }
  lamp.on = false;
  lamp.offAt = H.state.now;
  lamp.relighter = g.id;
  g.ai = "relight";
  g.relightLamp = lamp;
  const at = {
    id: g.id, type: g.type, here, lamp: [lamp.tx, lamp.ty], lampName: lamp.name,
    spots: spots.length, beforePath, ai: g.ai
  };

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((x) => x.id === g.id);
  const snapLamp = (snap.lamps || []).find((x) => x.tx === lamp.tx && x.ty === lamp.ty);

  H.rebuildWorld();
  const mid = H.guards.find((x) => x.id === g.id);
  const midLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const wiped = {
    ai: mid && mid.ai,
    relight: !!(mid && mid.relightLamp),
    lampOn: midLamp && midLamp.on,
    relighter: midLamp && midLamp.relighter
  };

  H.applySave(snap);
  const after = H.guards.find((x) => x.id === g.id);
  const afterLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  H.updateLamps();
  const afterTick = {
    ai: after && after.ai,
    relight: after && after.relightLamp && [after.relightLamp.tx, after.relightLamp.ty],
    path: after && (after.path || []).length,
    lampOn: afterLamp && afterLamp.on,
    relighter: afterLamp && afterLamp.relighter
  };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((x) => x.id === g.id);
  const oldLampRec = (old.lamps || []).find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  if (oldRec) {
    oldRec.ai = "relight";
    delete oldRec.relightLamp;
  }
  if (oldLampRec) oldLampRec.on = false;
  H.applySave(old);
  const oldAfter = H.guards.find((x) => x.id === g.id);
  const oldLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);

  H.rebuildWorld();
  const g2 = H.guards.find((x) => x.id === g.id);
  const lamp2 = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  if (here) { g2.tx = here[0]; g2.ty = here[1]; }
  lamp2.on = false;
  lamp2.offAt = H.state.now;
  lamp2.relighter = g2.id;
  g2.ai = "relight";
  g2.relightLamp = lamp2;
  g2.path = H.findPath(g2.tx, g2.ty, lamp2.tx, lamp2.ty, g2);
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((x) => x.id === g.id);
  const contLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);

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
    snapAi: rec && rec.ai,
    snapRelight: rec && rec.relightLamp,
    snapLampOn: snapLamp && snapLamp.on,
    wiped,
    afterAi: after && after.ai,
    afterRelight: after && after.relightLamp && [after.relightLamp.tx, after.relightLamp.ty],
    afterPath: after && (after.path || []).length,
    afterLampOn: afterLamp && afterLamp.on,
    afterRelighter: afterLamp && afterLamp.relighter,
    afterTick,
    oldAi: oldAfter && oldAfter.ai,
    oldRelight: !!(oldAfter && oldAfter.relightLamp),
    oldPath: oldAfter && (oldAfter.path || []).length,
    oldLampOn: oldLamp && oldLamp.on,
    oldRelighter: oldLamp && oldLamp.relighter,
    contAi: cont && cont.ai,
    contRelight: cont && cont.relightLamp && [cont.relightLamp.tx, cont.relightLamp.ty],
    contPath: cont && (cont.path || []).length,
    contLampOn: contLamp && contLamp.on,
    contRelighter: contLamp && contLamp.relighter,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.ai === "relight") || H.guards[0];
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
    el.textContent = "불러온 뒤에도 신도가 꺼진 등불로 달려간다";
    box.appendChild(el);
  }
  return {
    id: g && g.id,
    ai: g && g.ai,
    relight: g && g.relightLamp && [g.relightLamp.tx, g.relightLamp.ty],
    path: g && (g.path || []).length
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/relight-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.ai === "relight");
  if (g) {
    if (g.relightLamp) { g.relightLamp.relighter = null; g.relightLamp = null; }
    g.ai = "patrol";
    g.path = [];
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/relight-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!(info.at.beforePath > 0)) fail.push("before path " + info.at.beforePath + " at " + JSON.stringify(info.at));
if (info.snapAi !== "relight") fail.push("snap ai " + info.snapAi);
if (!info.snapRelight || info.snapRelight.tx !== info.at.lamp[0] || info.snapRelight.ty !== info.at.lamp[1]) {
  fail.push("snap relight " + JSON.stringify(info.snapRelight));
}
if (info.snapLampOn !== false) fail.push("snap lamp on " + info.snapLampOn);
if (info.wiped && info.wiped.ai === "relight") fail.push("rebuild kept relight");
if (info.afterAi !== "relight") fail.push("after ai " + info.afterAi);
if (!info.afterRelight || info.afterRelight[0] !== info.at.lamp[0] || info.afterRelight[1] !== info.at.lamp[1]) {
  fail.push("after relight " + JSON.stringify(info.afterRelight));
}
if (!(info.afterPath > 0)) fail.push("after path " + info.afterPath);
if (info.afterLampOn !== false) fail.push("after lamp on " + info.afterLampOn);
if (info.afterRelighter !== info.at.id) fail.push("after relighter " + info.afterRelighter);
if (info.afterTick.ai !== "relight") fail.push("updateLamps dropped relight " + info.afterTick.ai);
if (info.oldRelight) fail.push("old relight should be empty");
if (info.oldPath) fail.push("old path should be 0, got " + info.oldPath);
if (info.contAi !== "relight") fail.push("continue ai " + info.contAi);
if (!info.contRelight || info.contRelight[0] !== info.at.lamp[0] || info.contRelight[1] !== info.at.lamp[1]) {
  fail.push("continue relight " + JSON.stringify(info.contRelight));
}
if (!(info.contPath > 0)) fail.push("continue path " + info.contPath);
if (info.contRelighter !== info.at.id) fail.push("continue relighter " + info.contRelighter);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
