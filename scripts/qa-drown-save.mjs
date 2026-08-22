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
  const p0 = H.civilians.find((c) => c.type === "prisoner");
  const pid = p0.id;
  const before = { drowning: !!p0.drowning, drownT: p0.drownT || 0 };
  p0.drowning = true;
  p0.drownT = 40;

  const snap = H.snapshotSave();
  const rec = (snap.civilians || []).find((x) => x.id === pid);

  H.rebuildWorld();
  const mid = H.civilians.find((x) => x.id === pid);
  const afterRebuild = { drowning: !!mid.drowning, drownT: mid.drownT || 0 };

  H.applySave(snap);
  const after = H.civilians.find((x) => x.id === pid);
  const afterApply = { drowning: !!after.drowning, drownT: after.drownT || 0 };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.civilians || []).find((x) => x.id === pid);
  delete oldRec.drowning;
  delete oldRec.drownT;
  H.applySave(old);
  const oldAfter = H.civilians.find((x) => x.id === pid);
  const afterOld = { drowning: !!oldAfter.drowning, drownT: oldAfter.drownT || 0 };

  H.rebuildWorld();
  const p2 = H.civilians.find((x) => x.id === pid);
  p2.drowning = true;
  p2.drownT = 40;
  H.writeSave(true);
  H.continueMission();
  const cont = H.civilians.find((x) => x.id === pid);
  const afterCont = { drowning: !!cont.drowning, drownT: cont.drownT || 0 };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    pid, before,
    snap: rec && { drowning: !!rec.drowning, drownT: rec.drownT },
    afterRebuild, afterApply, afterOld, afterCont,
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const p = H.civilians.find((c) => c.type === "prisoner");
  if (p) { p.drowning = true; p.drownT = 40; }
  H.cam.targetZoom = H.cam.zoom = 1.2;
  if (p) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(p.tx + 0.5, p.ty + 0.5);
    H.cam.y = isoY(p.tx + 0.5, p.ty + 0.5);
  }
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine warn";
    el.textContent = "불러온 뒤에도 잠기는 시간이 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/drown-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const p = H.civilians.find((c) => c.type === "prisoner");
  if (p) {
    const isoX = (tx, ty) => (tx - ty) * 32;
    const isoY = (tx, ty) => (tx + ty) * 16;
    H.cam.x = isoX(p.tx + 0.5, p.ty + 0.5);
    H.cam.y = isoY(p.tx + 0.5, p.ty + 0.5);
    H.cam.targetZoom = H.cam.zoom = 1.2;
  }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/drown-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.before.drowning || info.before.drownT) fail.push("already drowning");
if (!info.snap || !info.snap.drowning || info.snap.drownT !== 40) fail.push("snap " + JSON.stringify(info.snap));
if (info.afterRebuild.drowning || info.afterRebuild.drownT) fail.push("rebuild " + JSON.stringify(info.afterRebuild));
if (!info.afterApply.drowning || info.afterApply.drownT !== 40) fail.push("apply " + JSON.stringify(info.afterApply));
if (info.afterOld.drowning || info.afterOld.drownT) fail.push("old " + JSON.stringify(info.afterOld));
if (!info.afterCont.drowning || info.afterCont.drownT !== 40) fail.push("continue " + JSON.stringify(info.afterCont));
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
