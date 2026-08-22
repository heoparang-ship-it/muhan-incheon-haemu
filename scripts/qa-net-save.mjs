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
  const g0 = H.guards.find((g) => !g.unconscious);
  const before = g0.netted || 0;
  g0.netted = 12;
  g0.path = [];
  H.state.nets.push({ tx: Math.round(g0.tx), ty: Math.round(g0.ty), armed: false, life: 120 });

  const snap = H.snapshotSave();
  const rec = (snap.guards || []).find((g) => g.id === g0.id);
  const snapNet = snap.nets && snap.nets[0];

  H.rebuildWorld();
  H.applySave(snap);
  const after = H.guards.find((g) => g.id === g0.id);
  const afterNets = (H.state.nets || []).length;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.guards || []).find((g) => g.id === g0.id);
  if (oldRec) delete oldRec.netted;
  H.applySave(old);
  const oldAfter = H.guards.find((g) => g.id === g0.id);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    guardId: g0.id,
    before,
    snapNetted: rec && rec.netted,
    snapNetArmed: snapNet && snapNet.armed,
    afterNetted: after && after.netted,
    afterNets,
    oldNetted: oldAfter && (oldAfter.netted || 0),
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.netted > 0) || H.guards[0];
  if (!g.netted) g.netted = 12;
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (g && haeju) {
    haeju.tx = g.tx;
    haeju.ty = g.ty;
    H.state.selected = "haeju";
    if (H.centerOnSelected) H.centerOnSelected();
  }
  return { id: g && g.id, netted: g && g.netted, tx: g && g.tx, ty: g && g.ty };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/net-save-qa.png" });
await page.screenshot({ path: "/workspace/screenshots/net-save-guard.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.before) fail.push("already netted " + info.before);
if (info.snapNetted !== 12) fail.push("snap " + info.snapNetted);
if (info.snapNetArmed !== false) fail.push("net armed " + info.snapNetArmed);
if (info.afterNetted !== 12) fail.push("after " + info.afterNetted);
if (info.afterNets !== 1) fail.push("nets " + info.afterNets);
if (info.oldNetted !== 0) fail.push("old " + info.oldNetted);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
