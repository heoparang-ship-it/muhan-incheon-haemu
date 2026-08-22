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
await page.evaluate(() => localStorage.removeItem("haemu-a11y-v1"));
await page.locator("#startBtn").click();
await page.waitForTimeout(1400);
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const afterSet = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const before = { color: H.a11y.color, scale: H.a11y.uiScale, crouch: H.a11y.binds.crouch };
  const binds = Object.assign(H.defaultBinds(), { crouch: "z" });
  H.setA11y({ color: "cb", uiScale: 1.15, binds });
  const a = H.agents[0];
  const crouch0 = !!a.crouch;
  const ev = new KeyboardEvent("keydown", { key: "z", bubbles: true });
  window.dispatchEvent(ev);
  const stored = JSON.parse(localStorage.getItem("haemu-a11y-v1") || "null");
  const css = getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim();
  const calm = H.visionStyle(false, false, false);
  const hot = H.visionStyle(true, false, true);
  return {
    before,
    after: { color: H.a11y.color, scale: H.a11y.uiScale, crouchBind: H.a11y.binds.crouch },
    crouch0,
    crouch1: !!a.crouch,
    stored,
    css,
    calmHatch: calm.hatch,
    hotHatch: hot.hatch,
    hotFill: hot.fill,
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    pauseHasColor: !!document.getElementById("a11yColor"),
    bindBtns: document.querySelectorAll("#bindRow button").length
  };
});

await page.evaluate(() => window.__HAEMU__.setMenuPause(true));
await page.waitForSelector("#pauseMenu.show, #pauseMenu", { timeout: 3000 }).catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: "/workspace/screenshots/a11y-pause.png" });

const fail = [];
if (afterSet.map[0] !== 96 || afterSet.map[1] !== 96) fail.push("map " + afterSet.map);
if (afterSet.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + afterSet.roles);
if (afterSet.after.color !== "cb") fail.push("color " + afterSet.after.color);
if (Math.abs(afterSet.after.scale - 1.15) > 0.001) fail.push("scale " + afterSet.after.scale);
if (afterSet.after.crouchBind !== "z") fail.push("bind " + afterSet.after.crouchBind);
if (afterSet.crouch0 || !afterSet.crouch1) fail.push("z did not crouch " + afterSet.crouch0 + "->" + afterSet.crouch1);
if (!afterSet.stored || afterSet.stored.color !== "cb") fail.push("storage " + JSON.stringify(afterSet.stored));
if (afterSet.css !== "1.15") fail.push("css " + afterSet.css);
if (afterSet.calmHatch !== ".") fail.push("calm hatch " + afterSet.calmHatch);
if (afterSet.hotHatch !== "x") fail.push("hot hatch " + afterSet.hotHatch);
if (!afterSet.hotFill || afterSet.hotFill.indexOf("196,64,168") < 0) fail.push("hot fill " + afterSet.hotFill);
if (!afterSet.pauseHasColor) fail.push("no color select");
if (afterSet.bindBtns !== 5) fail.push("bind btns " + afterSet.bindBtns);
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ afterSet, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
