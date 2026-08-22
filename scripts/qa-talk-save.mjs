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
  if (here) { a.tx = here[0]; a.ty = here[1]; }
  if (near && g) { g.tx = near[0]; g.ty = near[1]; }
  if (g) { g.path = []; g.talkT = 2.5; }

  const fovOf = (unit) => {
    if (!unit) return null;
    const t = H.GUARD_TYPES[unit.type];
    return unit.talkT > 0 ? t.fov * 0.55 : t.fov;
  };

  const snap = H.snapshotSave();
  const recG = g && (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const midG = H.guards[0];
  const wiped = { talkT: midG && midG.talkT, fov: fovOf(midG) };

  H.applySave(snap);
  const afterG = H.guards.find((x) => x.id === (g && g.id));
  const after = { talkT: afterG && afterG.talkT, fov: fovOf(afterG) };

  for (const ag of H.agents) ag.alive = false;
  H.updateGuards(0.1);
  const ticked = { talkT: afterG && afterG.talkT, fov: fovOf(afterG) };
  for (const ag of H.agents) ag.alive = true;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldG = g && (old.guards || []).find((x) => x.id === g.id);
  if (oldG) delete oldG.talkT;
  H.applySave(old);
  const oldAfterG = H.guards.find((x) => x.id === (g && g.id));
  const oldWait = { talkT: oldAfterG && oldAfterG.talkT, fov: fovOf(oldAfterG) };

  H.rebuildWorld();
  const g2 = H.guards[0];
  const a2 = H.agents.find((x) => x.id === "haeju");
  if (here && a2) { a2.tx = here[0]; a2.ty = here[1]; }
  if (near && g2) { g2.tx = near[0]; g2.ty = near[1]; g2.path = []; g2.talkT = 2.5; }
  H.writeSave(true);
  H.continueMission();
  const contG = H.guards.find((x) => x.id === (g2 && g2.id));
  const cont = { talkT: contG && contG.talkT, fov: fovOf(contG) };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at: { here, near, gid: g && g.id, type: g && g.type, baseFov: g && H.GUARD_TYPES[g.type].fov },
    snap: recG && recG.talkT,
    wiped,
    after,
    ticked,
    oldWait,
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
    el.textContent = "불러온 뒤에도 대화 멈춤이 남는다";
    box.appendChild(el);
  }
  const g = H.guards[0];
  return { talkT: g && g.talkT };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/talk-save-after.png" });

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
await page.screenshot({ path: "/workspace/screenshots/talk-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snap !== 2.5) fail.push("snap " + info.snap);
if (info.wiped.talkT) fail.push("rebuild kept talkT " + info.wiped.talkT);
if (info.after.talkT !== 2.5) fail.push("after " + info.after.talkT);
const expectFov = info.at.baseFov * 0.55;
if (Math.abs(info.after.fov - expectFov) > 1e-12) fail.push("after fov " + info.after.fov);
if (Math.abs(info.ticked.talkT - 2.4) > 1e-12) fail.push("tick " + info.ticked.talkT);
if (info.oldWait.talkT) fail.push("old talkT should be 0, got " + info.oldWait.talkT);
if (Math.abs(info.oldWait.fov - info.at.baseFov) > 1e-12) fail.push("old fov " + info.oldWait.fov);
if (info.cont.talkT !== 2.5) fail.push("continue " + info.cont.talkT);
if (Math.abs(info.cont.fov - expectFov) > 1e-12) fail.push("continue fov " + info.cont.fov);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
