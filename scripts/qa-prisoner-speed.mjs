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
  const p = H.civilians.find((x) => x.type === "prisoner");
  const spawnSpeed = p && p.speed;
  if (p) {
    p.freed = true;
    p.speed = 1.5;
  }
  const at = { id: p && p.id, tx: p && p.tx, ty: p && p.ty, spawnSpeed };

  const snap = H.snapshotSave();
  const rec = p && (snap.civilians || []).find((x) => x.id === p.id);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === (p && p.id));
  const wiped = { freed: mid && mid.freed, speed: mid && mid.speed };

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === (p && p.id));
  const afterV = { freed: after && after.freed, speed: after && after.speed };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = p && (old.civilians || []).find((x) => x.id === p.id);
  if (oldRec) {
    oldRec.freed = true;
    delete oldRec.speed;
  }
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === (p && p.id));
  const oldV = { freed: oldAfter && oldAfter.freed, speed: oldAfter && oldAfter.speed };

  H.rebuildWorld();
  const p2 = H.civilians.find((x) => x.id === (p && p.id));
  if (p2) { p2.freed = true; p2.speed = 1.5; }
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === (p && p.id));
  const contV = { freed: cont && cont.freed, speed: cont && cont.speed };

  const phases = [0, 0.5, 1].map((ph) => {
    H.state.tidePhase = ph;
    const e = ph < 0.5 ? 2 * ph * ph : 1 - Math.pow(-2 * ph + 2, 2) / 2;
    return { p: ph, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at,
    snap: rec && { freed: rec.freed, speed: rec.speed },
    wiped,
    afterV,
    oldV,
    contV,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases,
    haeju: a && { tx: a.tx, ty: a.ty }
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const p = H.civilians.find((x) => x.type === "prisoner");
  const a = H.agents.find((x) => x.id === "haeju");
  if (p && a) {
    a.tx = p.tx;
    a.ty = p.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 풀린 주민의 걸음이 남는다";
    box.appendChild(el);
  }
  return { speed: p && p.speed, freed: p && p.freed };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/prisoner-speed-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const p = H.civilians.find((x) => x.type === "prisoner");
  const a = H.agents.find((x) => x.id === "haeju");
  if (p && a) {
    a.tx = p.tx;
    a.ty = p.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/prisoner-speed-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.at.spawnSpeed !== 1.6) fail.push("spawn speed " + info.at.spawnSpeed);
if (!info.snap || info.snap.speed !== 1.5 || !info.snap.freed) fail.push("snap " + JSON.stringify(info.snap));
if (info.wiped.speed !== 1.6) fail.push("rebuild speed " + info.wiped.speed);
if (info.wiped.freed) fail.push("rebuild kept freed");
if (info.afterV.speed !== 1.5) fail.push("after speed " + info.afterV.speed);
if (!info.afterV.freed) fail.push("after not freed");
if (info.oldV.speed !== 1.6) fail.push("old speed should be 1.6, got " + info.oldV.speed);
if (info.contV.speed !== 1.5) fail.push("continue speed " + info.contV.speed);
if (!info.contV.freed) fail.push("continue not freed");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
