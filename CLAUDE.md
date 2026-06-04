# The Warcrooms — Project Context for Claude

## What is this

3D first-person horror game running in the browser. The player spawns in an infinite
backrooms-style maze, collects pages, and avoids 3 entities. Built with Three.js + Vite.
No backend — 100% static site. Todo el juego está en español.

## Tech stack

- **Three.js 0.157** — 3D rendering, GLTFLoader + DRACOLoader, PointerLockControls, Web Audio API
- **Vite 4** — bundler, dev server (`cd backrooms && npm run dev`)
- **Source**: `backrooms/` — `main.js` es todo el juego (~1600 líneas)
- **Assets**: `backrooms/public/` — models, sounds, images
- **Docker**: nginx sirve `backrooms/dist/`

## Deployments

| URL | Platform | Trigger |
|-----|----------|---------|
| `https://wildrelation.github.io/backrooms-horror/` | GitHub Pages (Fastly CDN) | push to main |
| `https://the-warcrooms.app.cloud.cbh.kth.se` | KTH Cloud (Sweden) | push to main |

Push to `main` → ambos deployments automáticos (~1–2 min).
**GitHub Pages es preferido** — CDN global, más rápido para Latinoamérica.

## Game architecture

### Rooms
- 12 GLB room models (`backrooms/public/models/room1.glb` … `room12.glb`)
- **Comprimidos**: Draco geometría + WebP texturas 1024px → ~700KB cada uno (eran ~20MB)
- **Draco decoders** en `backrooms/public/draco/` — requerido por `DRACOLoader`
- Grid 3×3 (`currentRooms[9]`). Al salir del grid, 3 cuartos se rotan de `unusedRooms`
- Rooms 1–9 cargan al inicio. Rooms 10–12 cargan en background via `loadReserveRooms()`
- Cada room tiene un objeto `Spawn` usado como anchor para páginas y entidades

### Entities

**El Vigilante**
- Se congela cuando el jugador lo mira **con línea de visión directa** (usa `hasLineOfSight` + `isLookingAt`)
- Al apartar la vista: deja una silueta fantasma que se desvanece (600ms) y se teleporta más cerca (55% distancia, máx 9u)
- Umbral mínimo de teleporte: `dist > 1.5`
- `killDist: 1.8`

**El Devorador**
- Persigue con line-of-sight (LOS cacheado cada 8 frames)
- Velocidad = `speedBase + fear * speedFear` — escala con el miedo
- Al perder LOS: persigue hacia última posición conocida 4s; luego se teleporta **detrás del jugador**
- Al primer avistamiento: 0.25s de silencio antes de que suene el glitch (contraste de susto)
- Camera shake cuando está a menos de 8 unidades
- Sonido de pasos (`steps_devorador.mp3`): volumen por distancia (<30u), velocidad de reproducción escala con speed
- `killDist: 1.2`; `darkBg: true` (AdditiveBlending elimina fondo blanco)

**El Perdido**
- A más de 12 unidades: deambula entre puntos Spawn de cuartos (no posiciones aleatorias)
- A menos de 12 unidades: **sigue lentamente al jugador** (0.9u/s) — no para hasta que te alejes
- Tose (`cough.mp3`) cuando el jugador está a menos de 9 unidades, cooldown 4–8s
- `killDist: 0.7`

### Sanity system
- Empieza en 100, barra bottom-center (dorado → rojo con el miedo)
- **Drena**: base idle (`drainIdle` por nivel) + quieto (+5/s) + sprint (+3/s) + entidades cerca (hasta `drainEntity`/s) + apagón (+6/s)
- **Recupera**: +10/s **solo caminando** (no sprint, no quieto)
- **A 0**: apagón forzado 4s (`triggerSanityCollapse`), no mata directamente
- Consecuencias de miedo alto: Devorador a velocidad máxima + distorsión visual + apagones frecuentes

