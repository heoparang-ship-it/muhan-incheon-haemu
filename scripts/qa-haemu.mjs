#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(800);

const iframe = page.frameLocator("iframe");
await iframe.locator("#titleScreen").waitFor({ state: "visible", timeout: 15000 });
await page.screenshot({ path: "/workspace/screenshots/qa-root-title.png" });

const titleText = await iframe.locator("#titleScreen h1").innerText();
await iframe.locator("#startBtn").click();
await iframe.locator("#titleScreen.hide").waitFor({ timeout: 8000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "/workspace/screenshots/qa-ingame.png" });

const probe = await iframe.locator("body").evaluate(() => {
  const H = window.__HAEMU__;
  if (!H) return { ok: false, reason: "no hook" };
  const art = H.ART || {};
  const texIds = art.tex ? Object.keys(art.tex) : [];
  const imgIds = art.img ? Object.keys(art.img) : [];
  const texReady = texIds.filter((id) => art.tex[id] && art.tex[id].naturalWidth > 0).length;
  const imgReady = imgIds.filter((id) => {
    const rec = art.img[id];
    const im = rec && rec.sheets && rec.sheets.idle;
    return im && im.naturalWidth > 0;
  }).length;
  return {
    ok: true,
    paused: H.state.paused,
    running: H.state.running,
    timeLeft: H.state.timeLeft,
    agents: H.agents.length,
    guards: H.guards.length,
    civilians: H.civilians.length,
    tex: texIds.length,
    texReady,
    img: imgIds.length,
    imgReady,
    pending: art.pending,
    selected: H.state.selected,
    cam: { x: H.cam.x, y: H.cam.y, z: H.cam.zoom },
  };
});

await iframe.locator("#pauseBtn").click();
await iframe.locator("#pauseMenu").waitFor({ state: "visible", timeout: 5000 });
await page.screenshot({ path: "/workspace/screenshots/qa-pause.png" });
await iframe.locator("#saveBtn").click();
await page.waitForTimeout(400);
const saved = await iframe.locator("body").evaluate(() => !!window.__HAEMU__.readSave());
await iframe.locator("#resumeBtn").click();
await page.waitForTimeout(300);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: "/workspace/screenshots/qa-mobile-portrait.png" });

console.log(JSON.stringify({ titleText, probe, saved, consoleErrors, pageErrors }, null, 2));
await browser.close();
if (pageErrors.length || consoleErrors.length) process.exit(2);
if (!probe.ok || !saved || titleText.indexOf("해무") < 0) process.exit(1);
