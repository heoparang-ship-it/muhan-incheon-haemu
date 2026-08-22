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
  const ISLAND = 7, CAVE = 8;
  const zoneOf = (g) => H.map.zone[H.idx(Math.round(g.tx), Math.round(g.ty))];
  const icAwake = () => H.guards.filter((g) => {
    const z = zoneOf(g);
    return (z === ISLAND || z === CAVE) && !g.unconscious && !g.left;
  });
  const leftOf = (list) => list.filter((g) => g.left);

  const beforeIc = icAwake().length;
  const beforeLeft = leftOf(H.guards).length;
  const beforeTotal = H.guards.filter((g) => !g.unconscious).length;

  H.folkStep("general", "cloth");
  H.folkStep("general", "lamp:a");
  H.folkStep("general", "lamp:b");
  const midIc = icAwake().length;
  H.folkStep("general", "lamp:c");

  const afterIc = icAwake().length;
  const left = H.guards.filter((g) => g.left);
  const leftOk = left.length === 4 && left.every((g) => g.unconscious && g.hidden && g.tied);
  const haeju = H.agents.find((a) => a.id === "haeju");
  haeju.tx = left[0].tx;
  haeju.ty = left[0].ty;
  const near = H.nearestInteract(haeju, 2.2);

  const snap = H.snapshotSave();
  const snapLeft = (snap.guards || []).filter((g) => g.left).length;
  H.rebuildWorld();
  H.applySave(snap);
  const afterLoadLeft = H.guards.filter((g) => g.left);
  const afterLoadIc = H.guards.filter((g) => {
    const z = H.map.zone[H.idx(Math.round(g.tx), Math.round(g.ty))];
    return (z === ISLAND || z === CAVE) && !g.unconscious && !g.left;
  }).length;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    beforeIc,
    beforeLeft,
    beforeTotal,
    midIc,
    afterIc,
    leftCount: left.length,
    leftIds: left.map((g) => g.id),
    leftOk,
    nearType: near && near.type,
    snapLeft,
    loadLeft: afterLoadLeft.length,
    loadLeftOk: afterLoadLeft.every((g) => g.unconscious && g.hidden && g.left),
    afterLoadIc,
    folkDone: !!(H.state.folklore.general && H.state.folklore.general.done),
    islandFlag: !!H.state.islandGuardsRemoved,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const g = H.guards.find((x) => x.left) || H.guards.find((x) => x.id === "g15");
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (g && haeju) {
    haeju.tx = 69;
    haeju.ty = 69;
    H.state.selected = "haeju";
    if (H.centerOnSelected) H.centerOnSelected();
  }
  return { left: H.guards.filter((x) => x.left).length, tx: 69, ty: 69 };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/folk-leave-qa.png" });
await page.screenshot({ path: "/workspace/screenshots/folk-leave-island.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.beforeIc !== 7) fail.push("before ic " + info.beforeIc);
if (info.beforeLeft !== 0) fail.push("already left");
if (info.midIc !== info.beforeIc) fail.push("left before 4th step");
if (info.afterIc !== 3) fail.push("after ic " + info.afterIc);
if (info.leftCount !== 4) fail.push("left " + info.leftCount);
if (!info.leftOk) fail.push("left flags");
if (info.nearType === "body") fail.push("left still body");
if (info.snapLeft !== 4) fail.push("snap " + info.snapLeft);
if (info.loadLeft !== 4 || !info.loadLeftOk) fail.push("load left");
if (info.afterLoadIc !== 3) fail.push("load ic " + info.afterLoadIc);
if (!info.folkDone) fail.push("folk not done");
if (!info.islandFlag) fail.push("flag");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
