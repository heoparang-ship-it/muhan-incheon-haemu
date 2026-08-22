import { chromium } from "playwright";
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
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://127.0.0.1:8080/game/index.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 8000 });
await page.locator("#startBtn").click();
await page.waitForTimeout(1600);
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const wall = H.map.buildings.find((b) => b.kind === "wall");
  H.state.followSel = false;
  H.cam.targetZoom = H.cam.zoom = 0.72;
  if (wall) {
    const cx = wall.x + wall.w / 2, cy = wall.y + 0.2;
    H.cam.x = (cx - cy) * 32;
    H.cam.y = (cx + cy) * 16;
  }
  const mid = wall ? { tx: wall.x + 5, ty: wall.y } : null;
  const inside = wall ? { tx: wall.x + 5, ty: wall.y + 3 } : null;
  const outside = wall ? { tx: wall.x + 5, ty: wall.y - 3 } : null;
  const losAcross = mid && H.hasSight(outside.tx, outside.ty, inside.tx, inside.ty);
  const door = H.map.doors.find((d) => d.id === "front");
  const doorIsWallSeg = door && wall && H.isWallSegment(wall, door.tx, door.ty);
  return {
    running: H.state.running,
    wallId: wall && wall.id,
    wallWH: wall && [wall.w, wall.h],
    tiles: wall && wall.tiles.length,
    doorCount: H.map.doors.length,
    doorIsWallSeg,
    losAcrossClosedWall: !!losAcross,
    prerender: H.wallPrerender(),
  };
});

await page.waitForTimeout(500);
const after = await page.evaluate(() => window.__HAEMU__.wallPrerender());
await page.screenshot({ path: "/workspace/screenshots/wall-compound-north.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const wall = H.map.buildings.find((b) => b.kind === "wall");
  if (!wall) return;
  const cx = wall.x + wall.w - 0.5, cy = wall.y + wall.h / 2;
  H.cam.zoom = H.cam.targetZoom = 0.78;
  H.cam.x = (cx - cy) * 32;
  H.cam.y = (cx + cy) * 16;
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/wall-compound-east.png" });

const fail = [];
if (!info.running) fail.push("not running");
if (info.wallId !== "compound") fail.push("no compound wall");
if (info.tiles < 80) fail.push("tiles " + info.tiles);
if (info.doorIsWallSeg) fail.push("door still counted as wall segment");
if (info.losAcrossClosedWall) fail.push("LOS punched through solid wall");
if (!after.ready) fail.push("wall face not punched");
if (after.cache < 2) fail.push("cache " + after.cache);
if (after.blits < 10) fail.push("blits " + after.blits);
if (after.fallback !== 0) fail.push("fallback " + after.fallback);
if (after.compoundDoors < 1) fail.push("doors " + after.compoundDoors);
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, after, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
