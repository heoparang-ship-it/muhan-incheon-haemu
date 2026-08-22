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
  const a = H.agents.find((x) => x.id === "haeju");
  const g = H.guards[0];
  const spots = [];
  for (let y = 46; y <= 58; y++) {
    for (let x = 16; x <= 32; x++) {
      if (H.walkableAt(x, y, 0, a)) spots.push([x, y]);
    }
  }
  const here = spots[0];
  const near = spots[1] || spots[0];
  const setup = () => {
    for (const o of H.guards) {
      o.unconscious = o !== g;
      o.path = [];
      o.talkT = 0;
      o.wait = 0;
    }
    if (here) { a.tx = here[0]; a.ty = here[1]; }
    if (near && g) { g.tx = near[0]; g.ty = near[1]; }
    a.alive = true;
    a.unconscious = false;
    a.path = [];
    if (g) {
      g.ai = "alert";
      g.path = [];
      g.lastSeen = { tx: a.tx, ty: a.ty };
      g.strikeT = 1.2;
    }
  };
  setup();

  const snap = H.snapshotSave();
  const recG = g && (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const midG = H.guards[0];
  const wiped = midG && midG.strikeT;

  H.applySave(snap);
  const afterG = H.guards.find((x) => x.id === (g && g.id));
  const afterA = H.agents.find((x) => x.id === "haeju");
  const after = { strikeT: afterG && afterG.strikeT, alive: afterA && afterA.alive };

  for (const o of H.guards) {
    if (o !== afterG) o.unconscious = true;
    o.path = [];
    o.talkT = 0;
    o.wait = 0;
  }
  if (afterG) { afterG.ai = "alert"; afterG.unconscious = false; }
  H.updateGuards(0.1);
  const ticked = {
    strikeT: afterG && afterG.strikeT,
    alive: afterA && afterA.alive
  };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldG = g && (old.guards || []).find((x) => x.id === g.id);
  if (oldG) delete oldG.strikeT;
  const aOld = H.agents.find((x) => x.id === "haeju");
  const gOld = H.guards.find((x) => x.id === (g && g.id));
  if (here && aOld) { aOld.tx = here[0]; aOld.ty = here[1]; aOld.alive = true; aOld.path = []; }
  if (near && gOld) {
    gOld.tx = near[0];
    gOld.ty = near[1];
    gOld.ai = "alert";
    gOld.path = [];
    gOld.lastSeen = { tx: aOld.tx, ty: aOld.ty };
  }
  for (const o of H.guards) {
    if (o !== gOld) o.unconscious = true;
    o.path = [];
    o.talkT = 0;
    o.wait = 0;
  }
  H.applySave(old);
  const oldAfterG = H.guards.find((x) => x.id === (g && g.id));
  const oldAfterA = H.agents.find((x) => x.id === "haeju");
  if (here && oldAfterA) { oldAfterA.tx = here[0]; oldAfterA.ty = here[1]; oldAfterA.alive = true; oldAfterA.path = []; }
  if (near && oldAfterG) {
    oldAfterG.tx = near[0];
    oldAfterG.ty = near[1];
    oldAfterG.ai = "alert";
    oldAfterG.path = [];
    oldAfterG.lastSeen = { tx: oldAfterA.tx, ty: oldAfterA.ty };
    oldAfterG.unconscious = false;
  }
  for (const o of H.guards) {
    if (o !== oldAfterG) o.unconscious = true;
    o.path = [];
    o.talkT = 0;
    o.wait = 0;
  }
  const oldBefore = { strikeT: oldAfterG && oldAfterG.strikeT, alive: oldAfterA && oldAfterA.alive };
  H.updateGuards(0.1);
  const oldTick = { strikeT: oldAfterG && oldAfterG.strikeT, alive: oldAfterA && oldAfterA.alive };

  H.rebuildWorld();
  const a2 = H.agents.find((x) => x.id === "haeju");
  const g2 = H.guards[0];
  if (here && a2) { a2.tx = here[0]; a2.ty = here[1]; }
  if (near && g2) { g2.tx = near[0]; g2.ty = near[1]; g2.ai = "alert"; g2.strikeT = 1.2; }
  H.writeSave(true);
  H.continueMission();
  const contG = H.guards.find((x) => x.id === (g2 && g2.id));
  const cont = contG && contG.strikeT;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at: { here, near, gid: g && g.id, type: g && g.type },
    snap: recG && recG.strikeT,
    wiped,
    after,
    ticked,
    oldBefore,
    oldTick,
    cont,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 붙잡기 대기가 남는다";
    box.appendChild(el);
  }
  const g = H.guards[0];
  return { strikeT: g && g.strikeT };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/strike-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) H.selectAgent("haeju");
  H.centerOnSelected();
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/strike-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snap !== 1.2) fail.push("snap " + info.snap);
if (info.wiped) fail.push("rebuild kept strikeT " + info.wiped);
if (info.after.strikeT !== 1.2) fail.push("after " + info.after.strikeT);
if (!info.after.alive) fail.push("after haeju down");
if (Math.abs(info.ticked.strikeT - 1.1) > 1e-12) fail.push("tick " + info.ticked.strikeT);
if (!info.ticked.alive) fail.push("tick downed haeju");
if (info.oldBefore.strikeT) fail.push("old strikeT should be 0, got " + info.oldBefore.strikeT);
if (info.oldTick.alive) fail.push("old tick should down haeju");
if (info.cont !== 1.2) fail.push("continue " + info.cont);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
