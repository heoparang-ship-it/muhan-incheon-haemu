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
  const help = document.getElementById("helpBody");
  const helpText = help ? help.innerText : "";
  const helpHtml = help ? help.innerHTML : "";

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });

  H.state.tidePhase = 1;
  const pris = H.civilians.filter((c) => c.type === "prisoner").map((c) => {
    const i = H.idx(Math.round(c.tx), Math.round(c.ty));
    return { id: c.id, tx: c.tx, ty: c.ty, elev: H.map.elev[i], dep: H.waterDepth(i) };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    helpText,
    helpHtml,
    phases,
    tideOk: phases.every((x) => Math.abs(x.wl - x.expect) < 1e-12),
    pris
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  const box = document.getElementById("help");
  if (box) box.classList.add("show");
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/help-tide-after.png" });

await page.evaluate(() => {
  const box = document.getElementById("help");
  if (box) box.classList.remove("show");
  const help = document.getElementById("helpBody");
  if (help) {
    help.innerHTML = help.innerHTML.replace(
      "동굴이 잠긴다.",
      "동굴이 잠기고 갇힌 주민이 위험해진다."
    );
  }
  if (box) box.classList.add("show");
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/help-tide-old.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.helpText.includes("갇힌 주민이 위험해진다")) fail.push("help still lies");
if (!info.helpText.includes("동굴이 잠긴다")) fail.push("help missing cave");
if (!info.helpText.includes("육상 퇴로가 끊긴다")) fail.push("help missing retreat");
if (info.helpHtml.includes("갇힌 주민이 위험해진다")) fail.push("help html still lies");
if (!info.pris.length) fail.push("no prisoners");
for (const p of info.pris) {
  if (p.dep > 0) fail.push("prisoner wet " + JSON.stringify(p));
}
if (info.pris.some((p) => p.dep > 0.35)) fail.push("drown threshold");
if (!info.tideOk) fail.push("tide " + JSON.stringify(info.phases));
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
