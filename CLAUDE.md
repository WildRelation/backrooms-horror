# The Warcrooms — Project Context for Claude

## What is this

3D first-person horror game running in the browser. The player spawns in an infinite
backrooms-style maze, collects pages, and avoids 3 entities. Built with Three.js + Vite.
No backend — 100% static site.

## Tech stack

- **Three.js 0.157** — 3D rendering, GLTFLoader + DRACOLoader, PointerLockControls, Web Audio API
- **Vite 4** — bundler, dev server (`cd backrooms && npm run dev`)
- **Source**: `backrooms/` — `main.js` is the entire game (~1450 lines)
- **Assets**: `backrooms/public/` — models, sounds, images (Vite copies these to `dist/` on build)
- **Blender sources**: `assets/Blend/` and `assets/Archimesh/` (.blend files)
- **Docker**: nginx serves `backrooms/dist/` — see `Dockerfile` and `nginx.conf.template`

## Deployments

| URL | Platform | Trigger |
|-----|----------|---------|
| `https://wildrelation.github.io/backrooms-horror/` | GitHub Pages (Fastly CDN) | push to main |
| `https://the-warcrooms.app.cloud.cbh.kth.se` | KTH Cloud (Sweden) | push to main |

Both deploy automatically via GitHub Actions on push to `main`.
**GitHub Pages is preferred** — global CDN, faster for Latin America.

## Game architecture

### Rooms
- 12 GLB room models (`backrooms/public/models/room1.glb` … `room12.glb`)
- **Compressed**: Draco geometry + WebP textures 1024px → ~700KB each (was ~20MB)
- **Draco decoders** in `backrooms/public/draco/` — required by `DRACOLoader`
- Arranged in a 3×3 grid (`currentRooms[9]`). When player exits the grid, 3 rooms
  swap in from `unusedRooms` — infinite world effect
- **Rooms 1–9** load at startup. **Rooms 10–12** load in background via `loadReserveRooms()`
- Each room has a named `Spawn` object used as placement anchor for pages and entities

### Entities
- **El Vigilante** — freezes when player looks at it (flickers), teleports closer when you look away
- **El Devorador** — chases player via line-of-sight; speed = `speedBase + fear * speedFear`; uses `darkBg: true` (AdditiveBlending) to remove white background
- **El Perdido** — wanders between room Spawn points (NOT random positions — avoids wall clipping); plays `cough.mp3` when player is within 9 units
- `fear = 1 - sanity / 100` — controls Devorador speed and visual FX intensity
- **Glitch sound** controlled centrally in `updateEntities()`: Devorador chase takes priority over Vigilante being watched

### Sanity system
- Starts at 100, shown as bar bottom-center (gold → red as fear rises)
- **Drains**: idle base (`drainIdle` per level) + standing still (+5/s) + sprinting (+3/s) + entities nearby (up to `drainEntity`/s) + blackout (+6/s)
- **Recovers**: +2.5/s **only while walking** (not sprinting, not standing still)
- **At 0**: triggers forced 4s blackout (`triggerSanityCollapse`)
- Does NOT kill directly — consequences are max Devorador speed + visual distortion

### Player speeds
- Walk: **4 u/s** (`exp(-15*delta)` friction, force = 60)
- Sprint: **7.6 u/s** (`SPRINT_MULTIPLIER = 1.9`)
- Devorador base speeds: 2 / 3 / 4 / 5.5 u/s per level

### Levels (0–3)
Defined in `LEVEL_CONFIGS` array. Each level changes: fog color/density, entity
spawn cooldowns, speed, sanity drain, pages needed (3/4/5/6), max entities.

### Blackouts
- Random: every 30–70s (level 0) down to 10–28s (levels 2–3), duration 0.3–1.4s
- Implementation: sets `light.intensity = 0` + `ambientLight.intensity = 0` + CSS `#blackoutOverlay` (z-index 8) covers canvas completely (pitch black)
- Sanity bar (z-index 15) stays visible above blackout overlay

### Audio
All sounds in Spanish horror context. Current volumes:
- `walking.mp3`: 0.3 (loop)
- `buzzing.mp3`: 0.04 (ambient loop)
- `glitch.mp3`: 0.22 + low-pass filter 1400Hz (chase tension)
- `cough.mp3`: 0.35 (El Perdido proximity warning, cooldown 4–8s)
- `death.mp3`: 0.6
- `win.mp3`: 0.6

### HUD elements
- **Page counter** — top-right, dots (○●) showing collected/needed
- **Page radar** — bottom-left, shows if a page is in current area
- **Exit compass** — bottom-right, arrow pointing to exit (appears after all pages collected)
- **Sanity bar** — bottom-center, 3px thin line, gold→red (KNOWN ISSUE: too thin/invisible)
- **Level indicator** — top-center, current level name (hidden until game starts)
- **Pause overlay** — ESC triggers real pause, shows "PAUSADO" with Continuar/Salir buttons
- **Lore text** — appears center when collecting a page
- **FPS counter** — top-left, subtle

## Known issues / decisions

| Issue | Status | Notes |
|-------|--------|-------|
| Loading freeze (no progress) | Fixed | Progress counter + error message |
| Stuck at 1/12 (CPU saturation) | Fixed | Lazy-load rooms 10–12 |
| Framerate-dependent movement | Fixed | `Math.exp(-15*delta)` friction |
| Pages spawning in walls | Fixed | Offset reduced, height adjusted |
| Audio too loud / harsh | Fixed | Volumes reduced, glitch has low-pass filter |
| 228MB model download | Fixed | Draco+WebP compression → 8.6MB total |
| El Perdido walking through walls | Fixed | Uses room Spawn points as wander targets |
| Glitch sound conflict (2 entities) | Fixed | Centralized in `updateEntities()` |
| Sanity not recovering when walking | Fixed | Recovery only applies while walking |
| Blackout not fully black | Fixed | CSS overlay + ambientLight.intensity = 0 |
| El Devorador white background | Fixed | `darkBg: true` → AdditiveBlending |

## Pendientes — bugs conocidos (verificados, listos para implementar)

| # | Problema | Archivo | Detalle |
|---|----------|---------|---------|
| 1 | **Intro en inglés** | `index.html` | Líneas del lore siguen en inglés: `"You have no-clipped out of reality."`, `"Estimated square footage: 600,000,000+"`, `"Entities present: unknown"`. El juego debe estar completamente en español. |
| 2 | **Barra de cordura invisible** | `style.css` + `main.js` | `#sanityBar` tiene solo 3px de alto, casi imperceptible durante el juego. Necesita más presencia visual. |
| 3 | **"INTENTAR DE NUEVO" rompe en dos líneas** | `style.css` | Texto demasiado largo para el botón de 280px de ancho del menú final. |

## Potential improvements (not yet done)

- **Nginx gzip for GLBs** — `gzip_types` solo cubre text/JS/CSS. Añadir `application/octet-stream` ayudaría en KTH Cloud.

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
  main.js           — entire game logic (~1450 lines)
  index.html        — entry point
  style.css
  public/
    models/         — GLB files, Draco+WebP compressed (~700KB each)
    sounds/         — MP3 files
    images/         — entity sprites (PNG), loading screen
    draco/          — Draco WASM decoders (required for GLB loading)
  vite.config.js    — base: './' for relative paths
assets/             — Blender source files (not served)
Dockerfile
nginx.conf.template
.github/workflows/
  pages.yml         — GitHub Pages deployment
  docker.yml        — Docker image build + push to ghcr.io
```
