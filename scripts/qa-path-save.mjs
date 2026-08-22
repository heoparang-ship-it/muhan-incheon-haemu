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
  a.tx = 16; a.ty = 46; a.queue = []; a.action = null; a.path = [];
  const ok = H.setPath(a, 29, 46);
  const n = a.path.length;
  const last = n ? { tx: a.path[n - 1].tx, ty: a.path[n - 1].ty, lv: a.path[n - 1].lv } : null;

  const snap = H.snapshotSave();
  const rec = (snap.agents || []).find((x) => x.id === "haeju");
  const snapN = rec && rec.path ? rec.path.length : 0;
  const snapLast = snapN ? rec.path[snapN - 1] : null;

  H.rebuildWorld();
  const mid = H.agents.find((x) => x.id === "haeju");
  const wiped = mid.path ? mid.path.length : -1;

  H.applySave(snap);
  const after = H.agents.find((x) => x.id === "haeju");
  const afterN = after.path ? after.path.length : 0;
  const afterLast = afterN ? { tx: after.path[afterN - 1].tx, ty: after.path[afterN - 1].ty } : null;
  H.moveUnit(after, 0.35);
  const tickedN = after.path ? after.path.length : 0;
  const moved = Math.hypot(after.tx - 16, after.ty - 46);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.agents || []).find((x) => x.id === "haeju");
  if (oldRec) delete oldRec.path;
  H.applySave(old);
  const oldAfter = H.agents.find((x) => x.id === "haeju");
  const oldN = oldAfter.path ? oldAfter.path.length : -1;

  H.rebuildWorld();
  const a2 = H.agents.find((x) => x.id === "haeju");
  a2.tx = 16; a2.ty = 46; a2.queue = []; a2.action = null; a2.path = [];
  H.setPath(a2, 29, 46);
  const contN0 = a2.path.length;
  H.writeSave(true);
  H.continueMission();
  const cont = H.agents.find((x) => x.id === "haeju");
  const contN = cont.path ? cont.path.length : 0;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    ok, n, last, snapN, snapLast, wiped, afterN, afterLast, tickedN, moved, oldN, contN0, contN,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  a.tx = 16; a.ty = 46; a.queue = []; a.action = null; a.path = [];
  H.setPath(a, 29, 46);
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 걷던 길이 남는다";
    box.appendChild(el);
  }
  return { n: a.path.length };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/path-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  a.tx = 16; a.ty = 46;
  H.selectAgent("haeju");
  H.centerOnSelected();
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/path-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.ok || info.n < 1) fail.push("setPath n=" + info.n);
if (info.snapN !== info.n) fail.push("snap " + info.snapN);
if (info.wiped !== 0) fail.push("wiped " + info.wiped);
if (info.afterN !== info.n) fail.push("after " + info.afterN);
if (!info.afterLast || info.afterLast.tx !== 29 || info.afterLast.ty !== 46) fail.push("last " + JSON.stringify(info.afterLast));
if (!(info.tickedN < info.afterN || info.moved > 0)) fail.push("tick n=" + info.tickedN + " moved=" + info.moved);
if (info.oldN !== 0) fail.push("old " + info.oldN);
if (info.contN !== info.contN0) fail.push("continue " + info.contN);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
