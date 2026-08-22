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

const leftover = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.toast("집사: 「새벽 종은 몇 시에 울리는가」 — 움직이지 마라", "warn");
  H.toast("선택 대원을 따라간다");
  const box = document.getElementById("toast");
  return {
    n: box ? box.children.length : 0,
    texts: box ? Array.from(box.children).map((el) => el.textContent) : [],
  };
});

await page.waitForTimeout(200);
await page.screenshot({ path: "/workspace/screenshots/toast-hud-on.png" });

const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const snap = H.snapshotSave();
  H.writeSave(true);
  H.continueMission();
  H.state.paused = true;
  const box = document.getElementById("toast");
  const texts = box ? Array.from(box.children).map((el) => el.textContent) : [];
  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;
  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    texts,
    snapHasToast: Object.prototype.hasOwnProperty.call(snap, "toasts") || Object.prototype.hasOwnProperty.call(snap, "toast"),
    hasClear: typeof H.clearToasts === "function",
    phases,
  };
});

await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/toast-hud-after.png" });

const afterRebuild = await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.toast("예전 알림", "warn");
  H.rebuildWorld();
  const box = document.getElementById("toast");
  return { n: box ? box.children.length : -1 };
});

await browser.close();

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasClear) fail.push("export");
if (leftover.n < 2) fail.push("leftover " + JSON.stringify(leftover));
if (info.texts.some((t) => t.includes("움직이지 마라") || t.includes("따라간다"))) fail.push("stale " + JSON.stringify(info.texts));
if (info.texts.length !== 1 || !String(info.texts[0] || "").startsWith("저장된 밀명을 이었다")) {
  fail.push("continue " + JSON.stringify(info.texts));
}
if (afterRebuild.n !== 0) fail.push("rebuild " + JSON.stringify(afterRebuild));
if (info.snapHasToast) fail.push("snap toast");
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, leftover, info, afterRebuild };
console.log(JSON.stringify(out, null, 2));
process.exit(fail.length ? 1 : 0);
