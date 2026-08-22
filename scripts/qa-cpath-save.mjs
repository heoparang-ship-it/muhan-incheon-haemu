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
  const c0 = H.civilians.find((c) => c.type === "villager" && c.speed > 0);
  const cid = c0.id;
  const dest = [c0.home[0] + 6, c0.home[1]];
  c0.path = H.findPath(c0.tx, c0.ty, dest[0], dest[1], c0);
  const n = c0.path.length;
  const last = n ? { tx: c0.path[n - 1].tx, ty: c0.path[n - 1].ty } : null;

  const haeju = H.agents.find((a) => a.id === "haeju");
  haeju.path = H.findPath(haeju.tx, haeju.ty, haeju.tx + 4, haeju.ty, haeju);
  const g0 = H.guards[0];
  g0.path = H.findPath(g0.tx, g0.ty, g0.tx + 4, g0.ty, g0);

  const snap = H.snapshotSave();
  const rec = (snap.civilians || []).find((x) => x.id === cid);
  const snapN = rec && rec.path ? rec.path.length : 0;
  const snapLast = snapN ? rec.path[snapN - 1] : null;
  const snapAgent = (snap.agents || []).find((x) => x.id === "haeju");
  const snapGuard = (snap.guards || []).find((x) => x.id === g0.id);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === cid);
  const wiped = mid && mid.path ? mid.path.length : -1;

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === cid);
  const afterN = after && after.path ? after.path.length : 0;
  const afterLast = afterN ? { tx: after.path[afterN - 1].tx, ty: after.path[afterN - 1].ty } : null;
  const afterAgentN = (H.agents.find((a) => a.id === "haeju").path || []).length;
  const afterGuardN = (H.guards.find((g) => g.id === g0.id).path || []).length;
  const fromX = after.tx, fromY = after.ty;
  H.moveUnit(after, 0.45);
  const tickedN = after.path ? after.path.length : 0;
  const moved = Math.hypot(after.tx - fromX, after.ty - fromY);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.civilians || []).find((x) => x.id === cid);
  if (oldRec) delete oldRec.path;
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === cid);
  const oldN = oldAfter && oldAfter.path ? oldAfter.path.length : -1;

  H.rebuildWorld();
  const c2 = H.civilians.find((x) => x.id === cid);
  c2.path = H.findPath(c2.tx, c2.ty, dest[0], dest[1], c2);
  const contN0 = c2.path.length;
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === cid);
  const contN = cont && cont.path ? cont.path.length : 0;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    cid, dest, n, last, snapN, snapLast,
    snapAgentPath: snapAgent && snapAgent.path,
    snapGuardPath: snapGuard && snapGuard.path,
    wiped, afterN, afterLast, afterAgentN, afterGuardN, tickedN, moved, oldN, contN0, contN,
    hasCopy: typeof H.copyCivilPath === "function",
    hasMove: typeof H.moveUnit === "function",
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const c = H.civilians.find((x) => x.type === "villager" && x.speed > 0);
  if (c && (!c.path || !c.path.length)) {
    c.path = H.findPath(c.tx, c.ty, c.home[0] + 6, c.home[1], c);
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  if (c) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(c.tx + 0.5, c.ty + 0.5);
    H.cam.y = isoY(c.tx + 0.5, c.ty + 0.5);
  }
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 주민이 걷던 길이 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/cpath-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const c = H.civilians.find((x) => x.type === "villager" && x.speed > 0);
  if (c) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(c.tx + 0.5, c.ty + 0.5);
    H.cam.y = isoY(c.tx + 0.5, c.ty + 0.5);
    H.cam.targetZoom = H.cam.zoom = 1.15;
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/cpath-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasCopy || !info.hasMove) fail.push("export");
if (!(info.n > 0)) fail.push("setPath n=" + info.n);
if (info.snapN !== info.n) fail.push("snap " + info.snapN);
if (info.snapAgentPath != null) fail.push("agent path leaked");
if (info.snapGuardPath != null) fail.push("guard path leaked");
if (info.wiped !== 0) fail.push("wiped " + info.wiped);
if (info.afterN !== info.n) fail.push("after " + info.afterN);
if (info.afterAgentN !== 0) fail.push("agent after " + info.afterAgentN);
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
