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
  const stair = H.interactables.find((o) => o.kind === "stairs" && (o.id || "").includes("chapel"));
  const stairs = H.interactables.filter((o) => o.kind === "stairs").map((o) => ({ id: o.id, tx: o.tx, ty: o.ty }));
  const haeju = H.agents.find((a) => a.id === "haeju");
  const before = haeju.level || 0;
  if (stair) { haeju.tx = stair.tx; haeju.ty = stair.ty; }
  haeju.level = 1;

  const snap = H.snapshotSave();
  const rec = snap.agents.find((a) => a.id === "haeju");

  H.rebuildWorld();
  H.applySave(snap);
  const after = H.agents.find((a) => a.id === "haeju");
  const walk1 = H.walkableAt(Math.round(after.tx), Math.round(after.ty), 1, after);
  const walk0 = H.walkableAt(Math.round(after.tx), Math.round(after.ty), 0, after);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = old.agents.find((a) => a.id === "haeju");
  delete oldRec.level;
  oldRec.tx = rec.tx; oldRec.ty = rec.ty;
  H.applySave(old);
  const oldAfter = H.agents.find((a) => a.id === "haeju");

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    stairs,
    stair: stair && { id: stair.id, tx: stair.tx, ty: stair.ty },
    before,
    snapLevel: rec && rec.level,
    snapAt: rec && [rec.tx, rec.ty],
    afterLevel: after && after.level,
    afterAt: after && [after.tx, after.ty],
    walk1,
    walk0,
    oldLevel: oldAfter && (oldAfter.level || 0),
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const stair = H.interactables.find((o) => o.kind === "stairs");
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (stair && haeju) {
    haeju.tx = stair.tx;
    haeju.ty = stair.ty;
    haeju.level = 1;
    H.state.selected = "haeju";
    if (H.centerOnSelected) H.centerOnSelected();
  }
  return { tx: haeju && haeju.tx, ty: haeju && haeju.ty, level: haeju && haeju.level };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/level-save-qa.png" });
await page.screenshot({ path: "/workspace/screenshots/level-save-floor.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.stair) fail.push("no chapel stairs " + JSON.stringify(info.stairs));
if (info.before !== 0) fail.push("already up " + info.before);
if (info.snapLevel !== 1) fail.push("snap " + info.snapLevel);
if (info.afterLevel !== 1) fail.push("after " + info.afterLevel);
if (!info.walk1) fail.push("not walkable on 2F");
if (info.oldLevel !== 0) fail.push("old " + info.oldLevel);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
