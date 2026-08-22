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
  const m = H.map;
  const N = H.MAP_W * H.MAP_H;
  const wallB = m.buildings.find((b) => b.kind === "wall");
  const west = H.idx(32, 27);
  const chapelWin = H.hasSight(40.5, 28.5, 40.5, 30.5, 1.6, 0.85, 0, 0);
  const chapelWall = H.hasSight(41.5, 28.5, 41.5, 30.5, 1.6, 0.85, 0, 0);
  const compound = H.hasSight(31.5, 27.5, 53.5, 27.5, 1.6, 0.85, 0, 0);
  const two = m.buildings.filter((b) => b.stair);
  const floor1 = two.map((s) => {
    const dummy = { level: 1, waterWalk: false, climb: false, tx: s.stair.tx, ty: s.stair.ty };
    let walk = 0, reach = 0;
    for (let i = 0; i < N; i++) {
      if (!m.walk1[i] || m.inside[i] !== m.buildings.indexOf(s)) continue;
      walk++;
      const tx = i % H.MAP_W, ty = (i / H.MAP_W) | 0;
      if (tx === s.stair.tx && ty === s.stair.ty) { reach++; continue; }
      if (H.findPath(s.stair.tx, s.stair.ty, tx, ty, dummy).length) reach++;
    }
    return { id: s.id, walk, reach, stair: [s.stair.tx, s.stair.ty] };
  });

  const a = H.agents[0];
  a.tx = 21; a.ty = 47; a.level = 0; a.path = []; a.action = null; a.queue = []; a.pendingLevel = null;
  H.interact(a);
  const far = { level: a.level, path: a.path.length, pending: a.pendingLevel, action: !!(a.action) };
  if (a.path && a.path.length) {
    const last = a.path[a.path.length - 1];
    a.tx = last.tx; a.ty = last.ty; a.path = [];
    if (a.pendingLevel != null && m.stair[H.idx(Math.round(a.tx), Math.round(a.ty))]) {
      a.level = a.pendingLevel; a.pendingLevel = null;
    }
  }
  const arrived = { level: a.level, pending: a.pendingLevel, onStair: !!m.stair[H.idx(Math.round(a.tx), Math.round(a.ty))] };

  a.tx = 21; a.ty = 48; a.level = 0; a.path = []; a.pendingLevel = null; a.action = null;
  H.interact(a);
  const onStair = { level: a.level };

  const phases = [0, 0.34, 0.5, 0.72, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const expect = -0.34 + (0.40 - (-0.34)) * e;
    const st = H.tideStage();
    return { p, wl: H.waterLevel(), expect, st, name: ["저조", "들물", "만조"][st] };
  });

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    wallH: wallB && wallB.wallH,
    westBlock: m.blockH[west],
    chapelWin, chapelWall, compound,
    floor1, far, arrived, onStair,
    tide: { phases },
    winN: (() => { let n = 0; for (let i = 0; i < N; i++) if (m.window[i]) n++; return n; })()
  };
});

await page.screenshot({ path: "/workspace/screenshots/playtest-los.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.wallH !== 1.6) fail.push("wallH " + info.wallH);
if (Math.abs(info.westBlock - 1.6) > 1e-6) fail.push("west blockH " + info.westBlock);
if (info.chapelWin !== true) fail.push("chapel window blocked");
if (info.chapelWall !== false) fail.push("chapel wall leaked");
if (info.compound !== false) fail.push("compound leaked");
if (!info.floor1.length || info.floor1.some((s) => s.walk !== s.reach || !s.walk)) fail.push("2F " + JSON.stringify(info.floor1));
if (info.far.level !== 0 || info.far.pending !== 1 || info.far.action) fail.push("far stair " + JSON.stringify(info.far));
if (info.arrived.level !== 1 || !info.arrived.onStair) fail.push("arrive " + JSON.stringify(info.arrived));
if (info.onStair.level !== 1) fail.push("on stair " + JSON.stringify(info.onStair));
if (!info.tide.phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12)) fail.push("tide formula");
if (info.tide.phases[0].name !== "저조" || info.tide.phases[2].name !== "들물" || info.tide.phases[4].name !== "만조") fail.push("tide names");
if (info.winN !== 33) fail.push("windows " + info.winN);
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
