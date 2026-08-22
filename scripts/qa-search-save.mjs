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
  const here = spots[0];
  const seen = spots[Math.min(12, spots.length - 1)];
  g.tx = here[0];
  g.ty = here[1];
  g.lastSeen = { tx: seen[0], ty: seen[1] };
  H.beginSearch(g, 4.5);
  const at = { here, seen, spots: spots.length, beforePath: (g.path || []).length, searchT: g.searchT, ai: g.ai };

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((x) => x.id === g.id);

  H.rebuildWorld();
  const mid = H.guards.find((x) => x.id === g.id);
  const wiped = { ai: mid && mid.ai, searchT: mid && mid.searchT };

  H.applySave(snap);
  const after = H.guards.find((x) => x.id === g.id);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((x) => x.id === g.id);
  if (oldRec) {
    oldRec.ai = "search";
    delete oldRec.searchT;
    oldRec.lastSeen = { tx: seen[0], ty: seen[1] };
  }
  H.applySave(old);
  const oldAfter = H.guards.find((x) => x.id === g.id);

  H.rebuildWorld();
  const g2 = H.guards.find((x) => x.id === g.id);
  g2.tx = here[0];
  g2.ty = here[1];
  g2.lastSeen = { tx: seen[0], ty: seen[1] };
  H.beginSearch(g2, 4.5);
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
    guardId: g.id,
    guardType: g.type,
    at,
    snapAi: rec && rec.ai,
    snapSearchT: rec && rec.searchT,
    snapLastSeen: rec && rec.lastSeen,
    wiped,
    afterAi: after && after.ai,
    afterSearchT: after && after.searchT,
    afterPath: after && (after.path || []).length,
    afterLastSeen: after && after.lastSeen,
    oldAi: oldAfter && oldAfter.ai,
    oldSearchT: oldAfter && oldAfter.searchT,
    oldPath: oldAfter && (oldAfter.path || []).length,
    contAi: cont && cont.ai,
    contSearchT: cont && cont.searchT,
    contPath: cont && (cont.path || []).length,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const g = H.guards.find((x) => x.ai === "search") || H.guards[0];
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
    el.textContent = "불러온 뒤에도 경비가 남은 시간만큼 수색한다";
    box.appendChild(el);
  }
  return {
    id: g && g.id,
    ai: g && g.ai,
    searchT: g && g.searchT,
    path: g && (g.path || []).length
  };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/search-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.ai === "search");
  if (g) { g.ai = "patrol"; g.searchT = 0; g.path = []; }
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/search-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.at.ai !== "search") fail.push("before ai " + info.at.ai);
if (Math.abs(info.at.searchT - 4.5) > 1e-9) fail.push("before searchT " + info.at.searchT);
if (info.snapAi !== "search") fail.push("snap ai " + info.snapAi);
if (Math.abs((info.snapSearchT || 0) - 4.5) > 1e-9) fail.push("snap searchT " + info.snapSearchT);
if (info.wiped && info.wiped.ai === "search") fail.push("rebuild kept search");
if (info.afterAi !== "search") fail.push("after ai " + info.afterAi);
if (Math.abs((info.afterSearchT || 0) - 4.5) > 1e-9) fail.push("after searchT " + info.afterSearchT);
if (!(info.afterPath > 0)) fail.push("after path " + info.afterPath);
if (info.oldSearchT) fail.push("old searchT should be 0, got " + info.oldSearchT);
if (info.contAi !== "search") fail.push("continue ai " + info.contAi);
if (Math.abs((info.contSearchT || 0) - 4.5) > 1e-9) fail.push("continue searchT " + info.contSearchT);
if (!(info.contPath > 0)) fail.push("continue path " + info.contPath);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
