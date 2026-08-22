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
  const lamp = (H.map.lamps || []).find((l) => l.tx === 45 && l.ty === 25) || (H.map.lamps || [])[0];
  const door = (H.map.doors || []).find((d) => d.tx != null) || (H.map.doors || [])[0];
  lamp.on = false;
  lamp.noticed = true;
  if (door) { door.open = true; door.broken = false; door.noticed = true; }

  const snap = H.snapshotSave();
  const snapLamp = (snap.lamps || []).find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const snapDoor = door && (snap.doors || []).find((x) => x.i === door.i);

  H.rebuildWorld();
  const midLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const midDoor = door && H.map.doors.find((x) => x.i === door.i);
  const wiped = {
    lampOn: midLamp && midLamp.on,
    lampNoticed: !!(midLamp && midLamp.noticed),
    doorOpen: midDoor && midDoor.open,
    doorNoticed: !!(midDoor && midDoor.noticed)
  };

  H.applySave(snap);
  const afterLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const afterDoor = door && H.map.doors.find((x) => x.i === door.i);

  const g = H.guards.find((x) => !x.unconscious) || H.guards[0];
  g.ai = "patrol";
  g.path = [];
  g.target = null;
  const spots = [];
  for (let y = lamp.ty - 2; y <= lamp.ty + 2; y++) {
    for (let x = lamp.tx - 2; x <= lamp.tx + 2; x++) {
      if (x === lamp.tx && y === lamp.ty) continue;
      if (H.walkableAt(x, y, 0, g)) spots.push([x, y]);
    }
  }
  if (spots.length) { g.tx = spots[0][0]; g.ty = spots[0][1]; }
  H.checkTraces(g);
  const afterTrace = { ai: g.ai, target: g.target && [g.target.tx, g.target.ty] };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldLampRec = (old.lamps || []).find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const oldDoorRec = door && (old.doors || []).find((x) => x.i === door.i);
  if (oldLampRec) { oldLampRec.on = false; delete oldLampRec.noticed; }
  if (oldDoorRec) { oldDoorRec.open = true; delete oldDoorRec.noticed; }
  H.applySave(old);
  const oldLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const oldDoor = door && H.map.doors.find((x) => x.i === door.i);
  const oldBeforeTrace = {
    lampNoticed: !!(oldLamp && oldLamp.noticed),
    doorNoticed: !!(oldDoor && oldDoor.noticed)
  };
  const gOld = H.guards.find((x) => x.id === g.id) || H.guards[0];
  gOld.ai = "patrol";
  gOld.path = [];
  gOld.target = null;
  if (spots.length) { gOld.tx = spots[0][0]; gOld.ty = spots[0][1]; }
  H.state.prints = [];
  H.checkTraces(gOld);
  const oldTrace = { ai: gOld.ai, lampNoticed: !!(oldLamp && oldLamp.noticed), doorNoticed: !!(oldDoor && oldDoor.noticed) };

  H.rebuildWorld();
  const lamp2 = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const door2 = door && H.map.doors.find((x) => x.i === door.i);
  lamp2.on = false;
  lamp2.noticed = true;
  if (door2) { door2.open = true; door2.noticed = true; }
  H.writeSave(true);
  H.continueMission();
  const contLamp = H.map.lamps.find((x) => x.tx === lamp.tx && x.ty === lamp.ty);
  const contDoor = door && H.map.doors.find((x) => x.i === door.i);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    lamp: [lamp.tx, lamp.ty],
    lampName: lamp.name,
    doorI: door && door.i,
    doorAt: door && [door.tx, door.ty],
    snapLampOn: snapLamp && snapLamp.on,
    snapLampNoticed: snapLamp && snapLamp.noticed,
    snapDoorOpen: snapDoor && snapDoor.open,
    snapDoorNoticed: snapDoor && snapDoor.noticed,
    wiped,
    afterLampOn: afterLamp && afterLamp.on,
    afterLampNoticed: afterLamp && afterLamp.noticed,
    afterDoorOpen: afterDoor && afterDoor.open,
    afterDoorNoticed: afterDoor && afterDoor.noticed,
    afterTrace,
    oldBeforeTrace,
    oldTrace,
    contLampOn: contLamp && contLamp.on,
    contLampNoticed: contLamp && contLamp.noticed,
    contDoorOpen: contDoor && contDoor.open,
    contDoorNoticed: contDoor && contDoor.noticed,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const lamp = (H.map.lamps || []).find((l) => !l.on) || (H.map.lamps || [])[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (a && lamp) { a.tx = lamp.tx; a.ty = lamp.ty + 1; }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 이미 눈치챈 등불은 다시 발견되지 않는다";
    box.appendChild(el);
  }
  return { lamp: lamp && [lamp.tx, lamp.ty], noticed: lamp && lamp.noticed, on: lamp && lamp.on };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/noticed-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const l of H.map.lamps || []) { l.noticed = false; }
  for (const d of H.map.doors || []) { d.noticed = false; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/noticed-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapLampOn !== false) fail.push("snap lamp on " + info.snapLampOn);
if (info.snapLampNoticed !== true) fail.push("snap lamp noticed " + info.snapLampNoticed);
if (info.snapDoorNoticed !== true) fail.push("snap door noticed " + info.snapDoorNoticed);
if (info.wiped && info.wiped.lampNoticed) fail.push("rebuild kept lamp noticed");
if (info.afterLampOn !== false) fail.push("after lamp on " + info.afterLampOn);
if (info.afterLampNoticed !== true) fail.push("after lamp noticed " + info.afterLampNoticed);
if (info.afterDoorNoticed !== true) fail.push("after door noticed " + info.afterDoorNoticed);
if (info.afterTrace.ai === "investigate") fail.push("noticed still triggered investigate " + JSON.stringify(info.afterTrace));
if (info.oldBeforeTrace.lampNoticed) fail.push("old lamp noticed should be false");
if (info.oldBeforeTrace.doorNoticed) fail.push("old door noticed should be false");
if (info.oldTrace.ai !== "investigate") fail.push("old save should investigate, got " + info.oldTrace.ai);
if (info.contLampNoticed !== true) fail.push("continue lamp noticed " + info.contLampNoticed);
if (info.contDoorNoticed !== true) fail.push("continue door noticed " + info.contDoorNoticed);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
