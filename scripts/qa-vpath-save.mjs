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
  H.spawnVale();
  const v = H.vale;
  const boat = H.interactables.find((x) => x.id === "escapeBoat");
  v.path = H.findPath(v.tx, v.ty, boat.tx - 1, boat.ty - 1, v);
  const n = v.path.length;
  const last = n ? { tx: v.path[n - 1].tx, ty: v.path[n - 1].ty } : null;

  const g0 = H.guards.find((g) => g.id !== "vale");
  if (g0) g0.path = H.findPath(g0.tx, g0.ty, g0.tx + 4, g0.ty, g0);

  const snap = H.snapshotSave();
  const rec = snap.vale;
  const snapN = rec && rec.path ? rec.path.length : 0;
  const snapLast = snapN ? rec.path[snapN - 1] : null;
  const snapGuard = (snap.guards || []).find((x) => g0 && x.id === g0.id);

  H.rebuildWorld();
  const wiped = H.vale;

  H.applySave(snap);
  const after = H.vale;
  const afterN = after && after.path ? after.path.length : 0;
  const afterLast = afterN ? { tx: after.path[afterN - 1].tx, ty: after.path[afterN - 1].ty } : null;
  const afterGuardN = g0 ? ((H.guards.find((g) => g.id === g0.id) || {}).path || []).length : 0;
  const fromX = after.tx, fromY = after.ty;
  H.moveUnit(after, 0.4);
  const tickedN = after.path ? after.path.length : 0;
  const moved = Math.hypot(after.tx - fromX, after.ty - fromY);

  H.rebuildWorld();
  H.spawnVale();
  const old = H.snapshotSave();
  if (old.vale) delete old.vale.path;
  H.applySave(old);
  const oldN = H.vale && H.vale.path ? H.vale.path.length : -1;

  H.rebuildWorld();
  H.spawnVale();
  const v2 = H.vale;
  v2.path = H.findPath(v2.tx, v2.ty, boat.tx - 1, boat.ty - 1, v2);
  const contN0 = v2.path.length;
  H.writeSave(true);
  H.continueMission();
  const contN = H.vale && H.vale.path ? H.vale.path.length : 0;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    n, last, snapN, snapLast,
    snapGuardPath: snapGuard && snapGuard.path,
    wiped: !!wiped,
    afterN, afterLast, afterGuardN, tickedN, moved, oldN, contN0, contN,
    hasCopy: typeof H.copyValePath === "function",
    hasMove: typeof H.moveUnit === "function",
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  if (!H.vale) H.spawnVale();
  const v = H.vale;
  const boat = H.interactables.find((x) => x.id === "escapeBoat");
  if (v && (!v.path || !v.path.length) && boat) {
    v.path = H.findPath(v.tx, v.ty, boat.tx - 1, boat.ty - 1, v);
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  if (v) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(v.tx + 0.5, v.ty + 0.5);
    H.cam.y = isoY(v.tx + 0.5, v.ty + 0.5);
  }
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 베일이 도망치던 길이 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/vpath-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/vpath-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasCopy || !info.hasMove) fail.push("export");
if (!(info.n > 0)) fail.push("setPath n=" + info.n);
if (info.snapN !== info.n) fail.push("snap " + info.snapN);
if (info.snapGuardPath != null) fail.push("guard path leaked");
if (info.wiped) fail.push("rebuild still has vale");
if (info.afterN !== info.n) fail.push("after " + info.afterN);
if (info.afterGuardN !== 0) fail.push("guard after " + info.afterGuardN);
if (!info.afterLast || !info.last || info.afterLast.tx !== info.last.tx || info.afterLast.ty !== info.last.ty) {
  fail.push("last " + JSON.stringify(info.afterLast));
}
if (!(info.tickedN < info.afterN || info.moved > 0)) fail.push("tick n=" + info.tickedN + " moved=" + info.moved);
if (info.oldN !== 0) fail.push("old " + info.oldN);
if (info.contN !== info.contN0) fail.push("continue " + info.contN);
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
