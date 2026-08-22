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
  H.state.paused = true;
  H.hoverPath.pts = [{ tx: 40, ty: 40 }, { tx: 44, ty: 42 }];
  H.hoverPath.hot = [false, true];
  H.hoverPath.tx = 44;
  H.hoverPath.ty = 42;
  const leftover = H.hoverPath.pts.length;
  const snap = H.snapshotSave();
  H.writeSave(true);
  H.continueMission();
  H.state.paused = true;
  const afterContinue = (H.hoverPath.pts || []).length;
  H.hoverPath.pts = [{ tx: 10, ty: 10 }];
  H.rebuildWorld();
  const afterRebuild = (H.hoverPath.pts || []).length;
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    leftover,
    afterContinue,
    afterRebuild,
    snapHasHover: Object.prototype.hasOwnProperty.call(snap, "hoverPath"),
    hasClear: typeof H.clearHoverPath === "function",
    phases,
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/hover-hud-after.png" });
await browser.close();

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasClear) fail.push("export");
if (info.leftover < 2) fail.push("leftover " + info.leftover);
if (info.afterContinue !== 0) fail.push("continue " + info.afterContinue);
if (info.afterRebuild !== 0) fail.push("rebuild " + info.afterRebuild);
if (info.snapHasHover) fail.push("snap hoverPath");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
