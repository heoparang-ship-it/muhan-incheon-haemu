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
  const fm = document.getElementById("followBtnM");
  const fb = document.getElementById("followBtn");
  const title = fm ? fm.getAttribute("title") : "";
  const desk = fb ? fb.getAttribute("title") : "";
  const snap = H.snapshotSave();
  H.writeSave(true);
  H.continueMission();
  const after = document.getElementById("followBtnM");
  const afterTitle = after ? after.getAttribute("title") : "";
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    title,
    desk,
    afterTitle,
    snapHasFollow: Object.prototype.hasOwnProperty.call(snap, "followSel"),
    phases,
  };
});

await page.screenshot({ path: "/workspace/screenshots/follow-title-after.png" });
await browser.close();

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.title !== "선택 대원 따라가기 (F)") fail.push("title " + info.title);
if (info.desk !== "선택 대원 따라가기 (F)") fail.push("desk " + info.desk);
if (info.afterTitle !== "선택 대원 따라가기 (F)") fail.push("continue title " + info.afterTitle);
if (info.snapHasFollow) fail.push("snap followSel");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