### Blackouts
- **Tirados a la cordura**, no aleatorios:
  - Cordura > 75%: sin apagones
  - Cordura 50–75%: ocasionales (cada 20–45s, 0.2–0.6s)
  - Cordura < 50%: frecuentes y más largos (hasta 1.3s, cada 8–20s escalando con miedo)
- Implementación: `light.intensity = 0` + `ambientLight.intensity = 0` + CSS `#blackoutOverlay` (negro total)
- La barra de cordura (z-index 15) permanece visible durante apagones

### Audio
Volúmenes actuales:
- `walking.mp3`: 0.3 (loop)
- `buzzing.mp3`: 0.22 (ambient loop — se silencia gradualmente cuando hay entidad a <25u)
- `glitch.mp3`: 0.22 + low-pass filter 1400Hz (chase; 0.25s silencio antes del primer spot)
- `cough.mp3`: 0.35 (El Perdido, proximity warning)
- `breathing.mp3`: 0–0.35 (loop, activa cuando miedo > 45%, volumen escala con miedo)
- `steps_devorador.mp3`: 0–0.55 (loop, activa <30u, playback rate escala con velocidad)
- `death.mp3`: 0.6
- `win.mp3`: 0.6

### HUD elements
- **Contador de páginas** — top-right, dots (○●)
- **Page radar** — bottom-left, punto si hay página en el área
- **Exit compass** — bottom-right, brújula apuntando a la salida (aparece tras recoger todas las páginas)
- **Sanity bar** — bottom de la pantalla, 5px, dorado→rojo
- **Level indicator** — top-center, nombre del nivel actual
- **Pause overlay** — ESC pausa real: "PAUSADO", Continuar, Salir al menú
- **Lore text** — aparece al recoger una página
- **FPS counter** — top-left, sutil

## Known issues / decisions

| Issue | Status | Notes |
|-------|--------|-------|
| Loading freeze | Fixed | Progress counter + error message |
| Stuck at 1/12 (CPU) | Fixed | Lazy-load rooms 10–12 |
| Framerate movement | Fixed | `Math.exp(-15*delta)` friction |
| Pages in walls | Fixed | Offset + height ajustado |
| Audio harsh/loud | Fixed | Volúmenes reducidos, glitch con low-pass |
| 228MB download | Fixed | Draco+WebP → 8.6MB total |
| Perdido through walls | Fixed | Usa Spawn points, no posiciones random |
| Glitch sound conflict | Fixed | Centralizado en `updateEntities()` |
| Sanity not recovering | Fixed | Solo recupera caminando, 10/s |
| Blackout not black | Fixed | CSS overlay + ambientLight = 0 |
| Devorador white bg | Fixed | `darkBg: true` AdditiveBlending |
| Vigilante through walls | Fixed | Requiere `hasLineOfSight()` para congelarse |
| Blackouts siempre activos | Fixed | Ahora atados a nivel de cordura |

## Pendientes — mejoras pendientes

| # | Idea | Detalle |
|---|------|---------|
| 9 | **Páginas parpadean con peligro cerca** | La luz de las páginas parpadea cuando hay una entidad en el mismo cuarto. |
| 10 | **El Vigilante bloquea pasillos** | Se teleporta hacia la puerta más cercana, no en línea recta. |

## Development workflow

```bash
cd backrooms
npm install
npm run dev      # local dev server at localhost:5173
npm run build    # output to backrooms/dist/
```

## Repo structure

```
backrooms/
  main.js           — toda la lógica del juego (~1600 líneas)
  index.html
  style.css
  public/
    models/         — GLBs Draco+WebP (~700KB cada uno)
    sounds/         — walking, buzzing, glitch, cough, breathing,
                      steps_devorador, death, win
    images/         — sprites de entidades, loading screen
    draco/          — decoders WASM para DRACOLoader
assets/             — fuentes Blender (no se sirven)
Dockerfile
nginx.conf.template
.github/workflows/
  pages.yml         — deploy GitHub Pages
  docker.yml        — build + push Docker image
```
