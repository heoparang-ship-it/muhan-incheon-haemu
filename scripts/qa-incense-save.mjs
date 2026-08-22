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
  const wolsim = H.agents.find((a) => a.id === "wolsim");
  const now0 = H.state.now;
  const before = H.persistIncenseRemainingMs(wolsim);
  const cover0 = H.concealment(wolsim);
  wolsim.incenseUntil = now0 + 6000;
  const coverOn = H.concealment(wolsim);

  const snap = H.snapshotSave();
  const rec = snap.agents.find((a) => a.id === "wolsim");

  H.rebuildWorld();
  const afterRebuild = H.persistIncenseRemainingMs(H.agents.find((a) => a.id === "wolsim"));
  const coverRebuild = H.concealment(H.agents.find((a) => a.id === "wolsim"));

  H.applySave(snap);
  const after = H.agents.find((a) => a.id === "wolsim");
  const remApply = Math.max(0, (after.incenseUntil || 0) - performance.now());
  const coverApply = H.concealment(after);

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = old.agents.find((a) => a.id === "wolsim");
  delete oldRec.incenseUntil;
  const wOldSet = H.agents.find((a) => a.id === "wolsim");
  wOldSet.incenseUntil = H.state.now + 6000;
  H.applySave(old);
  const oldAfter = H.agents.find((a) => a.id === "wolsim");
  const oldRem = Math.max(0, (oldAfter.incenseUntil || 0) - performance.now());
  const coverOld = H.concealment(oldAfter);

  H.rebuildWorld();
  const w2 = H.agents.find((a) => a.id === "wolsim");
  w2.incenseUntil = H.state.now + 6000;
  H.writeSave(true);
  H.continueMission();
  const cont = H.agents.find((a) => a.id === "wolsim");
  const remCont = Math.max(0, (cont.incenseUntil || 0) - performance.now());
  const coverCont = H.concealment(cont);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    before,
    cover0,
    coverOn,
    snapIncense: rec && rec.incenseUntil,
    afterRebuild,
    coverRebuild,
    remApply,
    coverApply,
    oldRem,
    coverOld,
    remCont,
    coverCont,
    hasPersist: typeof H.persistIncenseRemainingMs === "function",
    hasRestore: typeof H.restoreIncenseUntil === "function",
    hasConceal: typeof H.concealment === "function",
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const wolsim = H.agents.find((a) => a.id === "wolsim");
  if (!(wolsim.incenseUntil > performance.now())) {
    wolsim.incenseUntil = performance.now() + 6000;
  }
  H.selectAgent("wolsim");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 향 은신이 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/incense-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  for (const a of H.agents) a.incenseUntil = 0;
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.selectAgent("wolsim");
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/incense-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasPersist || !info.hasRestore || !info.hasConceal) fail.push("export");
if (info.before) fail.push("already incense " + info.before);
if (Math.abs(info.snapIncense - 6000) > 1) fail.push("snap " + info.snapIncense);
if (info.afterRebuild) fail.push("rebuild " + info.afterRebuild);
if (!(info.remApply > 5000 && info.remApply <= 6000)) fail.push("remApply " + info.remApply);
if (!(info.remCont > 5000 && info.remCont <= 6000)) fail.push("remCont " + info.remCont);
if (info.oldRem > 50) fail.push("old rem " + info.oldRem);
if (!(info.coverOn - info.cover0 > 0.3)) fail.push("cover on " + info.cover0 + "→" + info.coverOn);
if (!(info.coverApply - info.coverRebuild > 0.3)) fail.push("cover apply " + info.coverApply);
if (Math.abs(info.coverOld - info.coverRebuild) > 1e-9) fail.push("cover old " + info.coverOld);
if (!(info.coverCont - info.cover0 > 0.3)) fail.push("cover cont " + info.coverCont);
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
