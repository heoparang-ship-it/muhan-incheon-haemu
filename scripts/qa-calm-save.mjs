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
  const c0 = H.civilians.find((c) => c.type !== "prisoner" && !c.rescued && !c.dead) || H.civilians[0];
  const now0 = H.state.now;
  const before = c0.calm || 0;
  c0.panic = 0;
  c0.calm = now0 + 30000;

  const snap = H.snapshotSave();
  const rec = (snap.civilians || []).find((c) => c.id === c0.id);

  H.rebuildWorld();
  const mid = H.civilians.find((c) => c.id === c0.id);
  const wiped = mid && (mid.calm || 0);
  H.applySave(snap);
  const after = H.civilians.find((c) => c.id === c0.id);
  const rem = Math.max(0, (after.calm || 0) - performance.now());
  const shielded = after.calm > performance.now();

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.civilians || []).find((c) => c.id === c0.id);
  if (oldRec) delete oldRec.calm;
  H.applySave(old);
  const oldAfter = H.civilians.find((c) => c.id === c0.id);
  const oldRem = Math.max(0, (oldAfter.calm || 0) - performance.now());

  H.rebuildWorld();
  const c1 = H.civilians.find((c) => c.id === c0.id);
  c1.panic = 0;
  c1.calm = H.state.now + 30000;
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((c) => c.id === c0.id);
  const contRem = Math.max(0, (cont.calm || 0) - performance.now());

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    civId: c0.id,
    civType: c0.type,
    before,
    snapCalm: rec && rec.calm,
    wiped,
    rem,
    shielded,
    oldRem,
    contRem,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const c = H.civilians.find((x) => (x.calm || 0) > performance.now())
    || H.civilians.find((x) => x.type !== "prisoner")
    || H.civilians[0];
  const a = H.agents.find((x) => x.id === "wolsim");
  if (a && c) { a.tx = c.tx; a.ty = c.ty; }
  H.selectAgent("wolsim");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.1;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 달랜 주민이 진정 상태다";
    box.appendChild(el);
  }
  return {
    id: c && c.id,
    rem: c ? Math.max(0, (c.calm || 0) - performance.now()) : 0
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/calm-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const c of H.civilians) c.calm = 0;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/calm-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.before) fail.push("already calm " + info.before);
if (Math.abs(info.snapCalm - 30000) > 1) fail.push("snapCalm " + info.snapCalm);
if (info.wiped > 50) fail.push("rebuild kept calm " + info.wiped);
if (!(info.rem > 29000 && info.rem <= 30000)) fail.push("rem " + info.rem);
if (!info.shielded) fail.push("not shielded");
if (info.oldRem > 50) fail.push("old rem " + info.oldRem);
if (!(info.contRem > 29000 && info.contRem <= 30000)) fail.push("contRem " + info.contRem);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
