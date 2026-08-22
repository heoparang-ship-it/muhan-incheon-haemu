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
  const cell = H.map.buildings.find((b) => b.id === "cell");
  const pad = H.interactables.find((o) => o.kind === "cellDoor");
  const mujin = H.agents.find((x) => x.id === "mujin");
  const inside = H.civilians.find((c) => c.type === "prisoner" && H.map.inside[H.idx(Math.round(c.tx), Math.round(c.ty))] === H.map.buildings.indexOf(cell));

  const before = {
    pad: { tx: pad.tx, ty: pad.ty },
    door: { tx: cell.door.tx, ty: cell.door.ty, locked: cell.door.locked, open: cell.door.open },
    pathOut: H.findPath(inside.tx, inside.ty, 73, 80, inside).length,
    chessToDoor: Math.max(Math.abs(pad.tx - cell.door.tx), Math.abs(pad.ty - cell.door.ty))
  };

  mujin.tx = pad.tx; mujin.ty = pad.ty; mujin.path = []; mujin.action = null; mujin.queue = [];
  H.selectAgent("mujin");
  const near = H.nearestInteract(mujin);
  H.interact(mujin);
  if (mujin.action && mujin.action.done) mujin.action.done();
  mujin.action = null;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    before,
    near: near && { type: near.type, kind: near.o.kind || near.type, id: near.o.id },
    after: {
      locked: cell.door.locked,
      open: cell.door.open,
      freed: H.civilians.filter((c) => c.type === "prisoner" && c.freed).length,
      obj: !!H.state.objectives.freePrisoners,
      pathOut: H.findPath(inside.tx, inside.ty, 73, 80, inside).length
    },
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/cell-lock.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.before.pad.tx !== 73 || info.before.pad.ty !== 80) fail.push("pad " + JSON.stringify(info.before.pad));
if (info.before.door.tx !== 73 || info.before.door.ty !== 81) fail.push("door " + JSON.stringify(info.before.door));
if (info.before.chessToDoor !== 1) fail.push("pad not beside door " + info.before.chessToDoor);
if (info.before.pathOut !== 0) fail.push("path before should be blocked, got " + info.before.pathOut);
if (info.near.id !== "cellDoor") fail.push("near " + JSON.stringify(info.near));
if (info.after.locked || !info.after.open) fail.push("door after " + JSON.stringify(info.after));
if (info.after.freed !== 6 || !info.after.obj) fail.push("free " + JSON.stringify(info.after));
if (info.after.pathOut < 2) fail.push("path after " + info.after.pathOut);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
