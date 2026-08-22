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
  const dorm = H.map.buildings.find((b) => b.id === "dorm");
  const dormI = H.map.buildings.indexOf(dorm);
  const hatch = H.interactables.find((o) => o.id === "cellar");
  const jeong = H.interactables.find((o) => o.id === "jeong");
  const ji = H.idx(jeong.tx, jeong.ty);
  const wall4746 = H.idx(47, 46);
  const a = H.agents.find((x) => x.id === "haeju");

  a.tx = jeong.tx; a.ty = jeong.ty; a.level = 0; a.path = []; a.action = null; a.queue = [];
  const locked = (() => {
    H.interact(a);
    const warn = !a.action;
    a.action = null;
    return warn;
  })();
  hatch.locked = false;
  H.interact(a);
  const rescued = !!(a.action && /정필재/.test(a.action.label || ""));
  if (a.action && a.action.done) a.action.done();
  a.action = null;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    dorm: { id: dorm.id, x: dorm.x, y: dorm.y, w: dorm.w, h: dorm.h, i: dormI },
    hatch: { tx: hatch.tx, ty: hatch.ty },
    jeong: { tx: jeong.tx, ty: jeong.ty },
    jeongInside: H.map.inside[ji],
    jeongSolid: !!H.map.solid[ji],
    wall4746Solid: !!H.map.solid[wall4746],
    wall4746Inside: H.map.inside[wall4746],
    distHatch: Math.hypot(jeong.tx - hatch.tx, jeong.ty - hatch.ty),
    lockedBlocks: locked,
    rescued,
    freeJeong: !!H.state.objectives.freeJeong,
    testimony: !!H.state.evidence.testimony,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/jeong-yard.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.jeong.tx !== 47 || info.jeong.ty !== 47) fail.push("jeong tile " + JSON.stringify(info.jeong));
if (info.jeongInside === info.dorm.i) fail.push("jeong in dorm inside=" + info.jeongInside);
if (info.jeongInside >= 0) fail.push("jeong indoor " + info.jeongInside);
if (info.jeongSolid) fail.push("jeong solid");
if (!info.wall4746Solid) fail.push("47,46 should stay dorm wall");
if (info.hatch.tx !== 46 || info.hatch.ty !== 47) fail.push("hatch " + JSON.stringify(info.hatch));
if (info.distHatch > 1.01) fail.push("hatch dist " + info.distHatch);
if (!info.lockedBlocks) fail.push("locked hatch should block rescue");
if (!info.rescued || !info.freeJeong || !info.testimony) {
  fail.push("rescue " + JSON.stringify({ rescued: info.rescued, obj: info.freeJeong, ev: info.testimony }));
}
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
