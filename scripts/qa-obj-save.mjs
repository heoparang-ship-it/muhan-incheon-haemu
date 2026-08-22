import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8080;
const BASE = `http://127.0.0.1:${PORT}/game/`;
const shotDir = path.join(process.cwd(), "screenshots");
fs.mkdirSync(shotDir, { recursive: true });

function probe() {
  return new Promise((resolve) => {
    const req = http.get(BASE, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

if (!(await probe())) {
  console.error("http://127.0.0.1:8080/game/ 가 응답하지 않는다. 먼저 python3 -m http.server 8080 --bind 127.0.0.1");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForFunction(() => window.__HAEMU__ && window.__HAEMU__.state, { timeout: 15000 });
await page.waitForTimeout(400);

const result = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const tideAt = (phase) => {
    H.state.tidePhase = phase;
    return H.waterLevel();
  };
  const panel = () => {
    const el = document.getElementById("objectives");
    return {
      open: !!H.state.objectivesOpen,
      collapsed: !!(el && el.classList.contains("collapsed")),
      userOpen: el ? el.dataset.userOpen : "",
    };
  };

  H.setObjectivesOpen(false);
  const afterFold = panel();
  const snap = H.snapshotSave();

  H.rebuildWorld();
  const afterRebuild = panel();

  H.applySave(snap);
  const afterApply = panel();

  H.continueMission();
  const afterContinue = panel();

  const old = H.snapshotSave();
  delete old.objectivesOpen;
  H.applySave(old);
  const afterOld = panel();

  return {
    map: [H.MAP.W, H.MAP.H],
    roles: H.state.agents.map((a) => a.id),
    tide: [0, 0.5, 1].map((p) => [p, tideAt(p)]),
    afterFold,
    snapOpen: snap.objectivesOpen,
    afterRebuild,
    afterApply,
    afterContinue,
    afterOld,
    hasSet: typeof H.setObjectivesOpen === "function",
    noObjectivesField: !("objectives" in snap && snap.objectives === snap.objectivesOpen),
  };
});

await page.screenshot({ path: path.join(shotDir, "obj-save-after.png"), fullPage: false });

await page.evaluate(() => {
  window.__HAEMU__.rebuildWorld();
});
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(shotDir, "obj-save-clear.png"), fullPage: false });

await browser.close();

const fail = [];
if (result.map[0] !== 96 || result.map[1] !== 96) fail.push(`map ${result.map}`);
if (result.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push(`roles ${result.roles}`);
if (Math.abs(result.tide[0][1] + 0.34) > 1e-9) fail.push(`tide0 ${result.tide[0][1]}`);
if (Math.abs(result.tide[1][1] - 0.03) > 1e-9) fail.push(`tide05 ${result.tide[1][1]}`);
if (Math.abs(result.tide[2][1] - 0.4) > 1e-9) fail.push(`tide1 ${result.tide[2][1]}`);
if (!result.hasSet) fail.push("setObjectivesOpen 없음");
if (result.afterFold.open || !result.afterFold.collapsed) fail.push(`fold ${JSON.stringify(result.afterFold)}`);
if (result.snapOpen !== false) fail.push(`snap ${result.snapOpen}`);
if (!result.afterRebuild.open || result.afterRebuild.collapsed) fail.push(`rebuild ${JSON.stringify(result.afterRebuild)}`);
if (result.afterApply.open || !result.afterApply.collapsed) fail.push(`apply ${JSON.stringify(result.afterApply)}`);
if (result.afterContinue.open || !result.afterContinue.collapsed) fail.push(`continue ${JSON.stringify(result.afterContinue)}`);
if (!result.afterOld.open || result.afterOld.collapsed) fail.push(`old ${JSON.stringify(result.afterOld)}`);
if (errors.length) fail.push(`console ${errors.length}: ${errors.join(" | ")}`);

const out = {
  ok: fail.length === 0,
  fail,
  errors,
  result,
};
console.log(JSON.stringify(out, null, 2));
if (fail.length) process.exit(1);
