# Backrooms Horror

First-person horror game set in the Backrooms. Built with Three.js, runs entirely in the browser — no backend required.

**[Play locally](#getting-started)**

---

## Gameplay

You have no-clipped out of reality.

Find **white glowing pages** scattered through the maze. Collect all of them to unlock the exit. A small compass in the bottom-right corner points toward the nearest page.

**Do not stand still** — fear consumes you faster when you stop moving.

### Controls

| Key | Action |
|-----|--------|
| `W A S D` / Arrow keys | Move |
| Mouse | Look around |
| `Shift` | Sprint (drains sanity faster) |
| `Esc` | Pause / release cursor |

### Entities

| Name | Behavior |
|------|----------|
| **El Vigilante** | Freezes when you look at it. Teleports closer the moment you look away. |
| **El Devorador** | Actively hunts you. Turn a corner to break line of sight. Gets faster as your sanity drops. |
| **El Perdido** | Wanders randomly. Deadly on close contact. |

### Sanity

Your sanity drains constantly. Visual and audio effects intensify as it drops:
- Vignette darkens
- Chromatic aberration increases
- Camera jitter at low sanity
- El Devorador accelerates

---

## Levels

| # | Name | Difficulty | Pages | Entities | Atmosphere |
|---|------|-----------|-------|----------|------------|
| 0 | The Lobby | Very Easy | 3 | 1 | Yellow wallpaper, open visibility |
| 1 | Habitable Zone | Easy | 4 | 2 | Green industrial, dense fog |
| 2 | Pipe Dreams | Normal | 5 | 2 | Dark orange, very dense fog |
| 3 | Electrical Station | Difficult | 6 | 3 | Near pitch-black, red emergency lights |

Completing a level advances to the next. Finishing Level 3 ends the game.

---

## Getting Started

```bash
cd backrooms
npm install
npm run dev
```

Open `http://localhost:5173` in a Chromium-based browser.

> Pointer Lock API works best in Chromium/Chrome. Firefox also works. The game requires a user click to start due to browser audio/pointer policies.

### Build for production

```bash
cd backrooms
npm run build
```

Output goes to `backrooms/dist/`. Any static file host works (Netlify, GitHub Pages, etc.).

---

## Project Structure

```
backrooms/
├── main.js          # All game logic (Three.js, entities, levels, sanity)
├── index.html       # HTML shell + HUD overlay elements
├── style.css        # UI styles (intro screen, vignette, compass, menus)
├── vite.config.js   # Vite build config
└── public/
    ├── models/      # GLB room models (room1–12, saviorPizza)
    ├── images/      # Entity sprite textures
    └── sounds/      # Audio files (buzzing, walking, glitch, death, win)
```

### Architecture

**World:** 3×3 sliding grid of pre-built GLB room tiles (12 variants). Rooms recycle as the player walks, creating an effectively infinite maze.

**Entities:** `THREE.Sprite` billboards (always face camera). Three types with distinct AI:
- *Vigilante* — watch/look-away state machine
- *Devorador* — raycasting line-of-sight chase with cached LOS (every 3 frames)
- *Perdido* — random wander with proximity trigger

**Sanity system:** Float 0–100 draining over time. Drives vignette opacity, chromatic aberration shift, canvas CSS filters, and entity speed scaling.

**Lighting:** 5 `PointLight`s (center + 4 cardinal rooms) with per-light flicker state machines (stutter events + full blackouts). Each level has distinct light color and blackout frequency.

**Pages:** `THREE.Mesh` PlaneGeometry with emissive white material + PointLight child. Spawn with ±3m random offset from room Spawn points. Each page spawn triggers an entity to guard the adjacent room.

**Levels:** Array of configs (`LEVEL_CONFIGS`) controlling fog density/color, light color/intensity, entity count/speed, sanity drain rates, page count, and spawn cooldowns. Advancing levels re-runs `init()` with the new config.

---

## Performance Notes

- Pixel ratio capped at 1.5× (prevents 4× pixel cost on Retina displays)
- Shadow maps disabled (no shadow-casting objects in scene)
- LOS raycasting cached for 3 frames per entity
- Compass and page float animations throttled to every 2–4 frames
- 5 lights instead of 9 (range extended to compensate)

---

## Tech Stack

- [Three.js](https://threejs.org/) r157
- [Vite](https://vitejs.dev/) 4.x
- Room models: Blender + Archimesh (original by [zacguymarino](https://github.com/zacguymarino/backrooms-pizza))
