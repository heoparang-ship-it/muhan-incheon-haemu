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
  a.path = [];
  a.wait = 2.5;
  if (g) { g.path = []; g.wait = 3; }

  const snap = H.snapshotSave();
  const recA = (snap.agents || []).find((x) => x.id === "haeju");
  const recG = g && (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const midA = H.agents.find((x) => x.id === "haeju");
  const midG = H.guards[0];
  const wiped = { a: midA && midA.wait, g: midG && midG.wait };

  H.applySave(snap);
  const afterA = H.agents.find((x) => x.id === "haeju");
  const afterG = H.guards.find((x) => x.id === (g && g.id));
  const after = { a: afterA && afterA.wait, g: afterG && afterG.wait };

  H.moveUnit(afterA, 0.1);
  if (afterG) H.moveUnit(afterG, 0.1);
  const ticked = { a: afterA && afterA.wait, g: afterG && afterG.wait };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldA = (old.agents || []).find((x) => x.id === "haeju");
  const oldG = g && (old.guards || []).find((x) => x.id === g.id);
  if (oldA) delete oldA.wait;
  if (oldG) delete oldG.wait;
  H.applySave(old);
  const oldAfterA = H.agents.find((x) => x.id === "haeju");
  const oldAfterG = H.guards.find((x) => x.id === (g && g.id));
  const oldWait = { a: oldAfterA && oldAfterA.wait, g: oldAfterG && oldAfterG.wait };

  H.rebuildWorld();
  const a2 = H.agents.find((x) => x.id === "haeju");
  const g2 = H.guards[0];
  if (here) { a2.tx = here[0]; a2.ty = here[1]; }
  if (near && g2) { g2.tx = near[0]; g2.ty = near[1]; }
  a2.path = [];
  a2.wait = 2.5;
  if (g2) { g2.path = []; g2.wait = 3; }
  H.writeSave(true);
  H.continueMission();
  const contA = H.agents.find((x) => x.id === "haeju");
  const contG = H.guards.find((x) => x.id === (g2 && g2.id));
  const cont = { a: contA && contA.wait, g: contG && contG.wait };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at: { here, near, gid: g && g.id },
    snap: { a: recA && recA.wait, g: recG && recG.wait },
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
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 잠시 멈춘 시간이 남는다";
    box.appendChild(el);
  }
  return { a: a && a.wait, g: H.guards[0] && H.guards[0].wait };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/wait-save-after.png" });

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
await page.screenshot({ path: "/workspace/screenshots/wait-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snap.a !== 2.5) fail.push("snap a " + info.snap.a);
if (info.snap.g !== 3) fail.push("snap g " + info.snap.g);
if (info.wiped.a) fail.push("rebuild kept agent wait " + info.wiped.a);
if (info.wiped.g) fail.push("rebuild kept guard wait " + info.wiped.g);
if (info.after.a !== 2.5) fail.push("after a " + info.after.a);
if (info.after.g !== 3) fail.push("after g " + info.after.g);
if (Math.abs(info.ticked.a - 2.4) > 1e-12) fail.push("tick a " + info.ticked.a);
if (Math.abs(info.ticked.g - 2.9) > 1e-12) fail.push("tick g " + info.ticked.g);
if (info.oldWait.a) fail.push("old agent wait should be 0, got " + info.oldWait.a);
if (info.oldWait.g) fail.push("old guard wait should be 0, got " + info.oldWait.g);
if (info.cont.a !== 2.5) fail.push("continue a " + info.cont.a);
if (info.cont.g !== 3) fail.push("continue g " + info.cont.g);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
