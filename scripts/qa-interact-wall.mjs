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
await page.waitForFunction(() => window.__HAEMU__?.map && window.__HAEMU__?.interactReachable, { timeout: 20000 });

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents.find((x) => x.id === "haeju");
  const office = H.map.doors.find((d) => d.id === "officeDoor");
  const chapel = H.map.doors.find((d) => d.id === "chapelDoor");
  const seal = H.interactables.find((o) => o.id === "deadSeal");
  const ord = H.interactables.find((o) => o.id === "forgedOrd");

  function place(tx, ty) {
    a.tx = tx; a.ty = ty; a.level = 0; a.path = []; a.action = null; a.queue = [];
  }
  function kind(n) { return n && (n.o.kind || n.type); }
  function id(n) { return n && (n.o.id || n.o.name || n.o.label); }

  place(53, 44);
  const yardSeal = H.nearestInteract(a);
  const yardReachSeal = H.interactReachable(53, 44, seal.tx, seal.ty);
  H.interact(a);
  const yardTook = !!(a.action && /인장/.test(a.action.label || ""));
  if (a.action) a.action = null;

  place(52, 44);
  const yardOrd = H.nearestInteract(a);
  const yardReachOrd = H.interactReachable(52, 44, ord.tx, ord.ty);

  place(53, 40);
  const onClosedDoor = H.nearestInteract(a);
  const doorReachSeal = H.interactReachable(53, 40, seal.tx, seal.ty);

  office.open = true;
  place(53, 41);
  const inside = H.nearestInteract(a);
  const insideReach = H.interactReachable(53, 41, seal.tx, seal.ty);
  H.interact(a);
  const insideTook = !!(a.action && /인장/.test(a.action.label || ""));
  if (a.action && a.action.done) a.action.done();
  a.action = null;

  place(39, 35);
  const chapelFromYard = H.nearestInteract(a);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    seal: { tx: seal.tx, ty: seal.ty },
    ord: { tx: ord.tx, ty: ord.ty },
    officeDoor: { tx: office.tx, ty: office.ty, locked: office.locked },
    chapelDoor: { tx: chapel.tx, ty: chapel.ty },
    yardSeal: { kind: kind(yardSeal), id: id(yardSeal), d: yardSeal && +yardSeal.d.toFixed(3) },
    yardOrd: { kind: kind(yardOrd), id: id(yardOrd) },
    yardReachSeal, yardReachOrd, yardTook,
    onClosedDoor: { kind: kind(onClosedDoor), id: id(onClosedDoor) },
    doorReachSeal,
    inside: { kind: kind(inside), id: id(inside) },
    insideReach, insideTook,
    chapelFromYard: { kind: kind(chapelFromYard), id: id(chapelFromYard) },
    evidenceAfter: Object.keys(H.state.evidence),
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/interact-wall.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.yardReachSeal || info.yardTook || info.yardSeal.kind === "evidence") {
  fail.push("yard seal " + JSON.stringify({ r: info.yardReachSeal, took: info.yardTook, n: info.yardSeal }));
}
if (info.yardReachOrd || info.yardOrd.kind === "evidence") {
  fail.push("yard ord " + JSON.stringify({ r: info.yardReachOrd, n: info.yardOrd }));
}
if (info.doorReachSeal) fail.push("closed door reach " + info.doorReachSeal);
if (info.onClosedDoor.id !== "officeDoor") fail.push("on door " + JSON.stringify(info.onClosedDoor));
if (!info.insideReach || info.inside.id !== "deadSeal" || !info.insideTook) {
  fail.push("inside " + JSON.stringify({ r: info.insideReach, n: info.inside, took: info.insideTook }));
}
if (info.chapelFromYard.id !== "chapelDoor") fail.push("chapel door " + JSON.stringify(info.chapelFromYard));
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
