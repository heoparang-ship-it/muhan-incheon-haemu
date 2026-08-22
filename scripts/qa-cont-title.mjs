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
await page.waitForFunction(() => window.__HAEMU__?.map, { timeout: 20000 });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.writeSave(true);
  const btn = document.getElementById("continueBtn");
  if (btn) btn.hidden = false;
});
await page.waitForTimeout(80);
await page.screenshot({ path: "/workspace/screenshots/cont-title-after.png" });

const title = await page.locator("#continueBtn").getAttribute("title");

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const snap = H.snapshotSave();
  H.writeSave(true);
  H.continueMission();
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapHasCont: Object.prototype.hasOwnProperty.call(snap, "continueKey"),
    phases,
  };
});

await browser.close();

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (title !== "이어하기 (Enter)") fail.push("title " + title);
if (info.snapHasCont) fail.push("snap continueKey");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info: { ...info, title } };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
