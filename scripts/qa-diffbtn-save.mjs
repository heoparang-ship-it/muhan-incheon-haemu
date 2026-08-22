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
  const buttons = () => [...document.querySelectorAll("#diffRow button")].map((b) => ({
    d: b.getAttribute("data-diff"),
    on: b.classList.contains("on"),
  }));

  H.state.difficulty = "hard";
  H.writeSave(true);
  const afterSave = { chosen: H.chosenDiff(), buttons: buttons(), snap: H.snapshotSave().difficulty };

  H.syncDiffButtons("easy");
  const afterEasy = { chosen: H.chosenDiff(), buttons: buttons() };

  H.refreshTitleMeta();
  const afterRefresh = { chosen: H.chosenDiff(), buttons: buttons() };

  H.syncDiffButtons("easy");
  H.continueMission();
  const afterContinue = { play: H.state.difficulty, chosen: H.chosenDiff() };

  H.goTitle();
  const afterTitle = { chosen: H.chosenDiff(), buttons: buttons(), play: H.state.difficulty };

  const old = H.snapshotSave();
  delete old.difficulty;
  H.syncDiffButtons("easy");
  H.rebuildWorld();
  H.applySave(old);
  const afterOld = { play: H.state.difficulty, chosen: H.chosenDiff() };
  H.refreshTitleMeta();
  const afterOldRefresh = { chosen: H.chosenDiff(), buttons: buttons() };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    afterSave,
    afterEasy,
    afterRefresh,
    afterContinue,
    afterTitle,
    afterOld,
    afterOldRefresh,
    hasSync: typeof H.syncDiffButtons === "function",
    hasRefresh: typeof H.refreshTitleMeta === "function",
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.difficulty = "hard";
  H.writeSave(true);
  H.goTitle();
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/diffbtn-save-after.png" });

await page.evaluate(() => {
  window.__HAEMU__.syncDiffButtons("easy");
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/diffbtn-save-clear.png" });

const onOf = (row) => (row.buttons || []).filter((b) => b.on).map((b) => b.d).join(",");
const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasSync || !info.hasRefresh) fail.push("export");
if (info.afterSave.snap !== "hard") fail.push("snap " + info.afterSave.snap);
if (info.afterSave.chosen !== "hard" || onOf(info.afterSave) !== "hard") fail.push("save btn " + onOf(info.afterSave));
if (info.afterEasy.chosen !== "easy" || onOf(info.afterEasy) !== "easy") fail.push("easy " + onOf(info.afterEasy));
if (info.afterRefresh.chosen !== "hard" || onOf(info.afterRefresh) !== "hard") fail.push("refresh " + onOf(info.afterRefresh));
if (info.afterContinue.play !== "hard") fail.push("continue play " + info.afterContinue.play);
if (info.afterTitle.chosen !== "hard" || onOf(info.afterTitle) !== "hard") fail.push("title " + onOf(info.afterTitle));
if (info.afterTitle.play !== "hard") fail.push("title play " + info.afterTitle.play);
if (info.afterOld.play !== "easy") fail.push("old play " + info.afterOld.play);
if (info.afterOldRefresh.chosen !== "hard" || onOf(info.afterOldRefresh) !== "hard") fail.push("old refresh " + onOf(info.afterOldRefresh));
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
