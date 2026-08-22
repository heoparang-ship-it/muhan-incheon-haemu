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
  const bell = H.interactables.find((o) => o.id === "bellTower");
  const priest = H.guards.find((g) => g.type === "priest" && !g.unconscious);
  const walk = bell ? H.walkableAt(Math.round(bell.tx), Math.round(bell.ty), 0, null) : false;

  const beforeCut = H.bellRopeCut();
  H.state.alarmLevel = 0;
  H.state.bellRinging = 0;
  H.raiseAlarm(priest, priest.tx, priest.ty);
  const intact = {
    alarm: H.state.alarmLevel,
    ringing: H.state.bellRinging,
    ever: !!H.state.everAlarmed
  };

  H.state.alarmLevel = 0;
  H.state.alarmT = 0;
  H.state.bellRinging = 0;
  H.state.everAlarmed = false;
  bell.done = true;
  H.state.bellDisabled = true;
  for (const g of H.guards) if (g.type === "priest") g.bellBroken = true;

  const cut = H.bellRopeCut();
  H.raiseAlarm(priest, priest.tx, priest.ty);
  const afterCut = {
    alarm: H.state.alarmLevel,
    ringing: H.state.bellRinging
  };

  H.state.bellRinging = 0;
  H.ringBell(2.4);
  const ringAfterCut = H.state.bellRinging;

  H.state.processionStarted = false;
  H.startProcession();
  const processionRing = H.state.bellRinging;

  const snap = H.snapshotSave();
  const snapDone = !!(snap.interactables.find((o) => o.id === "bellTower") || {}).done;
  H.rebuildWorld();
  H.applySave(snap);
  const priest2 = H.guards.find((g) => g.type === "priest" && !g.unconscious);
  H.state.alarmLevel = 0;
  H.state.bellRinging = 0;
  const loadedCut = H.bellRopeCut();
  H.raiseAlarm(priest2, priest2.tx, priest2.ty);
  const afterLoad = {
    alarm: H.state.alarmLevel,
    ringing: H.state.bellRinging,
    disabled: !!H.state.bellDisabled
  };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    bellAt: bell ? [bell.tx, bell.ty] : null,
    walk,
    priestId: priest && priest.id,
    beforeCut,
    intact,
    cut,
    afterCut,
    ringAfterCut,
    processionRing,
    snapDone,
    loadedCut,
    afterLoad,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const bell = H.interactables.find((o) => o.id === "bellTower");
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (bell && haeju) {
    haeju.tx = bell.tx;
    haeju.ty = bell.ty;
    H.state.selected = "haeju";
    if (H.centerOnSelected) H.centerOnSelected();
  }
  return { tx: bell && bell.tx, ty: bell && bell.ty, cut: H.bellRopeCut() };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/bell-rope-qa.png" });
await page.screenshot({ path: "/workspace/screenshots/bell-rope-tower.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.bellAt) fail.push("no bell");
if (!info.walk) fail.push("bell not walkable " + info.bellAt);
if (!info.priestId) fail.push("no priest");
if (info.beforeCut) fail.push("already cut");
if (info.intact.alarm !== 2) fail.push("intact alarm " + info.intact.alarm);
if (!(info.intact.ringing > 0)) fail.push("intact no ring " + info.intact.ringing);
if (!info.cut) fail.push("cut flag false");
if (info.afterCut.alarm !== 1) fail.push("cut alarm " + info.afterCut.alarm);
if (info.afterCut.ringing !== 0) fail.push("cut still rings " + info.afterCut.ringing);
if (info.ringAfterCut !== 0) fail.push("ringBell after cut " + info.ringAfterCut);
if (info.processionRing !== 0) fail.push("procession ring " + info.processionRing);
if (!info.snapDone) fail.push("snap done missing");
if (!info.loadedCut) fail.push("load lost cut");
if (info.afterLoad.alarm !== 1) fail.push("load alarm " + info.afterLoad.alarm);
if (info.afterLoad.ringing !== 0) fail.push("load ring " + info.afterLoad.ringing);
if (!info.afterLoad.disabled) fail.push("load disabled false");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
