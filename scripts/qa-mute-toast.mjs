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

await page.locator("#muteBtn").click();
await page.waitForTimeout(80);
const off = await page.evaluate(() => {
  const box = document.getElementById("toast");
  const lines = box ? Array.from(box.querySelectorAll(".toastLine")).map((el) => el.textContent) : [];
  return { lines, icon: document.getElementById("muteBtn")?.textContent };
});

await page.locator("#muteBtn").click();
await page.waitForTimeout(80);
const on = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const box = document.getElementById("toast");
  const lines = box ? Array.from(box.querySelectorAll(".toastLine")).map((el) => el.textContent) : [];
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
    lines,
    icon: document.getElementById("muteBtn")?.textContent,
    snapHasMuted: Object.prototype.hasOwnProperty.call(snap, "muted"),
    phases,
  };
});

await page.locator("#muteBtn").click();
await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/mute-toast-after.png" });
await browser.close();

const fail = [];
if (on.map[0] !== 96 || on.map[1] !== 96) fail.push("map " + on.map);
if (on.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + on.roles);
if (!off.lines.includes("음소거")) fail.push("off toast " + off.lines);
if (off.icon !== "🔇") fail.push("off icon " + off.icon);
if (!on.lines.includes("소리 켜짐")) fail.push("on toast " + on.lines);
if (on.icon !== "🔊") fail.push("on icon " + on.icon);
if (on.snapHasMuted) fail.push("snap muted");
for (const t of on.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, off, on };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
