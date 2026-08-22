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
  const g = H.guards.find((x) => !x.unconscious && x.type === "soldier") || H.guards[0];
  const spots = [];
  for (let y = 46; y <= 58; y++) {
    for (let x = 16; x <= 32; x++) {
      if (H.walkableAt(x, y, 0, g)) spots.push([x, y]);
    }
  }
  let here = null, dest = null, beforePath = 0;
  for (let i = 0; i < spots.length; i++) {
    for (let j = spots.length - 1; j > i; j--) {
      const p = H.findPath(spots[i][0], spots[i][1], spots[j][0], spots[j][1], g);
      if (p.length > 0) {
        here = spots[i]; dest = spots[j]; beforePath = p.length; g.path = p;
        break;
      }
    }
    if (here) break;
  }
  if (here) { g.tx = here[0]; g.ty = here[1]; }
  g.ai = "investigate";
  g.target = dest ? { tx: dest[0], ty: dest[1] } : null;
  const at = { id: g.id, type: g.type, here, dest, spots: spots.length, beforePath, ai: g.ai };

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const mid = H.guards.find((x) => x.id === g.id);
  const wiped = { ai: mid && mid.ai, target: mid && mid.target };

  H.applySave(snap);
  const after = H.guards.find((x) => x.id === g.id);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((x) => x.id === g.id);
  if (oldRec) {
    oldRec.ai = "investigate";
    delete oldRec.target;
  }
  H.applySave(old);
  const oldAfter = H.guards.find((x) => x.id === g.id);

  H.rebuildWorld();
  const g2 = H.guards.find((x) => x.id === g.id);
  if (here) { g2.tx = here[0]; g2.ty = here[1]; }
  g2.ai = "investigate";
  g2.target = dest ? { tx: dest[0], ty: dest[1] } : null;
  g2.path = dest ? H.findPath(g2.tx, g2.ty, dest[0], dest[1], g2) : [];
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((x) => x.id === g.id);

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
    snapAi: rec && rec.ai,
    snapTarget: rec && rec.target,
    wiped,
    afterAi: after && after.ai,
    afterTarget: after && after.target,
    afterPath: after && (after.path || []).length,
    oldAi: oldAfter && oldAfter.ai,
    oldTarget: oldAfter && oldAfter.target,
    oldPath: oldAfter && (oldAfter.path || []).length,
    contAi: cont && cont.ai,
    contTarget: cont && cont.target,
    contPath: cont && (cont.path || []).length,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.ai === "investigate") || H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (a && g) { a.tx = g.tx; a.ty = g.ty; }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 경비가 소리 난 칸으로 확인하러 간다";
    box.appendChild(el);
  }
  return {
    id: g && g.id,
    ai: g && g.ai,
    target: g && g.target,
    path: g && (g.path || []).length
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/invest-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.ai === "investigate");
  if (g) { g.ai = "patrol"; g.target = null; g.path = []; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/invest-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!(info.at.beforePath > 0)) fail.push("before path " + info.at.beforePath + " at " + JSON.stringify(info.at));
if (info.snapAi !== "investigate") fail.push("snap ai " + info.snapAi);
if (!info.snapTarget || info.snapTarget.tx !== info.at.dest[0] || info.snapTarget.ty !== info.at.dest[1]) {
  fail.push("snap target " + JSON.stringify(info.snapTarget));
}
if (info.wiped && info.wiped.ai === "investigate") fail.push("rebuild kept investigate");
if (info.afterAi !== "investigate") fail.push("after ai " + info.afterAi);
if (!info.afterTarget || info.afterTarget.tx !== info.at.dest[0] || info.afterTarget.ty !== info.at.dest[1]) {
  fail.push("after target " + JSON.stringify(info.afterTarget));
}
if (!(info.afterPath > 0)) fail.push("after path " + info.afterPath);
if (info.oldTarget) fail.push("old target should be empty");
if (info.oldPath) fail.push("old path should be 0, got " + info.oldPath);
if (info.contAi !== "investigate") fail.push("continue ai " + info.contAi);
if (!info.contTarget || info.contTarget.tx !== info.at.dest[0] || info.contTarget.ty !== info.at.dest[1]) {
  fail.push("continue target " + JSON.stringify(info.contTarget));
}
if (!(info.contPath > 0)) fail.push("continue path " + info.contPath);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
