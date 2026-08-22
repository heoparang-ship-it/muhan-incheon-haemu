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
  v.angle = 2.4;
  v.tx = 86;
  v.ty = 84;
  const n0 = H.guards.filter((g) => g.id === "vale").length;

  const snap = H.snapshotSave();
  const snapVale = snap.vale;
  const snapGuard = (snap.guards || []).find((x) => x.id === "vale");

  H.rebuildWorld();
  const wiped = !!H.vale;
  const wipedN = H.guards.filter((g) => g.id === "vale").length;
  const wipedFire = (H.state.fires || []).some((f) => f.tx === 87 && f.ty === 82);

  H.applySave(snap);
  const afterN = H.guards.filter((g) => g.id === "vale").length;
  const after = H.vale;
  const afterFire = (H.state.fires || []).some((f) => f.tx === 87 && f.ty === 82);
  const afterPathN = after && after.path ? after.path.length : -1;

  H.rebuildWorld();
  const old = H.snapshotSave();
  old.valeSpawned = true;
  old.vale = { tx: 86, ty: 84, caught: false, hidden: false };
  old.guards = (old.guards || []).filter((x) => x.id !== "vale");
  H.applySave(old);
  const fallN = H.guards.filter((g) => g.id === "vale").length;
  const fall = H.vale;

  H.rebuildWorld();
  H.spawnVale();
  H.vale.angle = 2.4;
  H.vale.tx = 86;
  H.vale.ty = 84;
  H.writeSave(true);
  H.continueMission();
  const contN = H.guards.filter((g) => g.id === "vale").length;
  const cont = H.vale;
  const contFire = (H.state.fires || []).some((f) => f.tx === 87 && f.ty === 82);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    n0,
    snapVale,
    snapGuardPath: snapGuard && snapGuard.path,
    wiped,
    wipedN,
    wipedFire,
    afterN,
    after: after && { id: after.id, tx: after.tx, ty: after.ty, angle: after.angle, speed: after.speed, ai: after.ai, boss: !!after.boss },
    afterFire,
    afterPathN,
    fallN,
    fall: fall && { tx: fall.tx, ty: fall.ty },
    contN,
    cont: cont && { tx: cont.tx, ty: cont.ty, speed: cont.speed, angle: cont.angle },
    contFire,
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const v = H.vale;
  const a = H.agents.find((x) => x.id === "haeju");
  if (v && a) {
    a.tx = v.tx;
    a.ty = v.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 베일이 한 명이다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/vale-once-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) {
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/vale-once-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.n0 !== 1) fail.push("spawn n " + info.n0);
if (info.wiped || info.wipedN !== 0 || info.wipedFire) fail.push("rebuild " + JSON.stringify({ v: info.wiped, n: info.wipedN, f: info.wipedFire }));
if (info.afterN !== 1) fail.push("after n " + info.afterN);
if (!info.after || info.after.tx !== 86 || info.after.ty !== 84) fail.push("after pos " + JSON.stringify(info.after));
if (!info.after || Math.abs(info.after.angle - 2.4) > 1e-9) fail.push("after angle " + (info.after && info.after.angle));
if (!info.after || info.after.speed !== 1.75 || info.after.ai !== "flee") fail.push("after flee " + JSON.stringify(info.after));
if (info.afterPathN !== 0) fail.push("path " + info.afterPathN);
if (info.snapGuardPath != null) fail.push("path leaked");
if (!info.afterFire) fail.push("after fire");
if (info.fallN !== 1 || !info.fall || info.fall.tx !== 86) fail.push("fallback " + JSON.stringify(info.fall));
if (info.contN !== 1) fail.push("continue n " + info.contN);
if (!info.cont || info.cont.tx !== 86 || info.cont.speed !== 1.75) fail.push("continue " + JSON.stringify(info.cont));
if (!info.contFire) fail.push("continue fire");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
