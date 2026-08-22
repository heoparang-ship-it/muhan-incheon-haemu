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
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const c0 = H.civilians.find((c) => c.type === "villager");
  const cid = c0.id;
  const def = c0.angle;
  const face = Math.PI;
  c0.angle = face;

  const snap = H.snapshotSave();
  const rec = (snap.civilians || []).find((x) => x.id === cid);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === cid);
  const afterRebuild = mid.angle;

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === cid);
  const afterApply = after.angle;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.civilians || []).find((x) => x.id === cid);
  delete oldRec.angle;
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === cid);
  const afterOld = oldAfter.angle;

  H.rebuildWorld();
  const c2 = H.civilians.find((x) => x.id === cid);
  c2.angle = face;
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === cid);
  const afterCont = cont.angle;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    cid, def, face,
    snapAng: rec && rec.angle,
    afterRebuild, afterApply, afterOld, afterCont,
    near,
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const c = H.civilians.find((x) => x.type === "villager");
  if (c) c.angle = Math.PI;
  H.cam.targetZoom = H.cam.zoom = 1.2;
  if (c) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(c.tx + 0.5, c.ty + 0.5);
    H.cam.y = isoY(c.tx + 0.5, c.ty + 0.5);
  }
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 주민이 바라보던 방향이 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/cangle-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const c = H.civilians.find((x) => x.type === "villager");
  if (c) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(c.tx + 0.5, c.ty + 0.5);
    H.cam.y = isoY(c.tx + 0.5, c.ty + 0.5);
    H.cam.targetZoom = H.cam.zoom = 1.2;
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/cangle-save-clear.png" });

const near = (a, b) => Math.abs(a - b) < 1e-9;
const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!near(info.snapAng, Math.PI)) fail.push("snap " + info.snapAng);
if (near(info.afterRebuild, Math.PI)) fail.push("rebuild still pi " + info.afterRebuild);
if (!near(info.afterApply, Math.PI)) fail.push("apply " + info.afterApply);
if (!near(info.afterOld, info.def)) fail.push("old " + info.afterOld);
if (!near(info.afterCont, Math.PI)) fail.push("continue " + info.afterCont);
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
