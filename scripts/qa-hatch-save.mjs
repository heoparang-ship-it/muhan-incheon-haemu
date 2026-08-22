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
  const hatch0 = H.interactables.find((o) => o.id === "cellar");
  const freshLocked = !!hatch0.locked;

  hatch0.locked = false;
  hatch0.done = true;
  const snap = H.snapshotSave();
  const snapHatch = (snap.interactables || []).find((o) => o.id === "cellar");

  H.rebuildWorld();
  H.applySave(snap);
  const after = H.interactables.find((o) => o.id === "cellar");
  const jeong = H.interactables.find((o) => o.id === "jeong");
  const a = H.agents.find((x) => x.id === "haeju");
  a.tx = jeong.tx; a.ty = jeong.ty; a.path = []; a.action = null; a.queue = [];
  H.interact(a);
  const blocked = !a.action;
  const rescued = !!(a.action && /정필재/.test(a.action.label || ""));
  if (a.action && a.action.done) a.action.done();
  a.action = null;
  const freeJeong = !!H.state.objectives.freeJeong;
  const testimony = !!H.state.evidence.testimony;

  /* 예전 저장(locked 필드 없음) */
  H.rebuildWorld();
  const old = H.snapshotSave();
  old.interactables = [{ id: "cellar", taken: false, done: true }];
  H.applySave(old);
  const oldAfter = H.interactables.find((o) => o.id === "cellar");

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    freshLocked,
    snapHatch,
    after: { locked: !!after.locked, done: !!after.done },
    blocked, rescued, freeJeong, testimony,
    oldAfter: { locked: !!oldAfter.locked, done: !!oldAfter.done },
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/hatch-save.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.freshLocked) fail.push("fresh hatch should start locked");
if (!info.snapHatch || info.snapHatch.locked !== false || !info.snapHatch.done) {
  fail.push("snap " + JSON.stringify(info.snapHatch));
}
if (info.after.locked || !info.after.done) fail.push("after load " + JSON.stringify(info.after));
if (info.blocked || !info.rescued || !info.freeJeong || !info.testimony) {
  fail.push("rescue " + JSON.stringify({ blocked: info.blocked, rescued: info.rescued, obj: info.freeJeong, ev: info.testimony }));
}
if (info.oldAfter.locked || !info.oldAfter.done) fail.push("old save " + JSON.stringify(info.oldAfter));
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
