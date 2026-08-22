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
  const vis = () => {
    const el = document.getElementById("tutorial");
    return !!(el && !el.hidden);
  };

  H.setTutorialDismissed(true);
  const snapOn = H.snapshotSave();
  const hidOn = !vis();

  H.rebuildWorld();
  const wipedFlag = !!H.state.tutorialDismissed;
  const wipedVis = vis();

  H.applySave(snapOn);
  const afterFlag = !!H.state.tutorialDismissed;
  const afterVis = vis();

  H.setTutorialDismissed(false);
  const snapOff = H.snapshotSave();
  H.setTutorialDismissed(true);
  H.applySave(snapOff);
  const afterOff = !!H.state.tutorialDismissed;
  const afterOffVis = vis();

  const old = H.snapshotSave();
  delete old.tutorialDismissed;
  H.setTutorialDismissed(true);
  H.applySave(old);
  const oldFlag = !!H.state.tutorialDismissed;
  const oldVis = vis();

  H.setTutorialDismissed(true);
  H.writeSave(true);
  H.continueMission();
  const contFlag = !!H.state.tutorialDismissed;
  const contVis = vis();

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapOn: !!snapOn.tutorialDismissed,
    hidOn,
    wipedFlag,
    wipedVis,
    afterFlag,
    afterVis,
    afterOff,
    afterOffVis,
    oldFlag,
    oldVis,
    contFlag,
    contVis,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.setTutorialDismissed(true);
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.0;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 첫 동선이 닫혀 있다";
    box.appendChild(el);
  }
  const tut = document.getElementById("tutorial");
  return { dismissed: !!H.state.tutorialDismissed, hidden: !!(tut && tut.hidden) };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/tut-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  H.centerOnSelected();
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/tut-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.snapOn !== true) fail.push("snapOn " + info.snapOn);
if (info.hidOn !== true) fail.push("hidOn");
if (info.wipedFlag !== false || info.wipedVis !== true) fail.push("wiped " + info.wipedFlag + "/" + info.wipedVis);
if (info.afterFlag !== true || info.afterVis !== false) fail.push("after " + info.afterFlag + "/" + info.afterVis);
if (info.afterOff !== false || info.afterOffVis !== true) fail.push("afterOff " + info.afterOff + "/" + info.afterOffVis);
if (info.oldFlag !== false || info.oldVis !== true) fail.push("old " + info.oldFlag + "/" + info.oldVis);
if (info.contFlag !== true || info.contVis !== false) fail.push("continue " + info.contFlag + "/" + info.contVis);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
