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
  const a = H.agents[0];
  a.tx = 21.2; a.ty = 49.15; a.level = 0; a.path = []; a.action = null; a.queue = [];
  const near = H.nearestInteract(a);
  const stair = H.nearestInteract(a, null, { tx: 21, ty: 48 });
  const door = H.nearestInteract(a, null, { tx: 21, ty: 49 });
  const kind = (n) => n && (n.o.kind || n.type);
  const name = (n) => n && (n.o.name || n.o.id || n.o.label);
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    agent: { tx: a.tx, ty: a.ty },
    near: { type: near && near.type, kind: kind(near), name: name(near), d: near && near.d },
    stair: { type: stair && stair.type, kind: kind(stair), name: name(stair) },
    door: { type: door && door.type, kind: kind(door), name: name(door) },
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/click-interact.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.near.type !== "door") fail.push("near " + JSON.stringify(info.near));
if (info.stair.kind !== "stairs") fail.push("click stair " + JSON.stringify(info.stair));
if (info.door.type !== "door") fail.push("click door " + JSON.stringify(info.door));
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
