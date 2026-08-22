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
  const g0 = H.guards.find((g) => !g.unconscious && !g.boss) || H.guards[0];
  const g1 = H.guards.find((g) => g.id !== g0.id && !g.boss) || H.guards[1];
  const now0 = H.state.now;
  const ms = H.wakeMs();
  g0.unconscious = true;
  g0.ai = "down";
  g0.path = [];
  g0.tied = false;
  g0.wakeAt = now0 + ms;
  g1.unconscious = true;
  g1.tied = true;
  g1.ai = "down";
  g1.path = [];
  g1.wakeAt = 1e15;

  const snap = H.snapshotSave();
  const rec0 = (snap.guards || []).find((g) => g.id === g0.id);
  const rec1 = (snap.guards || []).find((g) => g.id === g1.id);

  H.rebuildWorld();
  const mid = H.guards.find((g) => g.id === g0.id);
  const wiped = { unconscious: mid && mid.unconscious, wakeAt: mid && mid.wakeAt };
  H.applySave(snap);
  const after0 = H.guards.find((g) => g.id === g0.id);
  const after1 = H.guards.find((g) => g.id === g1.id);
  const clock = performance.now();
  const rem = Math.max(0, (after0.wakeAt || 0) - clock);
  H.state.now = clock;
  H.updateWakes();
  const stillDown = after0.unconscious === true;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((g) => g.id === g0.id);
  if (oldRec) {
    oldRec.unconscious = true;
    delete oldRec.wakeAt;
  }
  H.applySave(old);
  const oldAfter = H.guards.find((g) => g.id === g0.id);

  H.rebuildWorld();
  const g2 = H.guards.find((g) => g.id === g0.id);
  g2.unconscious = true;
  g2.ai = "down";
  g2.tied = false;
  g2.wakeAt = H.state.now + ms;
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((g) => g.id === g0.id);
  const contRem = Math.max(0, (cont.wakeAt || 0) - performance.now());

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
    tiedId: g1.id,
    ms,
    snapWake: rec0 && rec0.wakeAt,
    snapTied: rec1 && rec1.wakeAt,
    wiped,
    afterUncon: after0 && after0.unconscious,
    rem,
    stillDown,
    afterTied: after1 && after1.wakeAt,
    afterTiedFlag: after1 && after1.tied,
    oldWake: oldAfter && (oldAfter.wakeAt || 0),
    contUncon: cont && cont.unconscious,
    contRem,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.unconscious) || H.guards[0];
  const a = H.agents.find((x) => x.id === "mujin");
  if (a && g) { a.tx = g.tx; a.ty = g.ty; }
  H.selectAgent("mujin");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.1;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 기절한 경비가 바로 깨지 않는다";
    box.appendChild(el);
  }
  return {
    id: g && g.id,
    unconscious: g && g.unconscious,
    rem: g ? Math.max(0, (g.wakeAt || 0) - performance.now()) : 0
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/wake-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const g of H.guards) {
    if (!g.unconscious) continue;
    g.unconscious = false;
    g.wakeAt = 0;
    g.tied = false;
    g.ai = "patrol";
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/wake-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.ms !== 75000) fail.push("wakeMs " + info.ms);
if (Math.abs(info.snapWake - info.ms) > 1) fail.push("snapWake " + info.snapWake);
if (!(info.snapTied > 1e14)) fail.push("snapTied " + info.snapTied);
if (info.wiped.unconscious) fail.push("rebuild still down");
if (!info.afterUncon) fail.push("after not down");
if (!(info.rem > info.ms - 1000 && info.rem <= info.ms)) fail.push("rem " + info.rem);
if (!info.stillDown) fail.push("woke immediately");
if (!(info.afterTied > 1e14)) fail.push("afterTied " + info.afterTied);
if (!info.afterTiedFlag) fail.push("tied flag lost");
if (info.oldWake > 50) fail.push("old wake " + info.oldWake);
if (!info.contUncon) fail.push("continue not down");
if (!(info.contRem > info.ms - 1000 && info.contRem <= info.ms)) fail.push("contRem " + info.contRem);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
