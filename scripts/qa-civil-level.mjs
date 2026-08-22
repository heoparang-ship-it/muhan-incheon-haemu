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
  const c = H.civilians.find((x) => x.type === "villager") || H.civilians[0];
  const chapel = (H.map.buildings || []).find((b) => b.id === "chapel");
  const spots = [];
  if (chapel && chapel.interiorTiles) {
    for (const i of chapel.interiorTiles) {
      const x = i % H.MAP_W, y = (i - x) / H.MAP_W;
      if (H.walkableAt(x, y, 1, c)) spots.push([x, y]);
    }
  }
  const here = spots[0];
  if (here && c) {
    c.tx = here[0];
    c.ty = here[1];
    c.level = 1;
    c.path = [];
  }

  const snap = H.snapshotSave();
  const rec = c && (snap.civilians || []).find((x) => x.id === c.id);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === (c && c.id));
  const wiped = mid && (mid.level || 0);

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === (c && c.id));
  const afterV = after && { tx: after.tx, ty: after.ty, level: after.level || 0 };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = c && (old.civilians || []).find((x) => x.id === c.id);
  if (oldRec) {
    if (here) { oldRec.tx = here[0]; oldRec.ty = here[1]; }
    delete oldRec.level;
  }
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === (c && c.id));
  const oldV = oldAfter && { tx: oldAfter.tx, ty: oldAfter.ty, level: oldAfter.level || 0 };

  H.rebuildWorld();
  const c2 = H.civilians.find((x) => x.id === (c && c.id));
  if (here && c2) { c2.tx = here[0]; c2.ty = here[1]; c2.level = 1; c2.path = []; }
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === (c && c.id));
  const contV = cont && { tx: cont.tx, ty: cont.ty, level: cont.level || 0 };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at: { id: c && c.id, here, n: spots.length },
    snap: rec && { tx: rec.tx, ty: rec.ty, level: rec.level },
    wiped,
    afterV,
    oldV,
    contV,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const c = H.civilians.find((x) => x.id === "c0") || H.civilians[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (c && a) {
    a.tx = c.tx;
    a.ty = c.ty;
    a.level = c.level || 0;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 2층 주민이 남는다";
    box.appendChild(el);
  }
  return { level: c && (c.level || 0), tx: c && c.tx, ty: c && c.ty };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/civil-level-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) {
    a.tx = 39;
    a.ty = 33;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/civil-level-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.at.here) fail.push("no 2F tile");
if (!info.snap || info.snap.level !== 1) fail.push("snap " + JSON.stringify(info.snap));
if (info.wiped) fail.push("rebuild kept level " + info.wiped);
if (!info.afterV || info.afterV.level !== 1) fail.push("after " + JSON.stringify(info.afterV));
if (info.afterV && (info.afterV.tx !== info.at.here[0] || info.afterV.ty !== info.at.here[1])) fail.push("after pos");
if (!info.oldV || info.oldV.level !== 0) fail.push("old level should be 0, got " + JSON.stringify(info.oldV));
if (!info.contV || info.contV.level !== 1) fail.push("continue " + JSON.stringify(info.contV));
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
