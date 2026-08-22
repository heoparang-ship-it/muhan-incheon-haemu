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
  const chapel = (H.map.buildings || []).find((b) => b.id === "chapel");
  const spots = [];
  if (chapel && chapel.interiorTiles) {
    for (const i of chapel.interiorTiles) {
      const x = i % H.MAP_W, y = (i - x) / H.MAP_W;
      if (H.walkableAt(x, y, 1, g)) spots.push([x, y]);
    }
  }
  const here = spots[0];
  if (here && g) {
    g.tx = here[0];
    g.ty = here[1];
    g.level = 1;
    g.path = [];
  }

  const snap = H.snapshotSave();
  const rec = g && (snap.guards || []).find((x) => x.id === g.id);
  const agentRec = (snap.agents || [])[0];
  const civilRec = (snap.civilians || [])[0];

  H.rebuildWorld();
  const mid = H.guards.find((x) => x.id === (g && g.id));
  const wiped = mid && (mid.level || 0);

  H.applySave(snap);
  const after = H.guards.find((x) => x.id === (g && g.id));
  const afterV = after && { tx: after.tx, ty: after.ty, level: after.level || 0 };

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = g && (old.guards || []).find((x) => x.id === g.id);
  if (oldRec) {
    if (here) { oldRec.tx = here[0]; oldRec.ty = here[1]; }
    delete oldRec.level;
  }
  H.applySave(old);
  const oldAfter = H.guards.find((x) => x.id === (g && g.id));
  const oldV = oldAfter && { tx: oldAfter.tx, ty: oldAfter.ty, level: oldAfter.level || 0 };

  H.rebuildWorld();
  const g2 = H.guards.find((x) => x.id === (g && g.id));
  if (here && g2) { g2.tx = here[0]; g2.ty = here[1]; g2.level = 1; g2.path = []; }
  H.writeSave(true);
  H.continueMission();
  const cont = H.guards.find((x) => x.id === (g && g.id));
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
    at: { id: g && g.id, here, n: spots.length },
    snap: rec && { tx: rec.tx, ty: rec.ty, level: rec.level, path: rec.path },
    agentLevel: agentRec && agentRec.level,
    civilLevel: civilRec && civilRec.level,
    wiped,
    afterV,
    oldV,
    contV,
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.level === 1) || H.guards[0];
  const a = H.agents.find((x) => x.id === "haeju");
  if (g && a) {
    a.tx = g.tx;
    a.ty = g.ty;
    a.level = g.level || 0;
    H.selectAgent("haeju");
    H.centerOnSelected();
  }
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 2층 경비가 남는다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/glevel-save-after.png" });

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
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/glevel-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.at.here) fail.push("no 2F tile");
if (!info.snap || info.snap.level !== 1) fail.push("snap " + JSON.stringify(info.snap));
if (info.snap && info.snap.path != null) fail.push("guard path leaked");
if (info.agentLevel != null) fail.push("agent level leaked");
if (info.civilLevel != null) fail.push("civil level leaked");
if (info.wiped) fail.push("rebuild kept level " + info.wiped);
if (!info.afterV || info.afterV.level !== 1) fail.push("after " + JSON.stringify(info.afterV));
if (info.afterV && (info.afterV.tx !== info.at.here[0] || info.afterV.ty !== info.at.here[1])) fail.push("after pos");
if (!info.oldV || info.oldV.level !== 0) fail.push("old " + JSON.stringify(info.oldV));
if (!info.contV || info.contV.level !== 1) fail.push("continue " + JSON.stringify(info.contV));
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
