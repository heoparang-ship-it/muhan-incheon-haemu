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

const setup = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const wolsim = H.agents.find((a) => a.id === "wolsim");
  H.state.targetMode = { kind: "lure", agent: wolsim };
  const snap = H.snapshotSave();
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    hasTarget: !!(H.state.targetMode && H.state.targetMode.kind === "lure"),
    snapHasTarget: Object.prototype.hasOwnProperty.call(snap, "targetMode"),
  };
});

await page.locator("body").press("Escape");
await page.waitForTimeout(160);

const afterEsc = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const pm = document.getElementById("pauseMenu");
  const help = document.getElementById("help");
  const toast = document.getElementById("toast");
  return {
    target: H.state.targetMode,
    menuPause: !!H.state.menuPause,
    pauseShow: !!(pm && pm.classList.contains("show")),
    helpShow: !!(help && help.classList.contains("show")),
    toast: toast ? toast.textContent : "",
  };
});

await page.screenshot({ path: "/workspace/screenshots/targetesc-hud-after.png" });

await page.locator("body").press("Escape");
await page.waitForTimeout(160);

const afterPause = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const pm = document.getElementById("pauseMenu");
  return {
    menuPause: !!H.state.menuPause,
    pauseShow: !!(pm && pm.classList.contains("show")),
    target: H.state.targetMode,
  };
});

await page.screenshot({ path: "/workspace/screenshots/targetesc-hud-pause.png" });

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.setMenuPause(false);
  const wolsim = H.agents.find((a) => a.id === "wolsim");
  H.state.targetMode = { kind: "lure", agent: wolsim };
  H.writeSave(true);
  H.continueMission();
  H.state.paused = true;
  const afterContinue = H.state.targetMode;
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return { afterContinue, phases };
});

await browser.close();

const fail = [];
if (setup.map[0] !== 96 || setup.map[1] !== 96) fail.push("map " + setup.map);
if (setup.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + setup.roles);
if (!setup.hasTarget) fail.push("setup target");
if (setup.snapHasTarget) fail.push("snap targetMode");
if (afterEsc.target) fail.push("esc target " + JSON.stringify(afterEsc.target));
if (afterEsc.menuPause || afterEsc.pauseShow) fail.push("esc opened pause");
if (afterEsc.helpShow) fail.push("esc opened help");
if (!String(afterEsc.toast || "").includes("지정을 취소했다")) fail.push("esc toast " + afterEsc.toast);
if (!afterPause.menuPause || !afterPause.pauseShow) fail.push("second esc pause");
if (afterPause.target) fail.push("pause still targeting");
if (info.afterContinue) fail.push("continue target");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, setup, afterEsc, afterPause, info };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
