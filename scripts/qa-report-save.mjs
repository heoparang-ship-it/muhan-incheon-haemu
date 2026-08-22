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
  const runner = H.guards.find((g) => g.type === "acolyte" && !g.unconscious) || H.guards[0];
  const boss = H.guards.find((g) => g.id !== runner.id && !g.unconscious && H.GUARD_TYPES[g.type].alarm !== "report")
    || H.guards.find((g) => g.id !== runner.id);
  runner.ai = "report";
  runner.reportTo = boss;
  runner.lastSeen = { tx: runner.tx, ty: runner.ty };
  runner.path = H.findPath(runner.tx, runner.ty, boss.tx, boss.ty, runner);
  const beforePath = (runner.path || []).length;

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((g) => g.id === runner.id);

  H.rebuildWorld();
  const mid = H.guards.find((g) => g.id === runner.id);
  const wiped = { ai: mid && mid.ai, reportTo: mid && mid.reportTo && mid.reportTo.id };
  H.applySave(snap);
  const after = H.guards.find((g) => g.id === runner.id);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((g) => g.id === runner.id);
  if (oldRec) {
    oldRec.ai = "report";
    delete oldRec.reportTo;
  }
  H.applySave(old);
  const oldAfter = H.guards.find((g) => g.id === runner.id);

  H.rebuildWorld();
  const r2 = H.guards.find((g) => g.id === runner.id);
  const b2 = H.guards.find((g) => g.id === boss.id);
  r2.ai = "report";
  r2.reportTo = b2;
  r2.path = H.findPath(r2.tx, r2.ty, b2.tx, b2.ty, r2);
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((g) => g.id === runner.id);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    runnerId: runner.id,
    runnerType: runner.type,
    bossId: boss.id,
    bossType: boss.type,
    beforePath,
    snapAi: rec && rec.ai,
    snapReportTo: rec && rec.reportTo,
    wiped,
    afterAi: after && after.ai,
    afterReportTo: after && after.reportTo && after.reportTo.id,
    afterPath: after && (after.path || []).length,
    oldAi: oldAfter && oldAfter.ai,
    oldReportTo: oldAfter && oldAfter.reportTo && oldAfter.reportTo.id,
    oldPath: oldAfter && (oldAfter.path || []).length,
    contAi: cont && cont.ai,
    contReportTo: cont && cont.reportTo && cont.reportTo.id,
    contPath: cont && (cont.path || []).length,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.ai === "report") || H.guards[0];
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
    el.textContent = "불러온 뒤에도 신도가 상급자에게 보고하러 간다";
    box.appendChild(el);
  }
  return {
    id: g && g.id,
    ai: g && g.ai,
    reportTo: g && g.reportTo && g.reportTo.id,
    path: g && (g.path || []).length
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/report-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.ai === "report");
  if (g) { g.ai = "patrol"; g.reportTo = null; g.path = []; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/report-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapAi !== "report") fail.push("snap ai " + info.snapAi);
if (info.snapReportTo !== info.bossId) fail.push("snap reportTo " + info.snapReportTo);
if (info.wiped && info.wiped.ai === "report") fail.push("rebuild kept report");
if (info.afterAi !== "report") fail.push("after ai " + info.afterAi);
if (info.afterReportTo !== info.bossId) fail.push("after reportTo " + info.afterReportTo);
if (!(info.afterPath > 0)) fail.push("after path " + info.afterPath);
if (info.oldReportTo) fail.push("old reportTo should be empty");
if (info.contAi !== "report") fail.push("continue ai " + info.contAi);
if (info.contReportTo !== info.bossId) fail.push("continue reportTo " + info.contReportTo);
if (!(info.contPath > 0)) fail.push("continue path " + info.contPath);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
