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
  const patients = H.civilians.filter((c) => c.type === "patient");
  const p0 = patients[0];
  const p1 = patients[1];
  const beforeHealed = !!(p0 && p0.healed);
  const beforeSpeed = p0 && p0.speed;

  p0.healed = true;
  p0.panic = 0;
  p0.speed = 1.4;
  H.state.patientsHealed = 1;

  const snap = H.snapshotSave();
  const rec0 = snap.civilians.find((c) => c.id === p0.id);
  const rec1 = snap.civilians.find((c) => c.id === p1.id);

  H.rebuildWorld();
  H.applySave(snap);
  const after0 = H.civilians.find((c) => c.id === p0.id);
  const after1 = H.civilians.find((c) => c.id === p1.id);
  const countAfter = H.state.patientsHealed;
  const haeju = H.agents.find((a) => a.id === "haeju");
  haeju.tx = after0.tx;
  haeju.ty = after0.ty;
  const nearHealed = H.nearestInteract(haeju, 2.2);
  haeju.tx = after1.tx;
  haeju.ty = after1.ty;
  const nearRaw = H.nearestInteract(haeju, 2.2);

  /* 예전 저장(healed 필드 없음) — 다시 치료할 수 있다 */
  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = old.civilians.find((c) => c.id === p0.id);
  delete oldRec.healed;
  old.patientsHealed = 1;
  H.applySave(old);
  const oldAfter = H.civilians.find((c) => c.id === p0.id);

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    patientCount: patients.length,
    beforeHealed,
    beforeSpeed,
    snapHealed: rec0 && rec0.healed,
    snapOther: rec1 && rec1.healed,
    afterHealed: !!(after0 && after0.healed),
    afterSpeed: after0 && after0.speed,
    otherStillRaw: !!(after1 && !after1.healed && after1.speed === 0),
    patientsHealed: countAfter,
    nearHealedType: nearHealed && nearHealed.type,
    nearRawType: nearRaw && nearRaw.type,
    oldHealed: !!(oldAfter && oldAfter.healed),
    oldSpeed: oldAfter && oldAfter.speed,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const patients = H.civilians.filter((c) => c.type === "patient");
  const p0 = patients[0];
  p0.healed = true;
  p0.speed = 1.4;
  H.state.patientsHealed = 1;
  const snap = H.snapshotSave();
  H.rebuildWorld();
  H.applySave(snap);
  const p = H.civilians.find((c) => c.type === "patient" && c.healed);
  const haeju = H.agents.find((a) => a.id === "haeju");
  if (p && haeju) {
    haeju.tx = p.tx;
    haeju.ty = p.ty;
    H.state.selected = "haeju";
    if (H.centerOnSelected) H.centerOnSelected();
  }
  return { healed: !!(p && p.healed), tx: p && p.tx, ty: p && p.ty, speed: p && p.speed };
});
await page.screenshot({ path: "/workspace/screenshots/heal-save-qa.png" });
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/heal-save-clinic.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.patientCount !== 2) fail.push("patients " + info.patientCount);
if (info.beforeHealed) fail.push("already healed before");
if (info.beforeSpeed !== 0) fail.push("before speed " + info.beforeSpeed);
if (info.snapHealed !== true) fail.push("snap " + info.snapHealed);
if (info.snapOther !== false) fail.push("snap other " + info.snapOther);
if (!info.afterHealed) fail.push("after not healed");
if (info.afterSpeed !== 1.4) fail.push("after speed " + info.afterSpeed);
if (!info.otherStillRaw) fail.push("other patient lost raw state");
if (info.patientsHealed !== 1) fail.push("count " + info.patientsHealed);
if (info.nearHealedType === "heal") fail.push("healed still healable " + info.nearHealedType);
if (info.nearRawType !== "heal") fail.push("raw not healable " + info.nearRawType);
if (info.oldHealed) fail.push("old save became healed");
if (info.oldSpeed !== 0) fail.push("old speed " + info.oldSpeed);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
