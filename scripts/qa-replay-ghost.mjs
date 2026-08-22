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
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const moved = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents.find((x) => x.id === "haeju");
  const from = [a.tx, a.ty];
  const ok = H.setPath(a, a.tx + 8, a.ty - 2);
  const path = [
    [23, 65], [26, 62], [30, 58], [34, 54], [38, 50], [42, 46]
  ];
  for (const [tx, ty] of path) {
    a.tx = tx; a.ty = ty;
    H.state.timeLeft -= 3;
    H.recordReplay();
  }
  const b = H.agents.find((x) => x.id === "mujin");
  b.tx += 4; b.ty -= 2;
  H.state.timeLeft -= 2;
  H.recordReplay();
  return { ok, from, pathLen: a.path && a.path.length, info: H.replayInfo() };
});

const beforeEnd = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.recordReplay();
  const info = H.replayInfo();
  const snap = H.snapshotSave();
  return {
    running: H.state.running,
    haeju: { tx: H.agents[0].tx, ty: H.agents[0].ty },
    info,
    saveHasReplay: !!(snap.replay && snap.replay.trails && snap.replay.trails.haeju),
    savePts: snap.replay && snap.replay.trails && snap.replay.trails.haeju
      ? snap.replay.trails.haeju.length : 0,
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((a) => a.id)
  };
});

await page.evaluate(() => window.__HAEMU__.missionComplete());
await page.waitForSelector("#result.show", { timeout: 5000 });
await page.waitForTimeout(700);

const after = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const box = document.getElementById("replayBox");
  const canvas = document.getElementById("replayMap");
  const legend = document.getElementById("replayLegend");
  return {
    info: H.replayInfo(),
    boxHidden: !!(box && box.hidden),
    canvasW: canvas && canvas.width,
    canvasH: canvas && canvas.height,
    legend: legend && legend.textContent,
    resultTitle: document.getElementById("resultTitle") && document.getElementById("resultTitle").textContent,
    ended: H.state.ended
  };
});
await page.screenshot({ path: "/workspace/screenshots/replay-result.png" });

const fail = [];
if (!moved.ok) fail.push("path failed " + JSON.stringify(moved));
if (beforeEnd.map[0] !== 96 || beforeEnd.map[1] !== 96) fail.push("map " + beforeEnd.map);
if (beforeEnd.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + beforeEnd.roles);
if (!beforeEnd.info.counts.haeju || beforeEnd.info.counts.haeju < 6) fail.push("haeju pts " + (beforeEnd.info.counts && beforeEnd.info.counts.haeju));
if (!beforeEnd.info.counts.mujin || beforeEnd.info.counts.mujin < 2) fail.push("mujin pts " + (beforeEnd.info.counts && beforeEnd.info.counts.mujin));
if (!beforeEnd.saveHasReplay || beforeEnd.savePts < 6) fail.push("save replay " + beforeEnd.savePts);
if (after.boxHidden) fail.push("replay box hidden");
if (!after.info.boxOpen) fail.push("box not open");
if (after.canvasW !== 472 || after.canvasH !== 264) fail.push("canvas " + after.canvasW + "x" + after.canvasH);
if (!after.legend || after.legend.indexOf("윤해주") < 0 || after.legend.indexOf("월심") < 0) fail.push("legend " + after.legend);
if (!after.ended) fail.push("not ended");
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ moved, beforeEnd, after, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
