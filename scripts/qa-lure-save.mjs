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
  const g0 = H.guards.find((g) => !g.unconscious && g.type !== "sailor") || H.guards[0];
  wolsim.tx = g0.tx - 3;
  wolsim.ty = g0.ty;
  const dest = { tx: g0.tx + 4, ty: g0.ty };
  g0.ai = "lured";
  g0.lured = dest;
  g0.path = H.findPath(g0.tx, g0.ty, dest.tx, dest.ty, g0);
  g0.suspicion = Math.max(g0.suspicion, 0.25);
  const beforeAi = g0.ai;
  const beforePath = (g0.path || []).length;

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((g) => g.id === g0.id);

  H.rebuildWorld();
  const mid = H.guards.find((g) => g.id === g0.id);
  const wiped = { ai: mid && mid.ai, lured: mid && mid.lured, path: mid && (mid.path || []).length };
  H.applySave(snap);
  const after = H.guards.find((g) => g.id === g0.id);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((g) => g.id === g0.id);
  if (oldRec) {
    oldRec.ai = "lured";
    delete oldRec.lured;
  }
  H.applySave(old);
  const oldAfter = H.guards.find((g) => g.id === g0.id);

  H.rebuildWorld();
  const g1 = H.guards.find((g) => g.id === g0.id);
  g1.ai = "lured";
  g1.lured = dest;
  g1.path = H.findPath(g1.tx, g1.ty, dest.tx, dest.ty, g1);
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((g) => g.id === g0.id);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    guardId: g0.id,
    guardType: g0.type,
    dest,
    beforeAi,
    beforePath,
    snapAi: rec && rec.ai,
    snapLured: rec && rec.lured,
    wiped,
    afterAi: after && after.ai,
    afterLured: after && after.lured,
    afterPath: after && (after.path || []).length,
    oldAi: oldAfter && oldAfter.ai,
    oldLured: oldAfter && oldAfter.lured,
    oldPath: oldAfter && (oldAfter.path || []).length,
    contAi: cont && cont.ai,
    contLured: cont && cont.lured,
    contPath: cont && (cont.path || []).length,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.ai === "lured") || H.guards[0];
  const a = H.agents.find((x) => x.id === "wolsim");
  if (a && g) {
    a.tx = g.tx - 2;
    a.ty = g.ty;
  }
  H.selectAgent("wolsim");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.1;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 경비가 유인 목표로 간다";
    box.appendChild(el);
  }
  return {
    id: g && g.id,
    ai: g && g.ai,
    lured: g && g.lured,
    path: g && (g.path || []).length,
    at: g && [g.tx, g.ty]
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/lure-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.ai === "lured");
  if (g) { g.ai = "patrol"; g.lured = null; g.path = []; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/lure-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.beforeAi !== "lured") fail.push("before ai " + info.beforeAi);
if (info.snapAi !== "lured") fail.push("snap ai " + info.snapAi);
if (!info.snapLured) fail.push("snap no lured");
if (info.snapLured && (info.snapLured.tx !== info.dest.tx || info.snapLured.ty !== info.dest.ty)) {
  fail.push("snap dest " + JSON.stringify(info.snapLured));
}
if (info.wiped && info.wiped.ai === "lured") fail.push("rebuild kept lure");
if (info.afterAi !== "lured") fail.push("after ai " + info.afterAi);
if (!info.afterLured) fail.push("after no lured");
if (info.afterLured && (info.afterLured.tx !== info.dest.tx || info.afterLured.ty !== info.dest.ty)) {
  fail.push("after dest " + JSON.stringify(info.afterLured));
}
if (!(info.afterPath > 0)) fail.push("after path " + info.afterPath);
if (info.oldLured) fail.push("old field should be null");
if (info.contAi !== "lured") fail.push("continue ai " + info.contAi);
if (!info.contLured) fail.push("continue no lured");
if (!(info.contPath > 0)) fail.push("continue path " + info.contPath);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
