#!/usr/bin/env python3
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path("/workspace/artifacts/screenshots")
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto("http://127.0.0.1:8080/index.html", wait_until="networkidle", timeout=45000)
    page.wait_for_selector("#startBtn", timeout=10000)
    page.locator("#startBtn").click()
    page.wait_for_function("() => window.__HAEMU__ && window.__HAEMU__.state && window.__HAEMU__.state.running", timeout=15000)
    page.wait_for_function(
        "() => window.__HAEMU__ && window.__HAEMU__.ART && window.__HAEMU__.ART.pending === 0",
        timeout=20000,
    )

    before = page.evaluate(
        """() => {
      const H = window.__HAEMU__;
      const ids = ["agent_haeju","agent_mujin","agent_dochi","agent_wolsim","guard_steward","civil_villager"];
      const sheets = {};
      for (const id of ids) {
        const rec = H.ART.img[id];
        const walk = rec && rec.sheets && rec.sheets.walk;
        sheets[id] = {
          idle: !!(rec && rec.sheets && rec.sheets.idle && rec.sheets.idle.naturalWidth),
          walk: !!(walk && walk.naturalWidth),
          walkW: walk && walk.naturalWidth,
          walkH: walk && walk.naturalHeight,
          frames: rec && rec.meta && rec.meta.clips && (rec.meta.clips.find(c => c.key === "walk") || {}).frames
        };
      }
      return {
        running: H.state.running,
        agents: H.agents.length,
        wall: !!(H.ART.img.bld_wall && H.ART.img.bld_wall.sheets.idle && H.ART.img.bld_wall.sheets.idle.naturalWidth),
        sheets
      };
    }"""
    )
    page.screenshot(path=str(out / "walk-ingame.png"))

    page.evaluate(
        """() => {
      const H = window.__HAEMU__;
      for (const a of H.agents) H.setPath(a, a.tx + 6, a.ty - 2);
    }"""
    )
    page.wait_for_timeout(2400)
    page.screenshot(path=str(out / "walk-agents-moving.png"))

    after = page.evaluate(
        """() => window.__HAEMU__.agents.map(a => ({
      id: a.id, moveT: a.moveT, path: a.path && a.path.length, bob: +a.bob.toFixed(2)
    }))"""
    )

    page.evaluate(
        """() => {
      const H = window.__HAEMU__;
      H.selectAgent(H.agents[0]);
      H.centerOnSelected();
      H.cam.zoom = 1.35;
    }"""
    )
    page.wait_for_timeout(250)
    page.screenshot(path=str(out / "walk-closeup.png"))

    fail = []
    if not before["running"]:
        fail.append("not running")
    if before["agents"] != 4:
        fail.append("agents " + str(before["agents"]))
    if not before["wall"]:
        fail.append("wall missing")
    for id_, s in before["sheets"].items():
        if not s["walk"] or s["walkW"] != 224 or s["walkH"] != 304 or s["frames"] != 4:
            fail.append("sheet " + id_ + " " + json.dumps(s))
    if not any(a["path"] or a["moveT"] or a["bob"] > 0.2 for a in after):
        fail.append("nobody walked " + json.dumps(after))
    if errors:
        fail.append("console " + " | ".join(errors))

    print(json.dumps({"before": before, "after": after, "errors": errors, "fail": fail}, indent=2))
    browser.close()
    raise SystemExit(3 if fail else 0)
