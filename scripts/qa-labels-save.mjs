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
  const g0 = H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");

  H.state.showLabels = true;
  const snapOn = H.snapshotSave();

  H.rebuildWorld();
  const wiped = !!H.state.showLabels;

  H.applySave(snapOn);
  const afterOn = !!H.state.showLabels;

  H.state.showLabels = false;
  const snapOff = H.snapshotSave();
  H.rebuildWorld();
  H.applySave(snapOff);
  const afterOff = !!H.state.showLabels;

  H.rebuildWorld();
  const old = H.snapshotSave();
  delete old.showLabels;
  H.applySave(old);
  const oldLabels = !!H.state.showLabels;

  H.rebuildWorld();
  H.state.showLabels = true;
  H.writeSave(true);
  H.continueMission();
  const cont = !!H.state.showLabels;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapOn: !!snapOn.showLabels,
    snapOff: !!snapOff.showLabels,
    wiped,
    afterOn,
    afterOff,
    oldLabels,
    cont,
    guard: g0 && { id: g0.id, type: g0.type, tx: g0.tx, ty: g0.ty },
    haeju: a && { tx: a.tx, ty: a.ty },
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.state.showLabels = true;
  const g0 = H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (g0 && a) {
    a.tx = g0.tx;
    a.ty = g0.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 이름표가 남는다";
    box.appendChild(el);
  }
  return { showLabels: !!H.state.showLabels, at: g0 && { tx: g0.tx, ty: g0.ty } };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/labels-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const g0 = H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (g0 && a) {
    a.tx = g0.tx;
    a.ty = g0.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/labels-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapOn !== true) fail.push("snapOn " + info.snapOn);
if (info.wiped !== false) fail.push("wiped " + info.wiped);
if (info.afterOn !== true) fail.push("afterOn " + info.afterOn);
if (info.afterOff !== false) fail.push("afterOff " + info.afterOff);
if (info.oldLabels !== false) fail.push("old " + info.oldLabels);
if (info.cont !== true) fail.push("continue " + info.cont);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
