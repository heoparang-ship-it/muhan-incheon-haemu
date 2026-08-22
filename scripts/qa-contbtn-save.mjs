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
  H.state.timeLeft = 2000;
  H.state.difficulty = "hard";
  H.writeSave(true);
  const hardTxt = document.getElementById("continueBtn").textContent;
  const hardHidden = document.getElementById("continueBtn").hidden;

  H.state.difficulty = "easy";
  H.state.timeLeft = 125;
  H.writeSave(true);
  const easyTxt = document.getElementById("continueBtn").textContent;

  const snap = H.snapshotSave();
  delete snap.difficulty;
  snap.timeLeft = 2000;
  try { localStorage.setItem(H.slotKey(0), JSON.stringify(snap)); } catch (e) { /* ignore */ }
  H.refreshTitleMeta();
  const oldTxt = document.getElementById("continueBtn").textContent;

  H.state.difficulty = "hard";
  H.state.timeLeft = 2000;
  H.writeSave(true);
  H.goTitle();
  const titleTxt = document.getElementById("continueBtn").textContent;
  const titleHide = document.getElementById("continueBtn").hidden;

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    hardTxt,
    hardHidden,
    easyTxt,
    oldTxt,
    titleTxt,
    titleHide,
    hasRefresh: typeof H.refreshTitleMeta === "function",
    phases,
  };
});

await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/contbtn-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  try { localStorage.removeItem(H.slotKey(0)); localStorage.removeItem(H.slotKey("auto")); } catch (e) { /* ignore */ }
  H.refreshTitleMeta();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/contbtn-save-clear.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasRefresh) fail.push("export");
if (info.hardHidden) fail.push("hard hidden");
if (info.hardTxt !== "이어하기 · 33:20 · 어려움") fail.push("hard " + info.hardTxt);
if (info.easyTxt !== "이어하기 · 02:05 · 쉬움") fail.push("easy " + info.easyTxt);
if (info.oldTxt !== "이어하기 · 33:20") fail.push("old " + info.oldTxt);
if (info.titleHide || info.titleTxt !== "이어하기 · 33:20 · 어려움") fail.push("title " + info.titleTxt);
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
