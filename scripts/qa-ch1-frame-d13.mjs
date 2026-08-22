import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const GOLD = {
  terr: "43bd0e97",
  solid: "6ffac795",
  zone: "9846fe3e",
  cover: "818d6859",
  walk1: "6778ec25",
  stair: "41ec7604",
  window: "03f7d178",
  inside: "22bccc57",
  elev: "21affee2"
};

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
const titleTag = await page.locator("#titleScreen .ch").innerText();
await page.locator("#startBtn").click();
await page.waitForTimeout(1400);
await page.waitForFunction(() => window.__HAEMU__?.ART && window.__HAEMU__.ART.pending === 0, { timeout: 20000 }).catch(() => {});

const info = await page.evaluate((gold) => {
  const H = window.__HAEMU__;
  const m = H.map;
  const N = H.MAP_W * H.MAP_H;
  const ch = H.chapterOf();
  const fp = H.mapFingerprint();
  let win = 0, walk1 = 0, stairN = 0;
  for (let i = 0; i < N; i++) {
    if (m.window[i]) win++;
    if (m.walk1[i]) walk1++;
    if (m.stair[i]) stairN++;
  }
  const rooms = m.buildings.filter((b) => b.kind === "room");
  const two = rooms.filter((b) => b.stories >= 2 && b.stair);
  const phases = [0, 0.34, 0.5, 0.72, 1];
  const wls = phases.map((p) => {
    H.state.tidePhase = p;
    return { p, wl: H.waterLevel(), st: H.tideStage() };
  });
  const expected = (p) => {
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return H.TIDE.levelLow + (H.TIDE.levelHigh - H.TIDE.levelLow) * e;
  };
  const wlMatch = wls.every((x) => Math.abs(x.wl - expected(x.p)) < 1e-12);
  const stairPath = two.map((b) => {
    const a = H.agents[0];
    const ok0 = H.walkableAt(b.stair.tx, b.stair.ty, 0, a);
    const ok1 = H.walkableAt(b.stair.tx, b.stair.ty, 1, a);
    return { id: b.id, ok0, ok1, tx: b.stair.tx, ty: b.stair.ty };
  });
  let losWin = null;
  for (let i = 0; i < N; i++) {
    if (!m.window[i]) continue;
    const tx = i % H.MAP_W, ty = (i / H.MAP_W) | 0;
    const from = [tx - 2, ty], to = [tx + 2, ty];
    if (!H.inMap && (from[0] < 0 || to[0] >= H.MAP_W)) continue;
    if (from[0] < 0 || to[0] >= H.MAP_W) continue;
    losWin = {
      i, tx, ty,
      through: H.hasSight(from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5, 1.6, 0.85, 0, 0)
    };
    break;
  }
  return {
    map: [H.MAP_W, H.MAP_H],
    chapter: { id: ch.id, index: ch.index, mapW: ch.mapW, mapH: ch.mapH, rooms: ch.rooms.length, keys: Object.keys(H.CHAPTERS) },
    setBad: H.setChapter("nope"),
    setOk: H.setChapter("gamnaru"),
    roles: H.agents.map((a) => a.id),
    guards: H.guards.length,
    civ: H.civilians.length,
    buildings: m.buildings.length,
    rooms: rooms.length,
    two: two.map((b) => b.id),
    win, walk1, stairN,
    props: m.props.length,
    lamps: m.lamps.length,
    doors: m.doors.length,
    fp,
    gold,
    fpMatch: Object.keys(gold).every((k) => fp[k] === gold[k]),
    tide: { low: H.TIDE.levelLow, high: H.TIDE.levelHigh },
    wls,
    wlMatch,
    stairPath,
    losWin,
    tag: document.querySelector("#titleScreen .ch") && document.querySelector("#titleScreen .ch").textContent
  };
}, GOLD);

await page.screenshot({ path: "/workspace/screenshots/ch1-frame.png" });

const fail = [];
if (info.map[0] !== 96 || info.map[1] !== 96) fail.push("map " + info.map);
if (info.roles.join(",") !== "haeju,mujin,dochi,wolsim") fail.push("roles " + info.roles);
if (info.chapter.keys.join(",") !== "gamnaru") fail.push("chapters " + info.chapter.keys);
if (info.chapter.id !== "gamnaru" || info.chapter.index !== 1) fail.push("chapter meta");
if (info.setBad !== false) fail.push("setChapter nope");
if (info.chapter.rooms !== 12) fail.push("rooms table " + info.chapter.rooms);
if (info.rooms !== 12) fail.push("rooms built " + info.rooms);
if (info.two.join(",") !== "chapel,tavern,sanctum") fail.push("2F " + info.two);
if (info.stairN !== 3 || info.walk1 !== 54 || info.win !== 33) fail.push("layers " + info.stairN + "/" + info.walk1 + "/" + info.win);
if (info.guards !== 22) fail.push("guards " + info.guards);
if (info.civ !== 21) fail.push("civ " + info.civ);
if (info.buildings !== 36) fail.push("buildings " + info.buildings);
if (info.props !== 257) fail.push("props " + info.props);
if (info.lamps !== 19) fail.push("lamps " + info.lamps);
if (info.doors !== 16) fail.push("doors " + info.doors);
if (!info.fpMatch) fail.push("fp " + JSON.stringify(info.fp));
if (info.tide.low !== -0.34 || info.tide.high !== 0.4) fail.push("tide const " + JSON.stringify(info.tide));
if (!info.wlMatch) fail.push("tide formula " + JSON.stringify(info.wls));
if (!info.stairPath.every((s) => s.ok0 && s.ok1)) fail.push("stair walk " + JSON.stringify(info.stairPath));
if (titleTag.indexOf("감나루") < 0) fail.push("title " + titleTag);
if (errors.length) fail.push("console " + errors.join(" | "));

console.log(JSON.stringify({ info, titleTag, errors, fail }, null, 2));
await browser.close();
process.exit(fail.length ? 3 : 0);
