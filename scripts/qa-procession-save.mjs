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
  const believers = () => H.civilians.filter((c) => c.type === "believer");
  const beforeCount = believers().length;
  const beforeFlag = !!H.state.processionStarted;
  const beforeIn = believers().filter((c) => c.inProcession).length;

  H.startProcession();
  const afterStart = believers().filter((c) => c.inProcession).length;
  H.state.bellRinging = 0;
  H.state.tidePhase = 0.4;

  const snap = H.snapshotSave();
  const snapFlag = snap.processionStarted;
  const snapIn = (snap.civilians || []).filter((c) => c.inProcession).length;

  H.rebuildWorld();
  H.applySave(snap);
  const afterFlag = !!H.state.processionStarted;
  const afterIn = believers().filter((c) => c.inProcession).length;
  const wouldRestart = !H.state.processionStarted && H.state.tidePhase > 0.30;
  const ringAfterLoad = H.state.bellRinging;

  /* 예전 저장(필드 없음) — 들물이면 행렬이 다시 시작된다 */
  H.rebuildWorld();
  const old = H.snapshotSave();
  delete old.processionStarted;
  for (const c of old.civilians || []) delete c.inProcession;
  old.tidePhase = 0.4;
  H.applySave(old);
  const oldFlag = !!H.state.processionStarted;
  const oldWould = !H.state.processionStarted && H.state.tidePhase > 0.30;
  const oldIn = believers().filter((c) => c.inProcession).length;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0.4;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    beforeCount,
    beforeFlag,
    beforeIn,
    afterStart,
    snapFlag,
    snapIn,
    afterFlag,
    afterIn,
    wouldRestart,
    ringAfterLoad,
    oldFlag,
    oldWould,
    oldIn,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.startProcession();
  const b = H.civilians.find((c) => c.type === "believer" && c.inProcession);
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (b && haeju) {
    haeju.tx = b.tx;
    haeju.ty = b.ty;
    H.state.selected = "haeju";
    if (H.centerOnSelected) H.centerOnSelected();
  }
  return { tx: b && b.tx, ty: b && b.ty, inProcession: !!(b && b.inProcession), started: !!H.state.processionStarted };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/procession-save-qa.png" });
await page.screenshot({ path: "/workspace/screenshots/procession-save-yard.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.beforeCount !== 4) fail.push("believers " + info.beforeCount);
if (info.beforeFlag) fail.push("already started");
if (info.beforeIn !== 0) fail.push("already in " + info.beforeIn);
if (info.afterStart !== 4) fail.push("start in " + info.afterStart);
if (info.snapFlag !== true) fail.push("snap " + info.snapFlag);
if (info.snapIn !== 4) fail.push("snap in " + info.snapIn);
if (!info.afterFlag) fail.push("after flag false");
if (info.afterIn !== 4) fail.push("after in " + info.afterIn);
if (info.wouldRestart) fail.push("would restart after load");
if (info.ringAfterLoad) fail.push("bell after load " + info.ringAfterLoad);
if (info.oldFlag) fail.push("old save started");
if (!info.oldWould) fail.push("old save should restart");
if (info.oldIn !== 0) fail.push("old in " + info.oldIn);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
