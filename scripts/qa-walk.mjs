import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/artifacts/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://127.0.0.1:8080/index.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 10000 });
await page.locator("#startBtn").click();
await page.waitForFunction(() => window.__HAEMU__?.state?.running, { timeout: 15000 });
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const before = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const ids = ["agent_haeju", "agent_mujin", "agent_dochi", "agent_wolsim", "guard_steward", "civil_villager"];
  const sheets = {};
  for (const id of ids) {
    const rec = H.ART.img[id];
    const walk = rec && rec.sheets && rec.sheets.walk;
    sheets[id] = {
      idle: !!(rec && rec.sheets && rec.sheets.idle && rec.sheets.idle.naturalWidth),
      walk: !!(walk && walk.naturalWidth),
      walkW: walk && walk.naturalWidth,
      walkH: walk && walk.naturalHeight,
      frames: rec && rec.meta && rec.meta.clips && (rec.meta.clips.find((c) => c.key === "walk") || {}).frames,
    };
  }
  return {
    running: H.state.running,
    agents: H.agents.length,
    wall: !!(H.ART.img.bld_wall && H.ART.img.bld_wall.sheets.idle && H.ART.img.bld_wall.sheets.idle.naturalWidth),
    sheets,
  };
});

await page.screenshot({ path: "/workspace/artifacts/screenshots/walk-title-ingame.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const a of H.agents) {
    H.setPath(a, a.tx + 6, a.ty - 2);
  }
});
await page.waitForTimeout(2400);
await page.screenshot({ path: "/workspace/artifacts/screenshots/walk-agents-moving.png" });

const after = await page.evaluate(() => {
  const H = window.__HAEMU__;
  return H.agents.map((a) => ({
    id: a.id,
    moveT: a.moveT,
    path: a.path && a.path.length,
    bob: +a.bob.toFixed(2),
  }));
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents[0];
  H.selectAgent(a);
  H.centerOnSelected();
  H.cam.zoom = 1.35;
});
await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/artifacts/screenshots/walk-closeup.png" });

const fail = [];
if (!before.running) fail.push("not running");
if (before.agents !== 4) fail.push("agents " + before.agents);
if (!before.wall) fail.push("wall missing");
for (const [id, s] of Object.entries(before.sheets)) {
  if (!s.walk || s.walkW !== 224 || s.walkH !== 304 || s.frames !== 4) {
    fail.push("sheet " + id + " " + JSON.stringify(s));
  }
}
if (!after.some((a) => a.path > 0 || a.moveT > 0 || a.bob > 0.2)) fail.push("nobody walked " + JSON.stringify(after));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ before, after, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
