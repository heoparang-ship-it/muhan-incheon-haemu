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
  const cellI = H.map.buildings.indexOf(cell);
  const interiors = new Set(cell.interiorTiles || []);
  const prisoners = H.civilians.filter((c) => c.type === "prisoner").map((c) => {
    const x = Math.round(c.tx), y = Math.round(c.ty);
    const i = H.idx(x, y);
    return {
      id: c.id, tx: c.tx, ty: c.ty,
      inside: H.map.inside[i],
      inInterior: interiors.has(i),
      solid: !!H.map.solid[i],
      outsideTile: x === 75 && y === 81
    };
  });
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    cell: { id: cell.id, x: cell.x, y: cell.y, w: cell.w, h: cell.h, i: cellI, interiors: interiors.size },
    prisoners,
    insideCount: prisoners.filter((p) => p.inside === cellI && p.inInterior).length,
    outsideCount: prisoners.filter((p) => p.inside !== cellI || !p.inInterior || p.outsideTile).length,
    at7581: prisoners.filter((p) => p.outsideTile).length,
    door: cell.door && { tx: cell.door.tx, ty: cell.door.ty, locked: cell.door.locked },
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/cell-prisoners.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.prisoners.length !== 6) fail.push("count " + info.prisoners.length);
if (info.insideCount !== 6) fail.push("inside " + info.insideCount + " " + JSON.stringify(info.prisoners));
if (info.outsideCount !== 0) fail.push("outside " + info.outsideCount);
if (info.at7581 !== 0) fail.push("still at 75,81");
if (!info.door || !info.door.locked) fail.push("door " + JSON.stringify(info.door));
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
