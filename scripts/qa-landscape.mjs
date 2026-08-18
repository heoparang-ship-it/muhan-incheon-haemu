import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const iPhone = devices["iPhone 14 Pro"] || devices["iPhone 13 Pro"];
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function shot(page, name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png` });
}

function iphoneCtx(viewport) {
  return browser.newContext({
    ...iPhone,
    viewport,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
}

const errors = [];

// Portrait — overlay must block
const portrait = await iphoneCtx({ width: 430, height: 932 });
const pPage = await portrait.newPage();
pPage.on("console", (m) => { if (m.type() === "error") errors.push("P:" + m.text()); });
pPage.on("pageerror", (e) => errors.push("P:" + String(e.message || e)));
await pPage.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await pPage.waitForTimeout(700);
const portraitInfo = await pPage.evaluate(() => {
  const el = document.getElementById("orientation");
  const cs = getComputedStyle(el);
  return { display: cs.display, z: cs.zIndex, text: el.innerText.replace(/\s+/g, " ").trim() };
});
await shot(pPage, "iphone-portrait-lock");
await portrait.close();

// Landscape — playable
const land = await iphoneCtx({ width: 932, height: 430 });
const page = await land.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push("L:" + m.text()); });
page.on("pageerror", (e) => errors.push("L:" + String(e.message || e)));
await page.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#startBtn", { timeout: 8000 });
await page.waitForTimeout(900);
const landTitle = await page.evaluate(() => {
  const el = document.getElementById("orientation");
  return {
    orientDisplay: getComputedStyle(el).display,
    h1: document.querySelector("#titleScreen h1")?.textContent,
    portraits: [...document.querySelectorAll("#titleScreen")].length,
    ready: !!window.__haemuReady,
  };
});
await shot(page, "iphone-land-title");
await page.locator("#startBtn").tap();
await page.waitForTimeout(1800);
await shot(page, "iphone-land-play");

const play = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const ts = document.getElementById("titleScreen");
  const g = H?.GUARD_TYPES || {};
  const blds = (H?.map?.buildings || []).filter((b) => b.kind !== "wall" && b.kind !== "cave");
  const bound = blds.filter((b) => b.artWhole || b.artBody).length;
  const sample = blds.slice(0, 8).map((b) => ({ id: b.id, w: b.w, h: b.h, roof: b.roof, art: b.artBody, whole: !!b.artWhole }));
  return {
    hidden: ts.classList.contains("hide"),
    paused: H?.state?.paused,
    running: H?.state?.running,
    agents: H?.agents?.length,
    follow: H?.state?.followSel,
    acolyte: g.acolyte && { range: g.acolyte.range, fov: g.acolyte.fov, speed: g.acolyte.speed },
    soldier: g.soldier && { range: g.soldier.range, fov: g.soldier.fov, speed: g.soldier.speed },
    artReady: H?.ART?.ready,
    artPending: H?.ART?.pending,
    hasWest: !!(H?.ART?.img && H.ART.img.bld_west_8x6),
    hasLamp: !!(H?.ART?.img && H.ART.img.prop_lamp_on),
    lampFrames: H?.ART?.img?.prop_lamp_on?.meta?.clips?.[0]?.frames,
    bldCount: blds.length,
    bound,
    sample,
    portraitSrc: document.querySelector(".agentCard img")?.getAttribute("src") || "",
  };
});

await land.close();
await browser.close();

console.log(JSON.stringify({ portraitInfo, landTitle, play, errors }, null, 2));

const fail = [];
if (portraitInfo.display !== "flex") fail.push("portrait overlay not shown");
if (landTitle.orientDisplay !== "none") fail.push("landscape overlay still visible");
if (!play.hidden || play.paused || !play.running) fail.push("mission did not start");
if (!play.acolyte || play.acolyte.range > 4.0 || play.acolyte.speed > 1.0) fail.push("vision/speed not halved");
if (play.bound < 8) fail.push("buildings not bound: " + play.bound);
if (!play.hasWest || !play.hasLamp) fail.push("drive art missing");
if (play.portraitSrc && !play.portraitSrc.includes("portrait_")) fail.push("portraits not wired");
if (errors.length) fail.push("console errors: " + errors.join(" | "));
if (fail.length) {
  console.error("FAIL", fail);
  process.exit(3);
}
process.exit(0);
