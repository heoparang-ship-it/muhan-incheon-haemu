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
  const spots = [];
  for (let y = 46; y <= 58; y++) {
    for (let x = 16; x <= 32; x++) {
      if (H.walkableAt(x, y, 0, a)) spots.push([x, y]);
    }
  }
  const here = spots[0];
  const p1 = spots[Math.min(8, spots.length - 1)];
  const p2 = spots[Math.min(16, spots.length - 1)];
  if (here) { a.tx = here[0]; a.ty = here[1]; }
  a.path = [];
  a.queue = [
    { type: "move", tx: p1[0], ty: p1[1] },
    { type: "move", tx: p2[0], ty: p2[1] },
    { type: "wait", time: 1.5 }
  ];
  H.state.queued = 3;
  const at = { here, p1, p2, queued: H.state.queued, q: a.queue.slice() };

  const snap = H.snapshotSave();
  const rec = (snap.agents || []).find((x) => x.id === "haeju");

  H.rebuildWorld();
  const mid = H.agents.find((x) => x.id === "haeju");
  const wiped = { q: (mid && mid.queue && mid.queue.length) || 0, queued: H.state.queued };

  H.applySave(snap);
  const after = H.agents.find((x) => x.id === "haeju");
  const afterQ = after && after.queue && after.queue.map((c) => Object.assign({}, c));
  const afterQueued = H.state.queued;

  H.rebuildWorld();
  const old = H.snapshotSave();
  const oldRec = (old.agents || []).find((x) => x.id === "haeju");
  if (oldRec) delete oldRec.queue;
  H.applySave(old);
  const oldAfter = H.agents.find((x) => x.id === "haeju");

  H.rebuildWorld();
  const a2 = H.agents.find((x) => x.id === "haeju");
  if (here) { a2.tx = here[0]; a2.ty = here[1]; }
  a2.queue = [
    { type: "move", tx: p1[0], ty: p1[1] },
    { type: "move", tx: p2[0], ty: p2[1] },
    { type: "wait", time: 1.5 }
  ];
  H.state.queued = 3;
  H.writeSave(true);
  H.continueMission();
  const cont = H.agents.find((x) => x.id === "haeju");

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    at,
    snapQ: rec && rec.queue,
    wiped,
    afterQ,
    afterQueued,
    oldQ: (oldAfter && oldAfter.queue && oldAfter.queue.length) || 0,
    contQ: cont && cont.queue,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  if (typeof H.togglePlan === "function") H.togglePlan(true);
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 예약한 이동이 남는다";
    box.appendChild(el);
  }
  return { n: a && a.queue && a.queue.length, queued: H.state.queued };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/queue-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  if (typeof H.clearPlan === "function") H.clearPlan();
  else {
    for (const a of H.agents) a.queue = [];
    H.state.queued = 0;
  }
  if (H.state.planning && typeof H.togglePlan === "function") H.togglePlan(false);
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/queue-save-clear.png" });

const sameQ = (q, exp) => {
  if (!q || q.length !== exp.length) return "len " + (q && q.length);
  for (let i = 0; i < exp.length; i++) {
    const a = q[i], b = exp[i];
    if (a.type !== b.type || a.tx !== b.tx || a.ty !== b.ty || a.time !== b.time) return JSON.stringify(q);
  }
  return null;
};

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
const exp = info.at.q;
const snapBad = sameQ(info.snapQ, exp);
if (snapBad) fail.push("snap " + snapBad);
if (info.wiped.q !== 0) fail.push("rebuild kept queue " + info.wiped.q);
const afterBad = sameQ(info.afterQ, exp);
if (afterBad) fail.push("after " + afterBad);
if (info.afterQueued !== 3) fail.push("after queued " + info.afterQueued);
if (info.oldQ !== 0) fail.push("old queue should be 0, got " + info.oldQ);
const contBad = sameQ(info.contQ, exp);
if (contBad) fail.push("continue " + contBad);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
