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
  const g = H.guards.find((x) => x.id !== "vale") || H.guards[0];
  const spawnPat = (g.patrol || []).map((n) => [n[0], n[1]]);
  const spawnPi = g.pi || 0;
  const rising = [[74, 76], [72, 78]];
  g.patrol = rising.map((n) => n.slice());
  g.pi = 1;
  g.path = [{ tx: 70, ty: 70 }];

  const snap = H.snapshotSave();
  const rec = g && (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const mid = H.guards.find((x) => x.id === (g && g.id));
  const midPat = mid && (mid.patrol || []).map((n) => [n[0], n[1]]);

  H.applySave(snap);
  const after = H.guards.find((x) => x.id === (g && g.id));
  const afterPat = after && (after.patrol || []).map((n) => [n[0], n[1]]);
  const afterPathN = after && after.path ? after.path.length : -1;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = g && (old.guards || []).find((x) => x.id === g.id);
  if (oldRec) {
    delete oldRec.patrol;
    delete oldRec.pi;
  }
  H.applySave(old);
  const oldAfter = H.guards.find((x) => x.id === (g && g.id));
  const oldPat = oldAfter && (oldAfter.patrol || []).map((n) => [n[0], n[1]]);

  H.rebuildWorld();
  const g2 = H.guards.find((x) => x.id === (g && g.id));
  if (g2) {
    g2.patrol = rising.map((n) => n.slice());
    g2.pi = 1;
    g2.path = [];
  }
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((x) => x.id === (g && g.id));
  const contPat = cont && (cont.patrol || []).map((n) => [n[0], n[1]]);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    id: g && g.id,
    spawnPat,
    spawnPi,
    hasCopy: typeof H.copyGuardPatrol === "function",
    snapPat: rec && rec.patrol,
    snapPi: rec && rec.pi,
    snapPath: rec && rec.path,
    midPat,
    afterPat,
    afterPi: after && after.pi,
    afterPathN,
    oldPat,
    contPat,
    contPi: cont && cont.pi,
    risingKept: same(afterPat, rising) && after && after.pi === 1,
    oldKeptSpawn: same(oldPat, spawnPat),
    contKept: same(contPat, rising) && cont && cont.pi === 1,
    midReset: !same(midPat, rising),
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.id === "g0") || H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (g && a) {
    a.tx = g.tx;
    a.ty = g.ty;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 바뀐 순찰이 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/patrol-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) {
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/patrol-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasCopy) fail.push("export");
if (!info.risingKept) fail.push("after " + JSON.stringify({ p: info.afterPat, i: info.afterPi }));
if (info.afterPathN !== 0) fail.push("path restored " + info.afterPathN);
if (info.snapPath != null) fail.push("path leaked");
if (!info.midReset) fail.push("rebuild kept rising patrol");
if (!info.oldKeptSpawn) fail.push("old " + JSON.stringify(info.oldPat));
if (!info.contKept) fail.push("continue " + JSON.stringify({ p: info.contPat, i: info.contPi }));
if (!info.snapPat || info.snapPat.length !== 2 || info.snapPi !== 1) fail.push("snap " + JSON.stringify(info.snapPat));
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
