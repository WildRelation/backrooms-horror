# The Warcrooms — Project Context for Claude

## What is this

3D first-person horror game running in the browser. The player spawns in an infinite
backrooms-style maze, collects pages, and avoids 3 entities. Built with Three.js + Vite.
No backend — 100% static site.

## Tech stack

- **Three.js 0.157** — 3D rendering, GLTFLoader, PointerLockControls, Web Audio API
- **Vite 4** — bundler, dev server (`cd backrooms && npm run dev`)
- **Source**: `backrooms/` — `main.js` is the entire game (~1200 lines)
- **Assets**: `backrooms/public/` — models, sounds, images (Vite copies these to `dist/` on build)
- **Blender sources**: `assets/Blend/` and `assets/Archimesh/` (.blend files)
- **Docker**: nginx serves `backrooms/dist/` — see `Dockerfile` and `nginx.conf.template`

## Deployments

| URL | Platform | Trigger |
|-----|----------|---------|
| `https://wildrelation.github.io/backrooms-horror/` | GitHub Pages (Fastly CDN) | push to main |
| `https://the-warcrooms.app.cloud.cbh.kth.se` | KTH Cloud (Sweden) | push to main |

Both deploy automatically via GitHub Actions on push to `main`:
- `.github/workflows/pages.yml` — builds `backrooms/` and deploys dist to Pages
- `.github/workflows/docker.yml` — builds Docker image, pushes to `ghcr.io/wildrelation/backrooms-horror`

**GitHub Pages is preferred** for accessibility — it's on a global CDN. KTH Cloud is
in Sweden which is slow for users in Latin America.

## Game architecture

### Rooms
- 12 GLB room models (`backrooms/public/models/room1.glb` … `room12.glb`)
- Arranged in a 3×3 grid (`currentRooms[9]`). When player exits the grid, 3 rooms
  swap in from `unusedRooms` — infinite world effect
- **Rooms 1–9** load at startup (counter shows 0/9). **Rooms 10–12** load in
  background after game starts via `loadReserveRooms()` — reduces CPU pressure
- Each room has a named `Spawn` object (Three.js getObjectByName) used as placement
  anchor for pages and entities

### Entities
- **El Vigilante** — freezes when player looks at it, approaches from behind
- **El Devorador** — chases player; speed = `speedBase + fear * speedFear`
- **El Perdido** — wanders randomly, kill on proximity
- `fear = 1 - sanity / 100` — sanity drains when idle or near entities

### Player speeds (after physics fix)
- Walk: **4 u/s** (steady-state with `exp(-15*delta)` friction, force = 60)
- Sprint: **7.6 u/s** (`SPRINT_MULTIPLIER = 1.9`)
- Devorador base speeds: 2 / 3 / 4 / 5.5 u/s per level — player sprint should
  always exceed base speed so the player CAN escape by turning corners

### Levels (0–3)
Defined in `LEVEL_CONFIGS` array. Each level changes: fog color/density, entity
spawn cooldowns, speed, sanity drain, pages needed, max entities.

### Audio
All sounds use `THREE.Audio` (Web Audio API). Volumes after last adjustment:
- walking: 0.3, buzzing (ambient): 0.04, glitch (chase): 0.6, death: 0.6, win: 0.6

Sounds load via `initAudio()` which runs before `await loadAssets()` — this means
audio can play during the loading screen (keydown listener is active pre-load).

## Known issues / decisions

See GitHub Issues for full history. Summary:

| Issue | Status | Notes |
|-------|--------|-------|
| Loading freeze (no progress) | Fixed | Progress counter + error message added |
| Stuck at 1/12 (CPU saturation) | Fixed | Lazy-load rooms 10–12 |
| Framerate-dependent movement | Fixed | Use `Math.exp(-15*delta)` friction |
| Pages spawning in walls | Fixed | Offset reduced ±3→±1.5, height 1.65→0.9 |
| Audio too loud | Fixed | All volumes reduced ~40% |
| Slow load for distant users | Partial | GitHub Pages helps; Draco compression pending |

## Potential improvements (not yet done)

- **Draco compression** — rooms are ~20MB each (180MB total at startup). Draco would
  reduce to ~3–5MB each. Requires `@gltf-transform/cli` to re-compress GLBs and
  adding `DRACOLoader` to Three.js setup. No Blender needed.
- **Nginx gzip for GLBs** — currently `gzip_types` only covers text/JS/CSS. Adding
  `application/octet-stream` could help KTH Cloud delivery slightly.

## Development workflow

```bash
cd backrooms
npm install
npm run dev      # local dev server at localhost:5173
npm run build    # output to backrooms/dist/
```

Push to `main` → both deployments update automatically (~1–2 min).

## Repo structure

```
backrooms/          — Vite project (the actual game)
  main.js           — entire game logic
  index.html        — entry point
  style.css
  public/
    models/         — GLB room files (tracked in git, large ~20MB each)
    sounds/         — MP3 files
    images/         — entity sprites, UI images
  vite.config.js    — base: './' for relative paths
assets/             — Blender source files (not served)
  Blend/            — .blend files for each room + characters
  Archimesh/        — Blender architecture addon outputs
  Objects/          — OBJ/MTL exports
  Images/           — source PNGs, XCF files
Dockerfile
nginx.conf.template
.github/workflows/
  pages.yml         — GitHub Pages deployment
  docker.yml        — Docker image build + push to ghcr.io
```
