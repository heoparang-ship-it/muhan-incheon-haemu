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
  const a = H.agents.find((x) => x.id === "haeju") || H.agents[0];
  const g = H.guards.find((x) => x.type === "steward" && !x.unconscious) || H.guards[0];
  const spots = [];
  for (let y = 46; y <= 58; y++) {
    for (let x = 16; x <= 32; x++) {
      if (H.walkableAt(x, y, 0, a)) spots.push([x, y]);
    }
  }
  if (spots.length >= 2) {
    a.tx = spots[0][0]; a.ty = spots[0][1];
    g.tx = spots[1][0]; g.ty = spots[1][1];
  }
  H.startStewardCheck(g, a);
  a.checkHold = 2.5;
  g.talkT = 2.5;
  const at = {
    agent: a.id, guard: g.id, xy: [a.tx, a.ty], guardXy: [g.tx, g.ty],
    hold: a.checkHold, line: g.checkLine, banner: !!(document.getElementById("checkBanner") || {}).classList?.contains("show")
  };

  const snap = H.snapshotSave();
  const recA = (snap.agents || []).find((x) => x.id === a.id);
  const recG = (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const midA = H.agents.find((x) => x.id === a.id);
  const midG = H.guards.find((x) => x.id === g.id);
  const wiped = {
    hold: midA && (midA.checkHold || 0),
    target: midG && midG.checkTarget,
    banner: !!(document.getElementById("checkBanner") || {}).classList?.contains("show")
  };

  H.applySave(snap);
  const afterA = H.agents.find((x) => x.id === a.id);
  const afterG = H.guards.find((x) => x.id === g.id);
  const afterBanner = document.getElementById("checkBanner");
  H.updateChecks(0.1);
  const afterTick = {
    hold: afterA && afterA.checkHold,
    guard: afterA && afterA.checkGuard,
    target: afterG && afterG.checkTarget,
    line: afterG && afterG.checkLine,
    banner: !!(afterBanner && afterBanner.classList.contains("show")),
    bannerText: afterBanner && afterBanner.textContent
  };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldA = (old.agents || []).find((x) => x.id === a.id);
  const oldG = (old.guards || []).find((x) => x.id === g.id);
  if (oldA) {
    delete oldA.checkHold; delete oldA.checkGuard; delete oldA.checkFrom;
  }
  if (oldG) {
    delete oldG.checkTarget; delete oldG.checkLine; delete oldG.checkCd; delete oldG.talkT;
  }
  H.applySave(old);
  const oldAfterA = H.agents.find((x) => x.id === a.id);
  const oldAfterG = H.guards.find((x) => x.id === g.id);

  H.rebuildWorld();
  const gCd = H.guards.find((x) => x.id === g.id);
  gCd.checkCd = (H.state.now || 0) + 14000;
  const snapCd = H.snapshotSave();
  const recCd = (snapCd.guards || []).find((x) => x.id === g.id);
  const snapCdVal = recCd && recCd.checkCd;
  H.applySave(snapCd);
  const afterCd = H.guards.find((x) => x.id === g.id);
  const remCd = afterCd ? afterCd.checkCd - performance.now() : 0;
  const stillCd = afterCd && afterCd.checkCd > performance.now();

  H.rebuildWorld();
  const a2 = H.agents.find((x) => x.id === a.id);
  const g2 = H.guards.find((x) => x.id === g.id);
  if (spots.length >= 2) {
    a2.tx = spots[0][0]; a2.ty = spots[0][1];
    g2.tx = spots[1][0]; g2.ty = spots[1][1];
  }
  H.startStewardCheck(g2, a2);
  a2.checkHold = 2.5;
  g2.talkT = 2.5;
  H.writeSave(true);
  H.continueMission();
  const contA = H.agents.find((x) => x.id === a.id);
  const contG = H.guards.find((x) => x.id === g.id);
  const contBan = document.getElementById("checkBanner");

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at,
    snapHold: recA && recA.checkHold,
    snapGuard: recA && recA.checkGuard,
    snapTarget: recG && recG.checkTarget,
    snapLine: recG && recG.checkLine,
    snapTalkT: recG && recG.talkT,
    wiped,
    afterHold: afterA && afterA.checkHold,
    afterGuard: afterA && afterA.checkGuard,
    afterTarget: afterG && afterG.checkTarget,
    afterLine: afterG && afterG.checkLine,
    afterTick,
    oldHold: oldAfterA && (oldAfterA.checkHold || 0),
    oldTarget: oldAfterG && oldAfterG.checkTarget,
    snapCd: snapCdVal,
    remCd,
    stillCd,
    contHold: contA && contA.checkHold,
    contGuard: contA && contA.checkGuard,
    contTarget: contG && contG.checkTarget,
    contLine: contG && contG.checkLine,
    contBanner: !!(contBan && contBan.classList.contains("show")),
    contBannerText: contBan && contBan.textContent,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 집사 문답이 이어진다";
    box.appendChild(el);
  }
  const ban = document.getElementById("checkBanner");
  return {
    hold: a && a.checkHold,
    guard: a && a.checkGuard,
    banner: !!(ban && ban.classList.contains("show")),
    bannerText: ban && ban.textContent
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/check-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents.find((x) => x.checkHold > 0);
  const g = a && H.guards.find((x) => x.id === a.checkGuard);
  if (a) { a.checkHold = 0; a.checkGuard = null; }
  if (g) { g.checkTarget = null; g.checkLine = null; g.talkT = 0; }
  const ban = document.getElementById("checkBanner");
  if (ban) { ban.classList.remove("show"); ban.textContent = ""; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/check-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (Math.abs((info.snapHold || 0) - 2.5) > 1e-9) fail.push("snap hold " + info.snapHold);
if (info.snapGuard !== info.at.guard) fail.push("snap guard " + info.snapGuard);
if (info.snapTarget !== info.at.agent) fail.push("snap target " + info.snapTarget);
if (!info.snapLine) fail.push("snap line empty");
if (info.wiped && info.wiped.hold > 0) fail.push("rebuild kept hold");
if (Math.abs((info.afterTick.hold || 0) - 2.4) > 1e-9) fail.push("after tick hold " + info.afterTick.hold);
if (info.afterTick.guard !== info.at.guard) fail.push("after guard " + info.afterTick.guard);
if (info.afterTick.target !== info.at.agent) fail.push("after target " + info.afterTick.target);
if (info.afterTick.line !== info.snapLine) fail.push("after line " + info.afterTick.line);
if (!info.afterTick.banner) fail.push("after banner hidden");
if (info.oldHold) fail.push("old hold should be 0, got " + info.oldHold);
if (info.oldTarget) fail.push("old target should be empty");
if (Math.abs((info.snapCd || 0) - 14000) > 1) fail.push("snap cd " + info.snapCd);
if (Math.abs(info.remCd - 14000) > 50) fail.push("rem cd " + info.remCd);
if (!info.stillCd) fail.push("cooldown not active after apply");
if (Math.abs((info.contHold || 0) - 2.5) > 1e-9) fail.push("continue hold " + info.contHold);
if (info.contGuard !== info.at.guard) fail.push("continue guard " + info.contGuard);
if (info.contTarget !== info.at.agent) fail.push("continue target " + info.contTarget);
if (!info.contBanner) fail.push("continue banner hidden");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
