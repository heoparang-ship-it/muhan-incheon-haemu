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
  const trail = [
    { tx: 18, ty: 48, life: 20, max: 26, owner: "agent", angle: 0.4, seen: false },
    { tx: 19, ty: 48, life: 18, max: 26, owner: "agent", angle: 0.5, seen: false },
    { tx: 20, ty: 49, life: 12, max: 26, owner: "agent", angle: 1.1, seen: true }
  ];
  H.state.prints = trail.map((p) => Object.assign({}, p));
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) { a.tx = 18; a.ty = 48; }

  const snap = H.snapshotSave();
  const snapPrints = (snap.prints || []).map((p) => ({ tx: p.tx, ty: p.ty, life: p.life, seen: !!p.seen, owner: p.owner }));

  H.rebuildWorld();
  const wiped = (H.state.prints || []).length;

  H.applySave(snap);
  const after = (H.state.prints || []).map((p) => ({ tx: p.tx, ty: p.ty, life: p.life, seen: !!p.seen, owner: p.owner }));

  H.rebuildWorld();
  const old = H.snapshotSave();
  delete old.prints;
  H.applySave(old);
  const oldLen = (H.state.prints || []).length;

  H.rebuildWorld();
  H.state.prints = trail.map((p) => Object.assign({}, p));
  H.writeSave(true);
  H.continueMission();
  const cont = (H.state.prints || []).map((p) => ({ tx: p.tx, ty: p.ty, life: p.life, seen: !!p.seen, owner: p.owner }));

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapPrints,
    snapLen: snapPrints.length,
    wiped,
    after,
    afterLen: after.length,
    oldLen,
    cont,
    contLen: cont.length,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  if (!(H.state.prints && H.state.prints.length)) {
    H.state.prints = [
      { tx: 18, ty: 48, life: 20, max: 26, owner: "agent", angle: 0.4, seen: false },
      { tx: 19, ty: 48, life: 18, max: 26, owner: "agent", angle: 0.5, seen: false }
    ];
  }
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) { a.tx = 18; a.ty = 48; }
  H.selectAgent("haeju");
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.15;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 갯벌 발자국이 남는다";
    box.appendChild(el);
  }
  return { n: (H.state.prints || []).length, at: a && [a.tx, a.ty] };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/print-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.prints = [];
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/print-save-clear.png" });

const sameTrail = (got) => {
  if (!got || got.length !== 3) return "len " + (got && got.length);
  const exp = [
    { tx: 18, ty: 48, life: 20, seen: false, owner: "agent" },
    { tx: 19, ty: 48, life: 18, seen: false, owner: "agent" },
    { tx: 20, ty: 49, life: 12, seen: true, owner: "agent" }
  ];
  for (let i = 0; i < 3; i++) {
    const a = got[i], b = exp[i];
    if (a.tx !== b.tx || a.ty !== b.ty || a.life !== b.life || a.seen !== b.seen || a.owner !== b.owner) {
      return JSON.stringify(got);
    }
  }
  return null;
};

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
const snapBad = sameTrail(info.snapPrints);
if (snapBad) fail.push("snap " + snapBad);
if (info.wiped !== 0) fail.push("rebuild kept prints " + info.wiped);
const afterBad = sameTrail(info.after);
if (afterBad) fail.push("after " + afterBad);
if (info.oldLen !== 0) fail.push("old prints should be 0, got " + info.oldLen);
const contBad = sameTrail(info.cont);
if (contBad) fail.push("continue " + contBad);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
