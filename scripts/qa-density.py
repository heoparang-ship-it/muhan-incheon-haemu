#!/usr/bin/env python3
"""Map density + corridor smoke: counts, pathfinding, screenshots."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path("/workspace/artifacts/screenshots")
out.mkdir(parents=True, exist_ok=True)

SHOTS = [
    ("density-start", 23, 65, 0.85),
    ("density-village", 16, 52, 0.72),
    ("density-compound", 44, 36, 0.70),
    ("density-salt", 64, 24, 0.70),
    ("density-mid", 48, 52, 0.62),
    ("density-mud", 52, 78, 0.55),
    ("density-island", 74, 76, 0.75),
    ("density-cave", 86, 85, 0.90),
]

PATHS = [
    ("start-well", 23, 65, 61, 26),
    ("start-front", 23, 65, 45, 26),
    ("crossing", 48, 62, 67, 73),
    ("pier-bell", 67, 73, 75, 70),
    ("island-sluice", 74, 76, 88, 82),
    ("village-shrine", 16, 48, 13, 61),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto("http://127.0.0.1:8080/index.html", wait_until="networkidle", timeout=45000)
    page.wait_for_selector("#startBtn", timeout=10000)
    page.locator("#startBtn").click()
    page.wait_for_function(
        "() => window.__HAEMU__ && window.__HAEMU__.state && window.__HAEMU__.state.running",
        timeout=15000,
    )
    page.wait_for_timeout(400)

    stats = page.evaluate(
        """() => {
      const H = window.__HAEMU__;
      const m = H.map;
      const N = H.MAP_W * H.MAP_H;
      const kinds = {};
      for (const p of m.props) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
      const bKinds = {};
      for (const b of m.buildings) bKinds[b.kind] = (bKinds[b.kind] || 0) + 1;
      let land = 0, filled = 0, lane2 = 0, solids = 0;
      for (let i = 0; i < N; i++) {
        if (m.zone[i] === 0) continue;
        land++;
        if (m.solid[i]) solids++;
        if (m.propAt && m.propAt[i]) filled++;
        if (m.lane && m.lane[i] >= 2) lane2++;
      }
      const starts = [[23,65],[25,66],[22,67],[26,68]];
      const startOk = starts.every(([x,y]) => H.passable(x, y, H.agents[0]));
      return {
        running: H.state.running,
        props: m.props.length,
        lamps: m.lamps.length,
        buildings: m.buildings.length,
        doors: m.doors.length,
        agents: H.agents.length,
        guards: H.guards.length,
        civilians: H.civilians.length,
        kinds, bKinds, land, filled, solids, lane2, startOk
      };
    }"""
    )

    paths = {}
    for name, sx, sy, tx, ty in PATHS:
        paths[name] = page.evaluate(
            """([sx, sy, tx, ty]) => {
          const H = window.__HAEMU__;
          const path = H.findPath(sx, sy, tx, ty, H.agents[0]);
          return { len: path.length, ok: path.length > 0 };
        }""",
            [sx, sy, tx, ty],
        )

    for name, tx, ty, zoom in SHOTS:
        page.evaluate(
            """([tx, ty, zoom]) => {
          const H = window.__HAEMU__;
          H.cam.x = (tx - ty) * 32;
          H.cam.y = (tx + ty) * 16;
          H.cam.zoom = zoom;
          H.cam.targetZoom = zoom;
        }""",
            [tx, ty, zoom],
        )
        page.wait_for_timeout(180)
        page.screenshot(path=str(out / f"{name}.png"))

    fail = []
    if not stats["running"]:
        fail.append("not running")
    if not stats["startOk"]:
        fail.append("start blocked")
    if stats["props"] < 400:
        fail.append("props too few: " + str(stats["props"]))
    if stats["buildings"] < 40:
        fail.append("buildings too few: " + str(stats["buildings"]))
    if stats["guards"] != 22:
        fail.append("guards " + str(stats["guards"]))
    if stats["civilians"] < 21:
        fail.append("civilians " + str(stats["civilians"]))
    for name, rec in paths.items():
        if not rec["ok"]:
            fail.append("path fail " + name)
    js_errors = [e for e in errors if "favicon" not in e.lower()]
    if js_errors:
        fail.append("js: " + " | ".join(js_errors[:4]))

    report = {"stats": stats, "paths": paths, "fail": fail, "errors": js_errors}
    Path("/workspace/artifacts/density-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
    if fail:
        raise SystemExit("QA FAIL: " + "; ".join(fail))
    print("QA_DENSITY_OK")
