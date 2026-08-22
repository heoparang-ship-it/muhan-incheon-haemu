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
  const a = H.agents.find((x) => x.id === "haeju");
  a.tx = 61; a.ty = 26;
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.zoom = H.cam.targetZoom = 1.2;
  const want = { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };

  const snap = H.snapshotSave();
  const rec = snap.cam;

  H.rebuildWorld();
  const wiped = { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };

  H.applySave(snap);
  const after = { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };

  H.rebuildWorld();
  const old = H.snapshotSave();
  delete old.cam;
  H.applySave(old);
  const oldCam = { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };

  H.rebuildWorld();
  const a2 = H.agents.find((x) => x.id === "haeju");
  a2.tx = 61; a2.ty = 26;
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.zoom = H.cam.targetZoom = 1.2;
  const want2 = { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };
  H.writeSave(true);
  H.continueMission();
  const cont = { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };

  const near = (p, q) =>
    p && q && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6 && Math.abs(p.zoom - q.zoom) < 1e-6;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    want, rec, wiped, after, oldCam, want2, cont,
    snapOk: near(rec, want),
    afterOk: near(after, want),
    wipedDiff: !near(wiped, want),
    oldDiff: !near(oldCam, want),
    contOk: near(cont, want2),
    phone: window.matchMedia("(max-width: 760px)").matches,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  a.tx = 61; a.ty = 26;
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.zoom = H.cam.targetZoom = 1.2;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 보던 곳이 남는다";
    box.appendChild(el);
  }
  return { x: H.cam.x, y: H.cam.y, zoom: H.cam.zoom };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/cam-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.rebuildWorld();
  H.state.paused = true;
  H.centerOnSelected();
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/cam-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.snapOk) fail.push("snap " + JSON.stringify(info.rec));
if (!info.wipedDiff) fail.push("wiped still matches want");
if (!info.afterOk) fail.push("after " + JSON.stringify(info.after));
if (!info.oldDiff) fail.push("old still matches want");
if (!info.contOk) fail.push("continue " + JSON.stringify(info.cont));
if (info.phone) fail.push("qa viewport is phone");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
