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
  const opens = [];
  for (let y = 60; y <= 76; y++) {
    for (let x = 14; x <= 36; x++) {
      if (H.walkableAt(x, y, 0, wolsim)) opens.push([x, y]);
    }
  }

  let through = null;
  for (const [ax, ay] of opens) {
    for (const [bx, by] of opens) {
      if (ay !== by) continue;
      const d = Math.abs(bx - ax);
      if (d < 9 || d > 11) continue;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (!H.hasSight(ax, ay, bx, by)) continue;
      if (Math.hypot(mx - ax, my - ay) <= 3.6) continue;
      if (Math.hypot(mx - bx, my - by) <= 3.6) continue;
      through = { ax, ay, bx, by, mx, my, d };
      break;
    }
    if (through) break;
  }

  let close = null;
  for (const [ax, ay] of opens) {
    for (const [bx, by] of opens) {
      if (ay !== by) continue;
      const d = Math.abs(bx - ax);
      if (d < 2.2 || d > 3.0) continue;
      if (!H.hasSight(ax, ay, bx, by)) continue;
      close = { ax, ay, bx, by, d };
      break;
    }
    if (close) break;
  }

  const clearSmoke = () => { H.state.smoke = []; };
  const addSmoke = (tx, ty, r, life) => {
    H.state.smoke.push({ tx, ty, r: r == null ? 3.6 : r, life: life == null ? 14 : life, max: 14 });
  };

  const throughClear = through ? H.hasSight(through.ax, through.ay, through.bx, through.by) : false;
  if (through) addSmoke(through.mx, through.my, 3.6, 14);
  const throughBlocked = through ? !H.hasSight(through.ax, through.ay, through.bx, through.by) : false;
  const throughMidBlocks = through ? H.smokeBlocks(through.mx, through.my) : false;
  const throughEndClear = through
    ? !H.smokeBlocks(through.ax, through.ay) && !H.smokeBlocks(through.bx, through.by)
    : false;
  clearSmoke();
  const throughRestored = through ? H.hasSight(through.ax, through.ay, through.bx, through.by) : false;

  const sideClear = through ? H.hasSight(through.ax, through.ay, through.bx, through.by) : false;
  if (through) addSmoke(through.mx, through.my + 8, 3.6, 14);
  const sideStill = through ? H.hasSight(through.ax, through.ay, through.bx, through.by) : false;
  clearSmoke();

  const g = H.guards.find((u) => !u.unconscious) || H.guards[0];
  const a = wolsim;
  a.incenseUntil = 0;
  a.disguise = 0;
  a.crouch = false;
  a.alive = true;
  a.moveT = 1;
  a.carrying = null;
  if (close && g) {
    g.tx = close.ax; g.ty = close.ay; g.level = 0;
    g.unconscious = false; g.hidden = false; g.netted = 0;
    g.ai = "patrol"; g.talkT = 0; g.tied = false;
    a.tx = close.bx; a.ty = close.by; a.level = 0;
    g.angle = Math.atan2(a.ty - g.ty, a.tx - g.tx);
  }
  const seeClear = g && a ? H.guardSees(g, a, 0.016) : 0;
  const sightClear = g && a ? H.hasSight(g.tx, g.ty, a.tx, a.ty, 1.6, 0.85, g.level, a.level) : false;
  if (a) addSmoke(a.tx, a.ty, 3.6, 14);
  const seeSmoke = g && a ? H.guardSees(g, a, 0.016) : 1;
  const sightSmoke = g && a ? H.hasSight(g.tx, g.ty, a.tx, a.ty, 1.6, 0.85, g.level, a.level) : true;
  const targetInSmoke = a ? H.smokeBlocks(a.tx, a.ty) : false;
  clearSmoke();

  H.selectAgent("wolsim");
  if (close) { a.tx = close.bx; a.ty = close.by; }
  H.useSecond(a);
  const used = {
    n: H.state.smoke.length,
    r: H.state.smoke[0] && H.state.smoke[0].r,
    life: H.state.smoke[0] && H.state.smoke[0].life,
    at: H.state.smoke[0] && [H.state.smoke[0].tx, H.state.smoke[0].ty]
  };
  a.incenseUntil = 0;
  const seeUsed = g && a ? H.guardSees(g, a, 0.016) : 1;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    openN: opens.length,
    through,
    throughClear,
    throughBlocked,
    throughMidBlocks,
    throughEndClear,
    throughRestored,
    sideClear,
    sideStill,
    close,
    seeClear,
    sightClear,
    seeSmoke,
    sightSmoke,
    targetInSmoke,
    used,
    seeUsed,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases,
    guardType: g && g.type
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.state.smoke = [];
  const a = H.agents.find((x) => x.id === "wolsim");
  a.tx = 25; a.ty = 66; a.level = 0; a.incenseUntil = 0; a.path = [];
  H.agents.filter((x) => x.id !== "wolsim").forEach((o, i) => {
    o.tx = 28 + i * 0.4; o.ty = 70; o.path = [];
  });
  const g = H.guards.find((u) => u.type === "soldier" && !u.unconscious) || H.guards[0];
  g.tx = 22; g.ty = 66; g.level = 0; g.angle = 0;
  g.unconscious = false; g.hidden = false; g.netted = 0;
  g.ai = "patrol"; g.path = []; g.coneT = 0;
  H.selectAgent("wolsim");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.2;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  return {
    wolsim: [a.tx, a.ty],
    guard: [g.tx, g.ty, g.type],
    sight: H.hasSight(g.tx, g.ty, a.tx, a.ty, 1.6, 0.85, g.level, a.level),
    see: H.guardSees(g, a, 0.016)
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/smoke-los-clear.png" });

const afterCam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents.find((x) => x.id === "wolsim");
  const g = H.guards.find((u) => Math.round(u.tx) === 22 && Math.round(u.ty) === 66) || H.guards[0];
  H.state.smoke = [{ tx: a.tx, ty: a.ty, r: 3.6, life: 14, max: 14 }];
  g.coneT = 0;
  H.centerOnSelected();
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "향 연기를 피웠다 — 시야가 끊긴다";
    box.appendChild(el);
  }
  return {
    sight: H.hasSight(g.tx, g.ty, a.tx, a.ty, 1.6, 0.85, g.level, a.level),
    see: H.guardSees(g, a, 0.016),
    smokeN: H.state.smoke.length
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/smoke-los-after.png" });

const fail = [];
if (cam.sight !== true) fail.push("cam sight " + cam.sight);
if (!(cam.see > 0)) fail.push("cam see " + cam.see);
if (afterCam.sight !== false) fail.push("after sight " + afterCam.sight);
if (afterCam.see !== 0) fail.push("after see " + afterCam.see);
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.through) fail.push("no through pair");
if (!info.throughClear) fail.push("through not clear");
if (!info.throughBlocked) fail.push("through not blocked");
if (!info.throughMidBlocks) fail.push("mid not in smoke");
if (!info.throughEndClear) fail.push("ends should be outside r");
if (!info.throughRestored) fail.push("through not restored");
if (!info.sideClear || !info.sideStill) fail.push("side smoke blocked LOS");
if (!info.close) fail.push("no close pair");
if (!info.sightClear) fail.push("close sight false");
if (!(info.seeClear > 0)) fail.push("guardSees clear " + info.seeClear);
if (info.sightSmoke) fail.push("target-in-smoke still hasSight");
if (info.seeSmoke !== 0) fail.push("guardSees smoke " + info.seeSmoke);
if (!info.targetInSmoke) fail.push("target not in smoke");
if (info.used.n !== 1 || info.used.r !== 3.6 || info.used.life !== 14) fail.push("useSecond " + JSON.stringify(info.used));
if (info.seeUsed !== 0) fail.push("useSecond still seen " + info.seeUsed);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, afterCam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
