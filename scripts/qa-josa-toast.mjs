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
  const pairs = [
    ["윤해주", false],
    ["강무진", true],
    ["백도치", false],
    ["월심", true],
    ["조선인 사병", true],
    ["외곽 신도", false],
    ["갇힌 주민", true],
    ["흰옷 신도", false],
    ["조수표", false],
    ["실종자 유품", true],
    ["무료 진료소", false],
    ["정문", true],
    ["구리관 1", true]
  ];
  const helper = pairs.map(([s, batchim]) => ({
    s,
    batchim: H.hasBatchim(s),
    expect: batchim,
    iGa: H.iGa(s),
    eul: H.eulReul(s)
  }));

  const a = H.agents.find((x) => x.id === "haeju");
  const pris = H.civilians.find((x) => x.type === "prisoner");
  if (pris) {
    pris.freed = true;
    pris.following = null;
    pris.tx = a.tx;
    pris.ty = a.ty;
  }
  H.selectAgent("haeju");
  H.interact(a);
  const leadToast = document.querySelector("#toast .toastLine");
  const leadText = leadToast ? leadToast.textContent : "";

  H.state.evidence.smugLedger = true;
  const boat = H.interactables.find((x) => x.id === "escapeBoat");
  for (const ag of H.agents) {
    if (ag.id === "haeju") {
      ag.tx = 16;
      ag.ty = 46;
    } else if (boat) {
      ag.tx = boat.tx;
      ag.ty = boat.ty;
    }
  }
  H.tryEscape();
  const escapeToast = document.querySelector("#toast .toastLine");
  const escapeText = escapeToast ? escapeToast.textContent : "";

  const ev = H.interactables.find((x) => x.id === "tideChart") || H.interactables.find((x) => x.kind === "evidence");
  if (ev && a) {
    a.tx = ev.tx;
    a.ty = ev.ty;
    a.action = null;
    a.path = [];
    H.interact(a);
  }
  const evLabel = a && a.action && a.action.label;

  const clinic = (H.map.doors || []).find((d) => d.label === "무료 진료소");
  let doorText = "";
  if (clinic && a) {
    a.tx = clinic.tx;
    a.ty = clinic.ty;
    clinic.open = false;
    clinic.locked = false;
    clinic.broken = false;
    H.interact(a);
    const doorToast = document.querySelector("#toast .toastLine");
    doorText = doorToast ? doorToast.textContent : "";
  }

  const leftover = [];
  const html = document.documentElement.innerHTML;
  if (html.includes("이(가)")) leftover.push("이(가)");
  if (html.includes("을(를)")) leftover.push("을(를)");

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    helper,
    leadText,
    escapeText,
    evLabel,
    evName: ev && ev.name,
    doorText,
    leftover,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    phases
  };
});

const cam = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const a = H.agents.find((x) => x.id === "haeju");
  if (a) {
    a.tx = 16;
    a.ty = 46;
    H.selectAgent("haeju");
  }
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  H.state.evidence.smugLedger = true;
  for (const ag of H.agents) {
    if (ag.id !== "haeju") {
      const boat = H.interactables.find((x) => x.id === "escapeBoat");
      if (boat) { ag.tx = boat.tx; ag.ty = boat.ty; }
    }
  }
  H.tryEscape();
  const box = document.getElementById("toast");
  const text = box && box.querySelector(".toastLine") ? box.querySelector(".toastLine").textContent : "";
  return { text };
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/josa-toast-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine warn";
    el.textContent = "윤해주이(가) 아직 배에서 멀다";
    box.appendChild(el);
  }
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/josa-toast-old.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
for (const h of info.helper) {
  if (h.batchim !== h.expect) fail.push("batchim " + h.s + " " + h.batchim);
  const ig = h.expect ? h.s + "이" : h.s + "가";
  const er = h.expect ? h.s + "을" : h.s + "를";
  if (h.iGa !== ig) fail.push("iGa " + h.iGa);
  if (h.eul !== er) fail.push("eul " + h.eul);
}
if (info.leadText !== "갇힌 주민이 따라온다") fail.push("lead " + info.leadText);
if (info.escapeText !== "윤해주가 아직 배에서 멀다") fail.push("escape " + info.escapeText);
if (info.evLabel !== "조수표를 살피는 중") fail.push("ev " + info.evLabel);
if (info.doorText !== "무료 진료소를 열었다") fail.push("door " + info.doorText);
if (info.leftover.length) fail.push("leftover " + info.leftover.join(","));
if (cam.text !== "윤해주가 아직 배에서 멀다") fail.push("cam " + cam.text);
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, cam, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
