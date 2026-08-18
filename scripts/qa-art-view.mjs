import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
await page.goto("http://127.0.0.1:8080/haemu.html", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(800);
await page.click("#startBtn");
await page.waitForTimeout(1400);
const info = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const chapel = H.map.buildings.find((b) => b.id === "chapel");
  const cx = chapel.x + chapel.w / 2, cy = chapel.y + chapel.h / 2;
  H.state.followSel = false;
  H.cam.x = H.isoX ? H.isoX(cx, cy) : undefined;
});
// isoX may not be exported — use screenToTile inverse via center helper
const info2 = await page.evaluate(() => {
  const H = window.__HAEMU__;
  const chapel = H.map.buildings.find((b) => b.id === "chapel");
  H.state.followSel = false;
  const a = H.agents[0];
  a.tx = chapel.x + chapel.w / 2;
  a.ty = chapel.y + chapel.h + 2;
  H.centerOnSelected();
  H.cam.zoom = H.cam.targetZoom = 1.05;
  const westIm = H.ART.img.bld_west_8x6?.sheets?.idle;
  return {
    artBody: chapel.artBody,
    whole: chapel.artWhole,
    pending: H.ART.pending,
    westW: westIm && westIm.naturalWidth,
    westH: westIm && westIm.naturalHeight,
    agentW: H.ART.img.agent_haeju?.sheets?.idle?.naturalWidth,
    cam: { x: H.cam.x, y: H.cam.y, z: H.cam.zoom },
  };
});
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/chapel-art.png" });

await page.evaluate(() => {
  const H = window.__HAEMU__;
  const t = H.map.buildings.find((b) => b.id === "tavern");
  const a = H.agents[0];
  a.tx = t.x + t.w / 2; a.ty = t.y + t.h + 2;
  H.centerOnSelected();
  H.cam.zoom = H.cam.targetZoom = 0.95;
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/village-art.png" });

console.log(JSON.stringify({ info2, errors }, null, 2));
await browser.close();
