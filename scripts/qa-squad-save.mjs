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
  const cards = () => [...document.querySelectorAll(".agentCard")].map((e) => ({
    id: e.dataset.id,
    selected: e.classList.contains("selected"),
    squad: e.classList.contains("squad"),
  }));

  H.state.selected = "haeju";
  H.state.squad = ["haeju", "mujin", "wolsim"];
  H.paintSquadCards();
  const afterSet = { selected: H.state.selected, squad: H.state.squad.slice(), cards: cards() };

  const snap = H.snapshotSave();

  H.rebuildWorld();
  const afterRebuild = { selected: H.state.selected, squad: H.state.squad.slice(), cards: cards() };

  H.applySave(snap);
  const afterApply = { selected: H.state.selected, squad: H.state.squad.slice(), cards: cards() };

  H.state.selected = "haeju";
  H.state.squad = ["haeju", "dochi"];
  H.writeSave(true);
  H.continueMission();
  const afterContinue = { selected: H.state.selected, squad: H.state.squad.slice(), cards: cards() };

  H.selectAgent("mujin", false);
  const afterClick = { selected: H.state.selected, squad: H.state.squad.slice(), cards: cards() };

  const phases = [0, 0.5, 1].map((p) => {
    H.state.tidePhase = p;
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return { p, wl: H.waterLevel(), expect: -0.34 + 0.74 * e };
  });
  H.state.tidePhase = 0;

  return {
    map: [H.MAP_W, H.MAP_H],
    roles: H.agents.map((x) => x.id),
    snapSquad: snap.squad,
    snapSelected: snap.selected,
    afterSet,
    afterRebuild,
    afterApply,
    afterContinue,
    afterClick,
    hasPaint: typeof H.paintSquadCards === "function",
    phases,
  };
});

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.state.paused = true;
  H.state.selected = "haeju";
  H.state.squad = ["haeju", "mujin", "wolsim"];
  H.selectAgent("haeju", false, true);
  H.centerOnSelected();
  H.cam.targetZoom = H.cam.zoom = 1.05;
  const box = document.getElementById("toast");
  if (box) {
    box.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toastLine good";
    el.textContent = "불러온 뒤에도 고른 부대가 남았다";
    box.appendChild(el);
  }
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/squad-save-after.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  H.selectAgent("haeju", false);
  const box = document.getElementById("toast");
  if (box) box.innerHTML = "";
  H.centerOnSelected();
});
await page.waitForTimeout(280);
await page.screenshot({ path: "/workspace/screenshots/squad-save-clear.png" });

const ids = (row) => (row.cards || []).filter((c) => c.selected || c.squad).map((c) => (c.selected ? "*" + c.id : c.id)).join(",");
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (!info.hasPaint) fail.push("paintSquadCards 없음");
if (!same(info.snapSquad || [], ["haeju", "mujin", "wolsim"])) fail.push("snap " + info.snapSquad);
if (info.snapSelected !== "haeju") fail.push("snap sel " + info.snapSelected);
if (!same(info.afterSet.squad, ["haeju", "mujin", "wolsim"])) fail.push("set " + info.afterSet.squad);
if (ids(info.afterSet) !== "*haeju,mujin,wolsim") fail.push("set cards " + ids(info.afterSet));
if (!same(info.afterRebuild.squad, ["haeju"])) fail.push("rebuild " + info.afterRebuild.squad);
if (!same(info.afterApply.squad, ["haeju", "mujin", "wolsim"])) fail.push("apply " + info.afterApply.squad);
if (ids(info.afterApply) !== "*haeju,mujin,wolsim") fail.push("apply cards " + ids(info.afterApply));
if (!same(info.afterContinue.squad, ["haeju", "dochi"])) fail.push("continue " + info.afterContinue.squad);
if (ids(info.afterContinue) !== "*haeju,dochi") fail.push("continue cards " + ids(info.afterContinue));
if (!same(info.afterClick.squad, ["mujin"])) fail.push("click " + info.afterClick.squad);
if (ids(info.afterClick) !== "*mujin") fail.push("click cards " + ids(info.afterClick));
for (const t of info.phases) {
  if (Math.abs(t.wl - t.expect) > 1e-12) fail.push("tide " + t.p + " " + t.wl);
}
if (errors.length) fail.push("console " + errors.join(" | "));

const out = { ok: fail.length === 0, fail, errors, info };
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(fail.length ? 1 : 0);
