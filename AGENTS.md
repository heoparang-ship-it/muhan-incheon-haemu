# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
`무한인천: 해무의 성가` is a single-file HTML5 Canvas stealth game. There is **no build step and no bundler** — the whole engine is `game/index.html` (a large IIFE) plus `game/asset-data.js` and prerendered art under `game/assets/`. External runtime libraries are intentionally avoided (see `HANDOFF.md`/`docs/SHIP-CH1.md` for the hard constraints).

### Running the app (dev)
Serve the `game/` directory as a static site (README documents this):
```
python3 -m http.server 8080 --directory game
```
Then open `http://127.0.0.1:8080/`. `game/haemu.html` is a symlink to `index.html`; asset paths are relative, so `/` and `/haemu.html` are equivalent. Editing `game/index.html` or assets and reloading the browser is the entire dev loop — no watcher/hot-reload process exists.

### Tests / QA
The automated QA scripts live in `scripts/*.mjs` and drive the running server with Playwright (installed via the root `package.json` that this environment adds; `node_modules` is gitignored). The static server on port 8080 must be running first.
- Reliable smoke test: `node scripts/qa-play.mjs` — boots the game at `/haemu.html`, asserts 4 agents / guards present, moves 해주 several tiles, and fails on any console error (exit non-zero on failure). Screenshots land in `/workspace/screenshots/`.
- **Caveat:** several other `qa-*.mjs` scripts reference stale expectations documented in `docs/SHIP-CH1.md` (e.g. `qa-haemu.mjs` expects the root page to be wrapped in an `<iframe>`, and `qa-landscape.mjs` expects a portrait-rotation overlay that was removed). Prefer `qa-play.mjs` as the canonical smoke test; treat the others as historical.

### Lint / build
There is no linter, formatter, or build config in this repo (no ESLint/Prettier/tsconfig/Makefile). "Build" = none; the source files are shipped as-is.

### Python art scripts (optional)
`scripts/process-*.py` and `scripts/write-asset-data.py` bake/recolor sprite sheets using Pillow + NumPy. They are asset-tooling only and are not needed to run or QA the game.
