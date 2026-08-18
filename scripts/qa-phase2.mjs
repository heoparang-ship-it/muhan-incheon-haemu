import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const iPhone = devices["iPhone 14 Pro"] || devices["iPhone 13 Pro"];
const ctx = await browser.newContext({
  ...iPhone,
  viewport: { width: 932, height: 430 },
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 8000 });

const titleDiff = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("#diffRow button")].map((b) => b.dataset.diff);
  return { btns, hasVol: !!document.getElementById("volSlider"), hasSquad: !!document.getElementById("squadBtn") };
});

await page.locator("#startBtn").tap();
await page.waitForTimeout(1800);
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const core = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const kilns = H.map.props.filter((p) => p.kind === "kiln");
  const crates = H.map.props.filter((p) => p.kind === "crate");
  const lamps = H.map.lamps || [];
  const lamp2913 = lamps.some((l) => Math.abs(l.tx - 29) < 2 && Math.abs(l.ty - 13) < 2);
  return {
    running: H.state.running,
    agents: H.agents.length,
    guards: H.guards.length,
    difficulty: H.state.difficulty,
    vis: H.diff().vis,
    wake: H.wakeMs(),
    reinforceCap: H.diff().reinforce,
    inner: H.VISION.INNER_RANGE,
    kilns: kilns.length,
    crates: crates.length,
    lamps: lamps.length,
    lamp2913,
    squadBtn: !!document.getElementById("squadBtn"),
  };
});

const check = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const a = H.agents[0];
  const g = H.guards.find((x) => x.type === "steward");
  H.startStewardCheck(g, a);
  const holding = a.checkHold;
  const moved = H.setPath(a, a.tx + 3, a.ty);
  return { holding, moved, disguise: a.disguise, failHold: a.checkHold };
});

const squad = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.squad = ["haeju", "mujin"];
  const a = H.agents[0];
  const ok = H.moveSquad(a.tx + 3, a.ty - 2);
  return { ok, n: H.selectedSquad().length, paths: H.agents.filter((x) => x.path && x.path.length).length };
});

const save = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.stats.knockouts = 3;
  H.state.difficulty = "hard";
  H.writeSave(true, 0);
  const snap = H.readSave(0);
  return { ver: snap && snap.version, ko: snap && snap.stats && snap.stats.knockouts, diff: snap && snap.difficulty };
});

const hard = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.setDiff("hard");
  H.rebuildWorld();
  H.beginMission({ quiet: true });
  return { d: H.state.difficulty, vis: H.diff().vis, wake: H.wakeMs(), cap: H.diff().reinforce };
});

const easyRe = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.setDiff("easy");
  H.rebuildWorld();
  H.beginMission({ quiet: true });
  const n0 = H.guards.length;
  H.spawnReinforcements(40, 40);
  return { cap: H.diff().reinforce, n0, n1: H.guards.length };
});

const lamp = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const l = H.map.lamps[0];
  l.on = false; l.offAt = H.state.now - 13000;
  H.updateLamps();
  return { relighter: !!l.relighter, ai: (H.guards.find((g) => g.id === l.relighter) || {}).ai };
});

await page.screenshot({ path: "/workspace/screenshots/phase2-play.png" });

const fail = [];
if (!titleDiff.btns.includes("easy") || !titleDiff.hasVol || !titleDiff.hasSquad) fail.push("title ui " + JSON.stringify(titleDiff));
if (!core.running || core.agents !== 4 || core.guards < 20) fail.push("boot " + JSON.stringify(core));
if (core.inner !== 0.6) fail.push("vision inner");
if (core.kilns < 2) fail.push("kilns " + core.kilns);
if (core.crates < 4) fail.push("crates " + core.crates);
if (!core.lamp2913) fail.push("beacon lamp missing");
if (!(check.holding > 2) || check.moved) fail.push("check " + JSON.stringify(check));
if (!squad.ok || squad.n < 2) fail.push("squad " + JSON.stringify(squad));
if (save.ver !== 3 || save.ko !== 3 || save.diff !== "hard") fail.push("save " + JSON.stringify(save));
if (hard.vis !== 1.15 || hard.wake !== 55000 || hard.cap !== 2) fail.push("hard " + JSON.stringify(hard));
if (easyRe.n1 !== easyRe.n0) fail.push("easy reinforce " + JSON.stringify(easyRe));
if (!lamp.relighter || lamp.ai !== "relight") fail.push("lamp " + JSON.stringify(lamp));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ titleDiff, core, check, squad, save, hard, easyRe, lamp, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
