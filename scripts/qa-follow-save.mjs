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
  const haeju = H.agents.find((a) => a.id === "haeju");
  const civ = H.civilians.find((c) => c.type === "villager");
  civ.following = haeju;
  const snap = H.snapshotSave();
  const rec = snap.civilians.find((c) => c.id === civ.id);

  H.rebuildWorld();
  H.applySave(snap);
  const after = H.civilians.find((c) => c.id === civ.id);
  const stillHaeju = !!(after.following && after.following.id === "haeju");
  const dropped = !(after.following && after.following.alive);

  /* 예전 저장(following: true) — 선택 대원에게 붙는다 */
  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldCiv = old.civilians.find((c) => c.id === civ.id);
  oldCiv.following = true;
  H.applySave(old);
  const oldAfter = H.civilians.find((c) => c.id === civ.id);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapFollowing: rec.following,
    stillHaeju, dropped,
    afterId: after.following && after.following.id,
    oldAfterId: oldAfter.following && oldAfter.following.id,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

await page.screenshot({ path: "/workspace/screenshots/follow-save.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapFollowing !== "haeju") fail.push("snap " + info.snapFollowing);
if (!info.stillHaeju || info.dropped) fail.push("after " + JSON.stringify({ id: info.afterId, dropped: info.dropped }));
if (info.oldAfterId !== "haeju") fail.push("old save " + info.oldAfterId);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
