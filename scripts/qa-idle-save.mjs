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
  const a = H.agents.find((x) => x.id === "haeju");
  if (c) {
    c.path = [];
    c.panic = 0;
    c.inProcession = false;
    c.idleT = 3.5;
  }

  const snap = H.snapshotSave();
  const rec = c && (snap.civilians || []).find((x) => x.id === c.id);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === (c && c.id));
  const wiped = mid && mid.idleT;

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === (c && c.id));
  const afterIdle = after && after.idleT;

  if (after) { after.panic = 0; after.path = []; after.inProcession = false; }
  H.updateCivilians(0.1);
  const ticked = after && after.idleT;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = c && (old.civilians || []).find((x) => x.id === c.id);
  if (oldRec) delete oldRec.idleT;
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === (c && c.id));
  const oldIdle = oldAfter && oldAfter.idleT;

  H.rebuildWorld();
  const c2 = H.civilians.find((x) => x.id === (c && c.id));
  if (c2) { c2.path = []; c2.panic = 0; c2.inProcession = false; c2.idleT = 3.5; }
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === (c && c.id));
  const contIdle = cont && cont.idleT;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at: { id: c && c.id, tx: c && c.tx, ty: c && c.ty },
    snap: rec && rec.idleT,
    wiped,
    afterIdle,
    ticked,
    oldIdle,
    contIdle,
    haeju: a && { tx: a.tx, ty: a.ty },
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const c = H.civilians.find((x) => x.type === "villager") || H.civilians[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (c && a) {
    a.tx = c.tx;
    a.ty = c.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 서 있는 시간이 남는다";
    box.appendChild(el);
  }
  return { idleT: c && c.idleT };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/idle-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const c = H.civilians.find((x) => x.type === "villager") || H.civilians[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (c && a) {
    a.tx = c.tx;
    a.ty = c.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/idle-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snap !== 3.5) fail.push("snap " + info.snap);
if (info.afterIdle !== 3.5) fail.push("after " + info.afterIdle);
if (Math.abs(info.ticked - 3.4) > 1e-12) fail.push("tick " + info.ticked);
if (info.oldIdle === 3.5) fail.push("old idleT should not be 3.5, got " + info.oldIdle);
if (info.contIdle !== 3.5) fail.push("continue " + info.contIdle);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
