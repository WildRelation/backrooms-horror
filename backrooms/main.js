import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Monkey-patch Three.js so all Mesh raycasts use the BVH acceleration structure
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ─── Level configs ────────────────────────────────────────────────────────────

const LEVEL_CONFIGS = [
  {
    name:        'Nivel 0 — The Lobby',
    fogColor:    0xc8a84a, fogNear: 10, fogFar: 42,
    bgColor:     0x1a1500,
    ambientColor:0x3d3010,
    lightColor:  0xd4b060, lightMin: 18, lightMax: 28,
    tint:        null,                                 // no tint — base look
    pagesNeeded: 3,
    maxEntities: 1,
    speedBase:   2.0, speedFear: 3.0,
    drainIdle:   1.2, drainEntity: 14,
    cooldowns:   { vigilante: 40, devorador: 35, perdido: 50 },
    initCooldowns:{ vigilante: 20, devorador: 15, perdido: 25 },
  },
  {
    name:        'Nivel 1 — Habitable Zone',
    fogColor:    0x7a9a68, fogNear: 6,  fogFar: 16,
    bgColor:     0x080e05,
    ambientColor:0x101808,
    lightColor:  0xa0c080, lightMin: 13, lightMax: 20,
    tint:        'rgba(0, 60, 10, 0.18)',              // green industrial tint
    pagesNeeded: 4,
    maxEntities: 2,
    speedBase:   3.0, speedFear: 4.5,
    drainIdle:   1.8, drainEntity: 16,
    cooldowns:   { vigilante: 28, devorador: 22, perdido: 35 },
    initCooldowns:{ vigilante: 12, devorador: 10, perdido: 18 },
  },
  {
    name:        'Nivel 2 — Pipe Dreams',
    fogColor:    0x3a2808, fogNear: 4,  fogFar: 12,
    bgColor:     0x080400,
    ambientColor:0x100600,
    lightColor:  0xd06018, lightMin: 10, lightMax: 16,
    tint:        'rgba(60, 25, 0, 0.25)',              // dark amber tint
    pagesNeeded: 5,
    maxEntities: 2,
    speedBase:   4.0, speedFear: 5.5,
    drainIdle:   2.5, drainEntity: 20,
    cooldowns:   { vigilante: 20, devorador: 16, perdido: 25 },
    initCooldowns:{ vigilante: 8,  devorador: 6,  perdido: 12 },
  },
  {
    name:        'Nivel 3 — Electrical Station',
    fogColor:    0x1a0000, fogNear: 2,  fogFar: 7,
    bgColor:     0x050000,
    ambientColor:0x0a0000,
    lightColor:  0xff2200, lightMin: 6,  lightMax: 11,
    tint:        'rgba(80, 0, 0, 0.30)',               // red emergency tint
    pagesNeeded: 6,
    maxEntities: 3,
    speedBase:   5.5, speedFear: 7.0,
    drainIdle:   4.0, drainEntity: 25,
    cooldowns:   { vigilante: 14, devorador: 10, perdido: 18 },
    initCooldowns:{ vigilante: 4,  devorador: 3,  perdido: 6  },
  },
];

const MAX_LEVEL = LEVEL_CONFIGS.length - 1;

const ENTITY_DEFS = [
  {
    id: 'vigilante',
    src: './images/entity_vigilante.png',
    w: 2.4, h: 2.4,           // face crop — enlarged so it fills corridor
    centerY: 1.65,             // float at eye level
    killDist: 1.8,
    deathMsg: 'Él te encontró.',
    darkBg: true,
    spawnCooldown: 25,
  },
  {
    id: 'devorador',
    src: './images/entity_devorador.png',
    w: 2.4, h: 2.4,
    centerY: 1.65,             // face/torso — center at eye level
    killDist: 1.2,
    deathMsg: 'Fuiste devorado.',
    darkBg: false,
    spawnCooldown: 20,
  },
  {
    id: 'perdido',
    src: './images/entity_perdido.png',
    w: 1.7, h: 3.2,           // full body — stands on floor
    centerY: 1.6,              // h/2 ≈ floor to crown
    killDist: 0.7,
    deathMsg: 'No estabas solo.',
    darkBg: false,
    spawnCooldown: 30,
  },
];

// ─── State ────────────────────────────────────────────────────────────────────

let scene, camera, renderer, controls;
let raycaster;
let prevTime;
let direction, velocity;

let moveForward, moveBackward, moveLeft, moveRight, isSprinting;
let playerMesh, playerCollisions, allRoomGeometry;
let rays;
let losRaycaster; // separate raycaster for line-of-sight checks

// Pre-flattened mesh lists — rebuilt when rooms change, reused every frame
let cachedCollisionMeshes = [];
// BVH build queue — one geometry computed per frame to avoid stutter
let bvhQueue = [];
let cachedLOSMeshes = [];

let currentRooms, unusedRooms, currentRoomBounds;
let roomPositions, limbo;
let room1, room2, room3, room4, room5, room6,
    room7, room8, room9, room10, room11, room12;

// Sprite entities – populated after textures load
let entities = [];          // { def, sprite, active, state, cooldown, wasWatched, wanderTarget, wanderTimer }
let spawnCooldowns = {};    // { vigilante: N, devorador: N, perdido: N }

// Lights
let roomLights = [];
let flickerStates = [];

// Sanity
let sanity;
const SANITY_DRAIN_STILL  = 5;
const SANITY_DRAIN_SPRINT = 8;
const SANITY_DRAIN_DARK   = 6;
const SANITY_RECOVER      = 0.4;
const SPRINT_MULTIPLIER   = 1.9;

// Level
let currentLevel = 0;
let entityNearby = false;
let inBlackout   = false;

// Pages / exit
let pagesCollected = 0;
let pageMeshes     = [];   // active page objects in the world
let exitMesh       = null;
let exitSpawned    = false;

// Lore texts per level — shown when a page is collected
const LEVEL_LORE = [
  [ // Nivel 0 — El Lobby
    '"el zumbido nunca para.\nllevo aquí 47 días."',
    '"sigue caminando.\nquedarte quieto los atrae."',
    '"encontré esta nota en el suelo.\ndecía exactamente esto."',
    '"las luces no tienen interruptores.\nnunca se apagan."',
    '"estaba en plena partida de illaoi.\nde repente... esto."',
    '"ejecutado porque la copia\ntiene más vida que el campeón."',
    '"¿warc? ¿eres tú?\npor favor responde."',
    '"escuché una voz que gritaba EJECUTADO.\nluego silencio."',
    '"encontré un teclado.\nescribí illaoi. las paredes temblaron."',
    '"warc no está perdido.\nwarc es el nivel."',
  ],
  [ // Nivel 1 — Habitable Zone
    '"las tuberías no deberían\nhacer ese ruido."',
    '"vi a alguien en el pasillo.\nno era humano."',
    '"el agua huele a almendra.\nno la bebas."',
    '"hay camas aquí. usadas.\naún calientes."',
    '"vi a alguien. se parecía a warc.\npero algo estaba mal."',
    '"warcbubu estuvo aquí.\nno sigas sus huellas."',
    '"me dijo que jugaba illaoi.\nlos tentáculos no eran del juego."',
    '"warcbubu no camina.\nflotar no debería ser posible aquí."',
    '"dejó una nota: \'ejecutado\'.\nnada más. solo eso."',
  ],
  [ // Nivel 2 — Pipe Dreams
    '"la oscuridad aquí tiene peso."',
    '"los conductos se mueven.\nlo escucho por las noches."',
    '"día 12. mi linterna murió.\nno estoy solo."',
    '"caminé durante horas.\nvolvía al mismo punto."',
    '"no entres en los túneles sin luz.\nno saldrás."',
    '"warcnigga controla este nivel.\nnunca lo mires a los ojos."',
    '"aquí warc es la R de illaoi.\ntú eres la copia."',
    '"warcnigga me encontró.\ncorri tres horas. sigo corriendo."',
    '"la copia tiene más vida que el campeón.\naquí eso no es un chiste."',
  ],
  [ // Nivel 3 — Electrical Station
    '"alta tensión. no toques nada."',
    '"las luces parpadean en morse.\ndice: CORRE."',
    '"el generador lleva semanas activo.\nnadie lo encendió."',
    '"siempre hay electricidad.\nnunca hay personas."',
    '"si lees esto ya es tarde."',
    '"warc enano vive en los conductos.\nlo escucho reírse."',
    '"warc enano es pequeño.\npero es más rápido que tú."',
    '"ejecutado. siempre ejecutado.\nla copia tiene más vida que el campeón."',
    '"los tres están aquí: warcbubu, warcnigga, warc enano.\nno puedes esquivarlos a todos."',
    '"warc era un streamer de lol.\nahora es esto.\ntú serás lo siguiente."',
  ],
];
let usedLoreIndices = new Set();

function showLore(level) {
  const texts = LEVEL_LORE[Math.min(level, LEVEL_LORE.length - 1)];
  const available = texts.map((_, i) => i).filter(i => !usedLoreIndices.has(i));
  if (available.length === 0) return;
  const idx = available[Math.floor(Math.random() * available.length)];
  usedLoreIndices.add(idx);
  const el = document.getElementById('loreText');
  if (!el) return;
  el.textContent = texts[idx];
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4500);
}

// Audio
let walkingSound, buzzingSound, glitchSound, deathSound, winSound;
let audioListener = null;
let audioLoader;
let animFrameId = null;

// Volume — persisted across sessions
let volumeLevel = parseFloat(localStorage.getItem('volumeLevel') ?? '0.7');
let frameCount  = 0;

// Game state
let gameActive     = false;
let gameLost       = false;
let gameWon        = false;
let playerMovement = false;
let startTime;
let deathMessage   = '';

// DOM
const introScreen  = document.getElementById('introScreen');
const vignette     = document.getElementById('vignette');
const chromaticA   = document.getElementById('chromaticA');
const chromaticB   = document.getElementById('chromaticB');
const noiseOverlay = document.getElementById('noiseOverlay');
const colorScreen  = document.getElementById('colorScreen');
const endMessage   = document.getElementById('endMessage');
const menuEl       = document.getElementById('menu');
const timeEl       = document.getElementById('time');
const timerHint    = document.getElementById('timerHint');
const crosshairEl  = document.getElementById('crosshair');

// ─── Utils ────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo, hi)      { return lo + Math.random() * (hi - lo); }
function sleep(ms)         { return new Promise(r => setTimeout(r, ms)); }

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Cancel previous animation loop before anything else
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Stop all sounds from previous session
  [walkingSound, buzzingSound, glitchSound, deathSound, winSound]
    .forEach(s => { try { if (s?.isPlaying) s.stop(); } catch(_) {} });
  // Reset buzzing — will restart after next pointer lock

  document.querySelectorAll('canvas').forEach(c => c.remove());
  if (renderer) renderer.dispose();

  gameLost = gameWon = false;
  gameActive = playerMovement = false;
  frameCount = 0;
  pagesCollected = 0;
  pageMeshes = [];
  exitSpawned = false;
  exitMesh = null;
  sanity = 100;
  entityNearby = inBlackout = false;
  entities = [];
  usedLoreIndices = new Set();
  const cfg = LEVEL_CONFIGS[currentLevel];
  spawnCooldowns = { ...cfg.initCooldowns };
  moveForward = moveBackward = moveLeft = moveRight = isSprinting = false;

  colorScreen.style.display = 'none';
  colorScreen.className = '';
  endMessage.style.display = 'none';
  menuEl.style.display = 'none';
  crosshairEl.classList.remove('hidden');
  resetSanityFX();
  // Reset page counter
  const pageCounter = document.getElementById('pageCounter');
  if (pageCounter) { pageCounter.innerHTML = ''; pageCounter.style.opacity = '0'; }
  document.getElementById('pageCompass')?.classList.remove('show');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.bgColor);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Cap pixel ratio — on Retina screens native ratio means 4x the pixels
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  // No shadow maps — nothing in this game casts shadows
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  controls  = new PointerLockControls(camera, renderer.domElement);
  raycaster    = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 25);
  losRaycaster = new THREE.Raycaster();
  prevTime  = performance.now();
  direction = new THREE.Vector3();
  velocity  = new THREE.Vector3();

  // Collision rays
  rays = [
    new THREE.Vector3( 0,0, 1), new THREE.Vector3( 1,0, 1),
    new THREE.Vector3( 1,0, 0), new THREE.Vector3( 1,0,-1),
    new THREE.Vector3( 0,0,-1), new THREE.Vector3(-1,0,-1),
    new THREE.Vector3(-1,0, 0), new THREE.Vector3(-1,0, 1),
  ];

  // Invisible player hitbox
  playerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshNormalMaterial()
  );
  playerMesh.visible = false;
  playerMesh.name = 'playerMesh';
  scene.add(playerMesh);

  // Fog – yellowish, tight
  scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  // Apply per-level color tint overlay
  const levelTint = document.getElementById('levelTint');
  if (levelTint) {
    if (cfg.tint) {
      levelTint.style.background = cfg.tint;
      levelTint.classList.add('active');
    } else {
      levelTint.style.background = '';
      levelTint.classList.remove('active');
    }
  }

  // Lighting
  scene.add(new THREE.AmbientLight(cfg.ambientColor, 0.8));
  initRoomLights(cfg);

  // Room grid
  roomPositions = [
    new THREE.Vector3(-25.6, 0,-25.6), new THREE.Vector3(0, 0,-25.6), new THREE.Vector3(25.6, 0,-25.6),
    new THREE.Vector3(-25.6, 0,  0),   new THREE.Vector3(0, 0,  0),   new THREE.Vector3(25.6, 0,  0),
    new THREE.Vector3(-25.6, 0, 25.6), new THREE.Vector3(0, 0, 25.6), new THREE.Vector3(25.6, 0, 25.6),
  ];
  limbo = new THREE.Vector3(0, -500, 0);
  currentRoomBounds = [-25.3, 25.3, 0.3, -0.3];

  room1  = new THREE.Object3D(); room2  = new THREE.Object3D(); room3  = new THREE.Object3D();
  room4  = new THREE.Object3D(); room5  = new THREE.Object3D(); room6  = new THREE.Object3D();
  room7  = new THREE.Object3D(); room8  = new THREE.Object3D(); room9  = new THREE.Object3D();
  room10 = new THREE.Object3D(); room11 = new THREE.Object3D(); room12 = new THREE.Object3D();

  initAudio();

  // Remove first to avoid duplicate listeners on restart
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup',   onKeyUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);
  renderer.domElement.addEventListener('mousemove', () => {
    setTimeout(() => crosshairEl.classList.add('hidden'), 3000);
  }, { once: true });

  controls.addEventListener('lock',   onControlsLock);
  controls.addEventListener('unlock', onControlsUnlock);

  // Show loading state — user can't click yet
  const clickPrompt = document.getElementById('clickPrompt');
  clickPrompt.style.animation = 'none';
  clickPrompt.textContent = 'cargando... (0/9)';

  introScreen.style.opacity = '1';
  introScreen.style.display = 'flex';
  introScreen.classList.remove('fade-out');

  try {
    await loadAssets(loaded => {
      clickPrompt.textContent = `cargando... (${loaded}/9)`;
    });
  } catch (err) {
    clickPrompt.style.color = '#ff4444';
    clickPrompt.textContent = 'error al cargar — recarga la página (F5)';
    console.error('loadAssets failed:', err);
    return;
  }

  currentRooms = [room1,room2,room3,room4,room5,room6,room7,room8,room9];
  unusedRooms  = [];
  setupScene();
  loadReserveRooms();

  // Assets ready — now enable the click-to-enter
  clickPrompt.textContent = 'haz clic para entrar';
  clickPrompt.style.animation = '';

  introScreen.addEventListener('click', onIntroClick, { once: true });
  renderer.domElement.addEventListener('click', onCanvasClick);

  animate();
}

function onIntroClick(e) {
  if (e.target.tagName === 'INPUT') return; // slider click — don't consume the listener
  introScreen.classList.add('fade-out');
  // Must call lock() synchronously from the user gesture — setTimeout breaks it in Firefox/Safari
  controls.lock();
  setTimeout(() => { introScreen.style.display = 'none'; }, 1300);
}
function onCanvasClick() {
  // Re-lock whenever pointer is free and game isn't over — covers fullscreen transitions too
  if (!controls.isLocked && !gameLost && !gameWon) controls.lock();
}
function onControlsLock() {
  if (!startTime) startTime = performance.now();
  gameActive = playerMovement = true;
  timerHint.classList.remove('show');
  // Start ambient buzzing now that we have a user gesture
  if (buzzingSound.buffer && !buzzingSound.isPlaying) buzzingSound.play();
  if (pagesCollected === 0) {
    const cfg = LEVEL_CONFIGS[currentLevel];
    showHint(`${cfg.name} — busca las páginas blancas`, 5000);
    updatePageCounter();
  }
}
function onControlsUnlock() {
  if (!gameLost && !gameWon) {
    playerMovement = false;
    if (gameActive) showHint('haz clic para continuar', 99999); // stays until re-locked
  }
}

function showHint(text, ms) {
  timerHint.textContent = text;
  timerHint.classList.add('show');
  setTimeout(() => timerHint.classList.remove('show'), ms);
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function initAudio() {
  audioListener = new THREE.AudioListener();
  audioListener.setMasterVolume(volumeLevel);
  const listener = audioListener;
  camera.add(listener);
  audioLoader = new THREE.AudioLoader();

  walkingSound   = new THREE.Audio(listener);
  buzzingSound   = new THREE.Audio(listener);
  glitchSound    = new THREE.Audio(listener);
  deathSound     = new THREE.Audio(listener);
  winSound       = new THREE.Audio(listener);

  audioLoader.load('./sounds/walking.mp3', buf => {
    walkingSound.setBuffer(buf); walkingSound.setLoop(true); walkingSound.setVolume(0.3);
  });
  audioLoader.load('./sounds/buzzing.mp3', buf => {
    buzzingSound.setBuffer(buf); buzzingSound.setLoop(true); buzzingSound.setVolume(0.04);
    // Play only after user gesture — browsers block audio before interaction
  });
  audioLoader.load('./sounds/glitch.mp3', buf => {
    glitchSound.setBuffer(buf); glitchSound.setLoop(false); glitchSound.setVolume(0.22);
    // Low-pass filter to cut the harsh high frequencies
    const lpf = listener.context.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1400;
    glitchSound.setFilter(lpf);
  });
  audioLoader.load('./sounds/death.mp3', buf => {
    deathSound.setBuffer(buf); deathSound.setLoop(false); deathSound.setVolume(0.6);
  });
  audioLoader.load('./sounds/win.mp3', buf => {
    winSound.setBuffer(buf); winSound.setLoop(false); winSound.setVolume(0.6);
  });
}

// ─── Lights ───────────────────────────────────────────────────────────────────

// Only 5 lights: center + 4 cardinal rooms (indices 1,3,4,5,7)
// Corners share light from adjacent rooms — halves GPU light cost
const LIGHT_ROOM_INDICES = [1, 3, 4, 5, 7];

function initRoomLights(cfg) {
  roomLights = []; flickerStates = [];
  const blackoutFreq = currentLevel === 0 ? [30,70] : currentLevel === 1 ? [18,45] : [10,28];
  for (let i = 0; i < LIGHT_ROOM_INDICES.length; i++) {
    const light = new THREE.PointLight(cfg.lightColor, 0, 38);
    scene.add(light);
    roomLights.push(light);
    flickerStates.push({
      baseIntensity: rand(cfg.lightMin, cfg.lightMax),
      phase: rand(0, Math.PI * 2),
      freq: rand(0.8, 2.2),
      stutterTimer: rand(4, 12), stutterActive: false, stutterDuration: 0,
      blackoutTimer: rand(...blackoutFreq), blackoutActive: false, blackoutDuration: 0,
    });
  }
}

function updateRoomLights(delta, time) {
  let anyBlackout = false;
  for (let i = 0; i < roomLights.length; i++) {
    const light   = roomLights[i];
    const st      = flickerStates[i];
    const roomIdx = LIGHT_ROOM_INDICES[i];
    if (currentRooms?.[roomIdx]) {
      const rp = currentRooms[roomIdx].scene.position;
      light.position.set(rp.x, 3.5, rp.z);
    }
    st.stutterTimer  -= delta;
    st.blackoutTimer -= delta;
    if (st.stutterTimer  <= 0) { st.stutterActive = true;  st.stutterDuration = rand(0.05,0.25); st.stutterTimer  = rand(2,10); }
    if (st.blackoutTimer <= 0) { st.blackoutActive = true;  st.blackoutDuration = rand(0.3,1.4);  st.blackoutTimer = rand(15,50); }

    if (st.blackoutActive) {
      st.blackoutDuration -= delta; light.intensity = 0; anyBlackout = true;
      if (st.blackoutDuration <= 0) st.blackoutActive = false;
      continue;
    }
    if (st.stutterActive) {
      st.stutterDuration -= delta;
      light.intensity = Math.random() < 0.5 ? 0 : st.baseIntensity * 0.4;
      if (st.stutterDuration <= 0) st.stutterActive = false;
      continue;
    }
    light.intensity = st.baseIntensity * (Math.sin(time * st.freq + st.phase) * 0.08 + 1.0);
  }
  inBlackout = anyBlackout;
}

// ─── Asset loading ────────────────────────────────────────────────────────────

function makeGLTFLoader() {
  const draco = new DRACOLoader();
  draco.setDecoderPath('./draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}

async function loadAssets(onProgress) {
  const loader = makeGLTFLoader();
  let loaded = 0;
  const loadGLB = id => loader.loadAsync(`./models/${id}.glb`).then(glb => {
    onProgress?.(++loaded);
    return glb;
  });
  const texLoader = new THREE.TextureLoader();

  // Load only the 9 rooms needed immediately; rooms 10-12 load in background after game starts
  [room1, room2, room3, room4, room5, room6,
   room7, room8, room9] = await Promise.all([
    loadGLB('room1'), loadGLB('room2'), loadGLB('room3'),
    loadGLB('room4'), loadGLB('room5'), loadGLB('room6'),
    loadGLB('room7'), loadGLB('room8'), loadGLB('room9'),
  ]);

  // Build sprite entities
  for (const def of ENTITY_DEFS) {
    const texture = await texLoader.loadAsync(def.src);

    let material;
    if (def.darkBg) {
      // Additive blending: dark background vanishes, bright face glows through
      material = new THREE.SpriteMaterial({
        map: texture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: 0xffffff,
      });
    } else {
      material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.08,
        depthWrite: false,
      });
    }

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(def.w, def.h, 1);
    sprite.name = def.id;
    sprite.visible = false;
    sprite.position.copy(limbo);
    scene.add(sprite);

    entities.push({
      def,
      sprite,
      active:      false,
      state:       'idle',
      wasWatched:  false,
      wanderTarget: new THREE.Vector3(),
      wanderTimer:  0,
    });
  }
}

// ─── Reserve room background loader ──────────────────────────────────────────

async function loadReserveRooms() {
  const loader = makeGLTFLoader();
  try {
    [room10, room11, room12] = await Promise.all([
      loader.loadAsync('./models/room10.glb'),
      loader.loadAsync('./models/room11.glb'),
      loader.loadAsync('./models/room12.glb'),
    ]);
    [room10, room11, room12].forEach(r => {
      r.scene.visible = false;
      r.scene.position.copy(limbo);
      scene.add(r.scene);
    });
    unusedRooms.push(room10, room11, room12);
  } catch (err) {
    console.warn('Reserve rooms failed to load:', err);
  }
}

// ─── Mesh cache ───────────────────────────────────────────────────────────────

// Pre-flatten scene graphs into plain Mesh arrays so raycasters don't have to
// traverse the scene hierarchy on every call (avoids O(n_nodes) traversal × N rays/frame).
function rebuildMeshCaches() {
  cachedCollisionMeshes = [];
  playerCollisions.forEach(s => s.traverse(o => {
    if (o.isMesh) {
      if (!o.geometry.boundsTree && !bvhQueue.includes(o.geometry)) bvhQueue.push(o.geometry);
      cachedCollisionMeshes.push(o);
    }
  }));

  // LOS only needs the 5 rooms the player/entities actually occupy — center + 4 cardinals.
  cachedLOSMeshes = [];
  [1, 3, 4, 5, 7].forEach(i => {
    currentRooms[i]?.scene.traverse(o => {
      if (o.isMesh) {
        if (!o.geometry.boundsTree && !bvhQueue.includes(o.geometry)) bvhQueue.push(o.geometry);
        cachedLOSMeshes.push(o);
      }
    });
  });
}

// ─── Scene setup ─────────────────────────────────────────────────────────────

function setupScene() {
  [room1,room2,room3,room4,room5,room6,room7,room8,room9].forEach(r => {
    scene.remove(r.scene); scene.add(r.scene);
  });
  currentRooms.forEach((r, i) => r.scene.position.copy(roomPositions[i]));
  unusedRooms.forEach(r => { r.scene.visible = false; r.scene.position.copy(limbo); });
  // Only center room — adjacent room walls block doorways if we include them
  playerCollisions  = [currentRooms[4].scene];
  allRoomGeometry   = currentRooms.map(r => r.scene);
  rebuildMeshCaches();

  const spawnWorld = currentRooms[1].scene.getObjectByName('Spawn')
    .localToWorld(new THREE.Vector3());
  controls.object.position.set(spawnWorld.x, 1.65, spawnWorld.z);
  controls.object.rotation.y = Math.PI / 4;

  checkRoomChange(controls);
  // Guarantee 2 pages in different rooms (shuffle, take first 2)
  const startSlots = [1, 3, 5, 7].sort(() => Math.random() - 0.5);
  spawnPageAt(startSlots[0]);
  spawnPageAt(startSlots[1]);
}

// ─── Pages ────────────────────────────────────────────────────────────────────

function spawnPageAt(roomIdx) {
  if (pagesCollected + pageMeshes.length >= LEVEL_CONFIGS[currentLevel].pagesNeeded) return;

  // Use room center so pages never spawn inside walls
  const rp = currentRooms[roomIdx].scene.position;

  // Large bright white page — visible from across the room
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 2.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const offsetX = rand(-1.5, 1.5);
  const offsetZ = rand(-1.5, 1.5);
  page.position.set(rp.x + offsetX, 0.9, rp.z + offsetZ);
  page.rotation.y = Math.random() * Math.PI * 2;

  // Strong white light — visible from across the room without compass
  const pageLight = new THREE.PointLight(0xffffff, 22, 20);
  pageLight.position.set(0, 0, 0);
  page.add(pageLight);

  scene.add(page);
  pageMeshes.push(page);

  // Spawn an entity in the room adjacent to this page — creates tension on approach
  spawnEntityNearPage(page.position);
}

function spawnEntityNearPage(pagePos) {
  if (activeCount() >= LEVEL_CONFIGS[currentLevel].maxEntities) return;

  // For page-triggered spawns ignore cooldowns — monster always guards a page
  const candidates = entities.filter(e => !e.active);
  if (candidates.length === 0) return;

  const ent = candidates[Math.floor(Math.random() * candidates.length)];

  // Find the room nearest to the page (but not the same room — one step away)
  let nearestIdx = -1, nearestDist = Infinity;
  for (let i = 0; i < currentRooms.length; i++) {
    if (i === 4) continue; // skip center
    const rp = currentRooms[i].scene.position;
    const d  = Math.hypot(rp.x - pagePos.x, rp.z - pagePos.z);
    // Prefer rooms 20-40m away (adjacent, not on top of page)
    if (d > 15 && d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }

  if (nearestIdx === -1) {
    // Fallback: any non-center room
    nearestIdx = Math.random() < 0.5 ? 1 : 7;
  }

  spawnEntityAt(ent, nearestIdx);
}

function trySpawnPage() {
  if (pageMeshes.length >= 2) return;
  if (pagesCollected + pageMeshes.length >= LEVEL_CONFIGS[currentLevel].pagesNeeded) return;
  if (Math.random() > 0.75) return; // 75% chance per room transition

  let idx = Math.floor(Math.random() * 8);
  if (idx >= 4) idx++;
  spawnPageAt(idx);
}

function updatePages() {
  if (!gameActive) return;
  const pp  = controls.object.position;
  const now = performance.now();

  for (let i = pageMeshes.length - 1; i >= 0; i--) {
    const page = pageMeshes[i];
    page.rotation.y += 0.018;
    page.position.y  = 1.65 + Math.sin(now / 500 + i) * 0.12; // hover at eye level

    if (pp.distanceTo(page.position) < 1.5) {
      scene.remove(page);
      pageMeshes.splice(i, 1);
      pagesCollected++;
      updatePageCounter();
      showLore(currentLevel);

      if (pagesCollected >= LEVEL_CONFIGS[currentLevel].pagesNeeded) {
        spawnExit();
      } else {
        showHint(`página ${pagesCollected} de ${LEVEL_CONFIGS[currentLevel].pagesNeeded} encontrada`, 3000);
        spawnCooldowns['devorador'] = Math.max(0, (spawnCooldowns['devorador'] ?? 0) - 5);
      }
    }
  }
}

function updatePageCounter() {
  const el = document.getElementById('pageCounter');
  if (!el) return;
  const n = LEVEL_CONFIGS[currentLevel].pagesNeeded;
  const dots = Array.from({ length: n }, (_, i) =>
    `<span class="${i < pagesCollected ? 'dot filled' : 'dot'}">${i < pagesCollected ? '●' : '○'}</span>`
  ).join('');
  el.innerHTML = dots;
  el.style.opacity = '1';
}

function updatePageRadar() {
  const el = document.getElementById('pageRadar');
  if (!el || !gameActive || exitMesh) { el?.classList.remove('show'); return; }

  const pp = controls.object.position;
  // Check if any page is within the current 9-room grid (~75 units radius)
  const pageNearby = pageMeshes.some(p => pp.distanceTo(p.position) < 75);

  el.classList.add('show');
  if (pageNearby) {
    el.textContent = '●';
    el.title = 'hay una página cerca';
    el.classList.remove('far');
  } else {
    el.textContent = '○';
    el.title = 'no hay páginas en esta área — sigue caminando';
    el.classList.add('far');
  }
}

function updatePageCompass() {
  const compass = document.getElementById('pageCompass');
  const arrow   = document.getElementById('pageCompassArrow');
  const label   = document.getElementById('pageCompassLabel');
  if (!compass || !arrow || !gameActive) return;

  // Only show compass when pointing to exit — pages are meant to be explored for
  if (!exitMesh) { compass.classList.remove('show'); return; }
  const target = exitMesh.position;
  const pointingToExit = true;

  const pp = controls.object.position;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  camDir.y = 0; camDir.normalize();

  const toTarget = target.clone().sub(pp);
  toTarget.y = 0; toTarget.normalize();

  const angle = Math.atan2(
    camDir.x * toTarget.z - camDir.z * toTarget.x,
    camDir.x * toTarget.x + camDir.z * toTarget.z
  );

  compass.classList.add('show');
  arrow.style.transform = `rotate(${angle}rad)`;

  // Green tint when pointing to exit, white when pointing to pages
  if (pointingToExit) {
    arrow.style.filter = 'drop-shadow(0 0 5px rgba(0,255,136,0.9))';
    if (label) label.textContent = 'salida';
    compass.style.borderColor = 'rgba(0,255,136,0.3)';
  } else {
    arrow.style.filter = 'drop-shadow(0 0 4px rgba(255,255,255,0.6))';
    if (label) label.textContent = 'página';
    compass.style.borderColor = '';
  }
}

// ─── Exit ─────────────────────────────────────────────────────────────────────

function spawnExit() {
  if (exitMesh) return;

  // Bright green door — unmistakably different from yellow environment
  exitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.9, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: new THREE.Color(0x00ff88),
      emissiveIntensity: 1.2,
    })
  );
  exitMesh.name = 'exit';

  // Strong green light so it's visible through fog
  const exitLight = new THREE.PointLight(0x00ff88, 25, 18);
  exitLight.position.set(0, 0, 0.5);
  exitMesh.add(exitLight);

  // Spawn at room center (scene.position), never at Spawn point which is near walls
  let idx = Math.floor(Math.random() * 8);
  if (idx >= 4) idx++;
  const rc = currentRooms[idx].scene.position;
  exitMesh.position.set(rc.x, 1.45, rc.z);
  scene.add(exitMesh);

  showHint('todas las páginas reunidas — busca la luz verde', 8000);
}

// ─── Sanity ───────────────────────────────────────────────────────────────────

function updateSanity(delta) {
  if (!gameActive) return;
  const lcfg = LEVEL_CONFIGS[currentLevel];
  let drain = lcfg.drainIdle;

  // Standing still is dangerous — you have to keep moving
  const isMoving = moveForward || moveBackward || moveLeft || moveRight;
  if (!isMoving)   drain += SANITY_DRAIN_STILL;
  if (isSprinting && isMoving) drain += SANITY_DRAIN_SPRINT;

  const pp = controls.object.position;
  entityNearby = false;
  for (const e of entities) {
    if (!e.active) continue;
    const dist = pp.distanceTo(e.sprite.position);
    if (dist < 18) {
      entityNearby = true;
      drain += lcfg.drainEntity * (1 - clamp(dist / 18, 0, 1));
    }
  }
  if (inBlackout) drain += SANITY_DRAIN_DARK;
  sanity = clamp(sanity - drain * delta + SANITY_RECOVER * delta, 0, 100);
}

function applySanityFX() {
  const fear = 1 - sanity / 100;
  vignette.style.opacity = String(clamp(0.2 + fear * 0.75, 0, 1));
  const ca = clamp((fear - 0.4) * 2, 0, 1);
  chromaticA.style.opacity = String(ca * 0.9);
  chromaticB.style.opacity = String(ca * 0.9);
  const shift = fear * 6;
  chromaticA.style.transform = `translateX(${-shift}px)`;
  chromaticB.style.transform = `translateX(${shift}px)`;
  noiseOverlay.style.opacity = String(clamp(fear * 0.18, 0, 0.18));
  const sat = 1 - fear * 0.55, bri = 1 - fear * 0.18;
  renderer.domElement.style.filter = `saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)})`;
  if (fear > 0.7 && Math.random() < 0.02) {
    controls.object.rotation.z += (Math.random() - 0.5) * 0.015 * fear;
  }
}

function resetSanityFX() {
  vignette.style.transition = '';
  vignette.style.opacity    = '0';
  vignette.style.background = ''; // clear death/win color override
  chromaticA.style.opacity = chromaticB.style.opacity = '0';
  noiseOverlay.style.opacity = '0';
  if (renderer) renderer.domElement.style.filter = '';
}

// ─── Entity behaviors ─────────────────────────────────────────────────────────

function isLookingAt(pos) {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const toE = pos.clone().sub(camera.position).normalize();
  return camDir.dot(toE) > 0.55;
}

function isOutOfBounds(pos) {
  if (!currentRooms?.length) return true;
  const n = currentRooms[0].scene.position.z;
  const s = currentRooms[6].scene.position.z;
  const e = currentRooms[2].scene.position.x;
  const w = currentRooms[0].scene.position.x;
  return pos.z < n - 25.3 || pos.z > s || pos.x > e + 25.3 || pos.x < w;
}

function deactivateEntity(ent) {
  ent.active = false;
  ent.sprite.visible = false;
  ent.sprite.position.copy(limbo);
  ent.wasWatched = false;
  spawnCooldowns[ent.def.id] = ent.def.spawnCooldown;
  // Stop chase sound when entity leaves the map
  if (ent.def.id === 'devorador' || ent.def.id === 'vigilante') {
    if (glitchSound?.isPlaying) glitchSound.stop();
  }
}

function spawnEntityAt(ent, roomIdx) {
  const pos = currentRooms[roomIdx].scene.getObjectByName('Spawn')
    .localToWorld(new THREE.Vector3());
  pos.y = ent.def.centerY;
  ent.sprite.position.copy(pos);
  ent.sprite.visible = true;
  ent.active = true;
  ent.wasWatched = false;
  ent.wanderTimer = 0;
}

function activeCount() { return entities.filter(e => e.active).length; }

function trySpawnEntities() {
  if (activeCount() >= LEVEL_CONFIGS[currentLevel].maxEntities) return;
  for (const ent of entities) {
    if (ent.active) continue;
    if ((spawnCooldowns[ent.def.id] ?? 0) > 0) continue;
    if (Math.random() > 0.35) continue;
    if (activeCount() >= LEVEL_CONFIGS[currentLevel].maxEntities) break;

    let idx = Math.floor(Math.random() * 8);
    if (idx >= 4) idx++;
    spawnEntityAt(ent, idx);
  }
}

// El Vigilante — freezes when watched, teleports closer when you look away
function updateVigilante(ent, delta) {
  const looking = isLookingAt(ent.sprite.position);
  const dist    = camera.position.distanceTo(ent.sprite.position);

  if (looking) {
    // Flicker while being watched
    ent.sprite.material.opacity = 0.7 + Math.sin(performance.now() * 0.015) * 0.3;
    if (!glitchSound.isPlaying) glitchSound.play();
    ent.wasWatched = true;
  } else {
    ent.sprite.material.opacity = 1;
    if (glitchSound.isPlaying) glitchSound.stop();

    if (ent.wasWatched && dist > 3) {
      // Just looked away — teleport closer
      const dir  = camera.position.clone().sub(ent.sprite.position).normalize();
      const jump = Math.min(dist * 0.45, 7);
      ent.sprite.position.addScaledVector(dir, jump);
      ent.sprite.position.y = ent.def.centerY;
    }
    ent.wasWatched = false;
  }
}

// El Devorador — actively hunts, speed scales with fear
function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist < 0.1) return true;
  losRaycaster.set(from, dir.normalize());
  losRaycaster.far = dist - 0.3;
  const hits = losRaycaster.intersectObjects(cachedLOSMeshes, false);
  return hits.length === 0;
}

function updateDevorador(ent, delta) {
  const pp   = controls.object.position;
  const dist = pp.distanceTo(ent.sprite.position);
  const fear = 1 - sanity / 100;
  const ecfg  = LEVEL_CONFIGS[currentLevel];
  const speed = ecfg.speedBase + fear * ecfg.speedFear;

  // LOS is expensive — cache result for 3 frames
  if (ent._losFrame === undefined || frameCount - ent._losFrame >= 8) {
    ent._losCache = hasLineOfSight(ent.sprite.position, pp);
    ent._losFrame = frameCount;
  }
  const canSee = ent._losCache;

  if (canSee) {
    // Full chase — move directly toward player
    ent.lastKnownPos = pp.clone();
    ent.lostSightTimer = 0;
    const dir = pp.clone().sub(ent.sprite.position);
    dir.y = 0; dir.normalize();
    ent.sprite.position.addScaledVector(dir, speed * delta);
    if (!glitchSound.isPlaying) glitchSound.play();
  } else {
    if (glitchSound.isPlaying) glitchSound.stop();
    ent.lostSightTimer = (ent.lostSightTimer ?? 0) + delta;

    if (ent.lastKnownPos && ent.lostSightTimer < 4) {
      // Move toward last known position at half speed
      const dir = ent.lastKnownPos.clone().sub(ent.sprite.position);
      dir.y = 0;
      if (dir.length() > 0.5) {
        dir.normalize();
        ent.sprite.position.addScaledVector(dir, speed * 0.5 * delta);
      }
    }
    // After 4s without sight: give up and wander
  }

  ent.sprite.position.y = ent.def.centerY;

  // Still show glitch when very close regardless of LOS
  if (dist < 3 && !glitchSound.isPlaying) glitchSound.play();
}

// El Perdido — wanders randomly, attacks on touch
function updatePerdido(ent, delta) {
  ent.wanderTimer -= delta;
  if (ent.wanderTimer <= 0) {
    // Pick new wander direction
    const angle = Math.random() * Math.PI * 2;
    const radius = rand(3, 10);
    ent.wanderTarget.set(
      ent.sprite.position.x + Math.cos(angle) * radius,
      ent.def.centerY,
      ent.sprite.position.z + Math.sin(angle) * radius
    );
    ent.wanderTimer = rand(3, 8);
  }
  const toTarget = ent.wanderTarget.clone().sub(ent.sprite.position);
  toTarget.y = 0;
  if (toTarget.length() > 0.5) {
    toTarget.normalize();
    ent.sprite.position.addScaledVector(toTarget, 1.2 * delta);
  }
}

function updateEntities(delta) {
  // Tick spawn cooldowns
  for (const id in spawnCooldowns) spawnCooldowns[id] = Math.max(0, spawnCooldowns[id] - delta);

  for (const ent of entities) {
    if (!ent.active) continue;

    // Remove if walked out of loaded area
    if (isOutOfBounds(ent.sprite.position)) {
      deactivateEntity(ent);
      continue;
    }

    switch (ent.def.id) {
      case 'vigilante': updateVigilante(ent, delta); break;
      case 'devorador': updateDevorador(ent, delta); break;
      case 'perdido':   updatePerdido(ent, delta);   break;
    }
  }
}

function checkEntityKills() {
  const pp = controls.object.position;
  for (const ent of entities) {
    if (!ent.active) continue;
    const dist = pp.distanceTo(ent.sprite.position);
    if (dist <= ent.def.killDist) {
      deathMessage = ent.def.deathMsg;
      return true;
    }
  }
  return false;
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

function updateRooms(dir) {
  let oldZ, oldX, newZ, newX, goners;
  switch (dir) {
    case 'North':
      oldZ = currentRooms[6].scene.position.z; oldX = currentRooms[6].scene.position.x;
      goners = currentRooms.splice(6, 3);
      goners.forEach(r => { unusedRooms.push(r); r.scene.visible=false; r.scene.position.copy(limbo); });
      newZ = oldZ - 25.6 * 3;
      for (let i = 2; i >= 0; i--) {
        const ri = Math.floor(Math.random() * unusedRooms.length);
        unusedRooms[ri].scene.position.set(oldX + i*25.6, 0, newZ);
        unusedRooms[ri].scene.visible = true;
        currentRooms.unshift(unusedRooms.splice(ri,1)[0]);
      }
      break;
    case 'South':
      oldZ = currentRooms[0].scene.position.z; oldX = currentRooms[0].scene.position.x;
      goners = currentRooms.splice(0, 3);
      goners.forEach(r => { unusedRooms.push(r); r.scene.visible=false; r.scene.position.copy(limbo); });
      newZ = oldZ + 25.6 * 3;
      for (let i = 0; i < 3; i++) {
        const ri = Math.floor(Math.random() * unusedRooms.length);
        unusedRooms[ri].scene.position.set(oldX + i*25.6, 0, newZ);
        unusedRooms[ri].scene.visible = true;
        currentRooms.push(unusedRooms.splice(ri,1)[0]);
      }
      break;
    case 'East':
      oldZ = currentRooms[0].scene.position.z; oldX = currentRooms[0].scene.position.x;
      [6,3,0].forEach(idx => {
        unusedRooms.push(currentRooms.splice(idx,1)[0]);
        unusedRooms[unusedRooms.length-1].scene.visible=false;
        unusedRooms[unusedRooms.length-1].scene.position.copy(limbo);
      });
      newX = oldX + 25.6 * 3;
      [0,1,2].forEach(i => {
        const ri = Math.floor(Math.random() * unusedRooms.length);
        unusedRooms[ri].scene.position.set(newX, 0, oldZ + i*25.6);
        unusedRooms[ri].scene.visible = true;
        currentRooms.splice([2,5,8][i], 0, unusedRooms.splice(ri,1)[0]);
      });
      break;
    case 'West':
      oldZ = currentRooms[2].scene.position.z; oldX = currentRooms[2].scene.position.x;
      [8,5,2].forEach(idx => {
        unusedRooms.push(currentRooms.splice(idx,1)[0]);
        unusedRooms[unusedRooms.length-1].scene.visible=false;
        unusedRooms[unusedRooms.length-1].scene.position.copy(limbo);
      });
      newX = oldX - 25.6 * 3;
      [0,1,2].forEach(i => {
        const ri = Math.floor(Math.random() * unusedRooms.length);
        unusedRooms[ri].scene.position.set(newX, 0, oldZ + i*25.6);
        unusedRooms[ri].scene.visible = true;
        currentRooms.splice([0,3,6][i], 0, unusedRooms.splice(ri,1)[0]);
      });
      break;
  }
  // Only center room — adjacent room walls block doorways if we include them
  playerCollisions  = [currentRooms[4].scene];
  allRoomGeometry   = currentRooms.map(r => r.scene);
  rebuildMeshCaches();
}

function updateRoomBounds(dir) {
  switch (dir) {
    case 'North': currentRoomBounds[0]-=25.6; currentRoomBounds[2]-=25.6; break;
    case 'South': currentRoomBounds[0]+=25.6; currentRoomBounds[2]+=25.6; break;
    case 'East':  currentRoomBounds[1]+=25.6; currentRoomBounds[3]+=25.6; break;
    case 'West':  currentRoomBounds[1]-=25.6; currentRoomBounds[3]-=25.6; break;
  }
}

function checkRoomChange(controls) {
  const p = controls.object.position;
  if (p.z < currentRoomBounds[0]) { updateRoomBounds('North'); updateRooms('North'); trySpawnEntities(); trySpawnPage(); }
  if (p.x > currentRoomBounds[1]) { updateRoomBounds('East');  updateRooms('East');  trySpawnEntities(); trySpawnPage(); }
  if (p.z > currentRoomBounds[2]) { updateRoomBounds('South'); updateRooms('South'); trySpawnEntities(); trySpawnPage(); }
  if (p.x < currentRoomBounds[3]) { updateRoomBounds('West');  updateRooms('West');  trySpawnEntities(); trySpawnPage(); }
}

// ─── Collision ────────────────────────────────────────────────────────────────

function collisionDetection() {
  const pos = controls.object.position;

  // Lock Y — player must always stand at eye height
  pos.y = 1.65;

  for (const ray of rays) {
    raycaster.set(pos, ray);
    // Check ALL visible rooms, not just center — prevents clipping through adjacent walls
    const hits = raycaster.intersectObjects(cachedCollisionMeshes, false);
    for (const hit of hits) {
      if (hit.distance <= 0.5) {
        // Push back proportionally so the player never reaches the wall surface
        const push = (0.5 - hit.distance) + 0.05;
        pos.x -= ray.x * push;
        pos.z -= ray.z * push;
      }
    }
  }

  // Safety net: if the player escapes the loaded grid entirely, snap back to center
  const cx = currentRooms[4].scene.position.x;
  const cz = currentRooms[4].scene.position.z;
  if (Math.abs(pos.x - cx) > 38 || Math.abs(pos.z - cz) > 38) {
    pos.set(cx, 1.65, cz);
    velocity.x = velocity.z = 0;
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

function onKeyDown(e) {
  const moving = () => walkingSound.buffer && !walkingSound.isPlaying && walkingSound.play();
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': moving(); moveForward  = true; break;
    case 'ArrowLeft':  case 'KeyA': moving(); moveLeft     = true; break;
    case 'ArrowDown':  case 'KeyS': moving(); moveBackward = true; break;
    case 'ArrowRight': case 'KeyD': moving(); moveRight    = true; break;
    case 'ShiftLeft':  case 'ShiftRight': isSprinting = true; break;
  }
}
function onKeyUp(e) {
  const anyMove = () => moveForward || moveBackward || moveLeft || moveRight;
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': moveForward  = false; if (!anyMove()) walkingSound.stop?.(); break;
    case 'ArrowLeft':  case 'KeyA': moveLeft     = false; if (!anyMove()) walkingSound.stop?.(); break;
    case 'ArrowDown':  case 'KeyS': moveBackward = false; if (!anyMove()) walkingSound.stop?.(); break;
    case 'ArrowRight': case 'KeyD': moveRight    = false; if (!anyMove()) walkingSound.stop?.(); break;
    case 'ShiftLeft':  case 'ShiftRight': isSprinting = false; break;
  }
}

// ─── Win / Lose ───────────────────────────────────────────────────────────────

async function triggerDeath() {
  playerMovement = false;
  gameLost = true;
  glitchSound.stop();
  deathSound.play();

  vignette.style.transition = 'none';
  vignette.style.opacity = '1';
  vignette.style.background = 'rgba(60,0,0,0.85)';

  colorScreen.style.display = 'block';
  colorScreen.classList.add('deathScreen');
  endMessage.style.display = 'flex';
  endMessage.style.color = '#cc2222';
  endMessage.textContent = deathMessage || 'Te encontraron.';

  await sleep(3500);
  showEndMenu();
}

async function triggerWin() {
  playerMovement = false;
  gameWon = true;
  winSound.play();

  if (currentLevel < MAX_LEVEL) {
    // Level transition — advance to next level
    colorScreen.style.display = 'block'; colorScreen.classList.add('winScreen');
    endMessage.style.display = 'flex';
    endMessage.style.color = '#d4b060';
    endMessage.textContent = `Escapaste del ${LEVEL_CONFIGS[currentLevel].name}`;
    await sleep(3000);

    endMessage.style.color = '#ffffff';
    endMessage.textContent = `Entrando al ${LEVEL_CONFIGS[currentLevel + 1].name}...`;
    await sleep(2500);

    currentLevel++;
    endMessage.style.display = 'none';
    colorScreen.style.display = 'none';
    colorScreen.className = '';
    await init();
  } else {
    // Final victory
    vignette.style.transition = 'opacity 4s'; vignette.style.opacity = '0';
    colorScreen.style.display = 'block'; colorScreen.classList.add('winScreen');
    endMessage.style.display = 'flex';
    endMessage.style.color = '#d4b060';
    endMessage.textContent = 'Escapaste. Todos los niveles superados.';
    await sleep(5000);
    showEndMenu();
  }
}

function showEndMenu() {
  const elapsed = (performance.now() - startTime) / 1000;
  timeEl.textContent = `${Math.floor(elapsed/60)}m ${(elapsed%60).toFixed(1)}s`;
  menuEl.style.display = 'flex';
  controls.unlock();
}

// ─── Animation loop ───────────────────────────────────────────────────────────

function animate() {
  animFrameId = requestAnimationFrame(animate);
  const now   = performance.now();
  const delta = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;
  frameCount++;

  // FPS counter — updates every 30 frames
  if (frameCount % 30 === 0) {
    const fps = Math.round(1 / delta);
    const fpsEl = document.getElementById('fpsCounter');
    if (fpsEl) fpsEl.textContent = `${fps} fps · ${renderer.info.render.calls} draw calls`;
  }

  if (controls.isLocked && playerMovement) {
    const decay = Math.exp(-15 * delta);
    velocity.x *= decay;
    velocity.z *= decay;
    velocity.y  = 0;
    direction.z = Number(moveForward)  - Number(moveBackward);
    direction.x = Number(moveRight)    - Number(moveLeft);
    direction.normalize();
    const spd = 60 * (isSprinting ? SPRINT_MULTIPLIER : 1);
    if (moveForward  || moveBackward) velocity.z -= direction.z * spd * delta;
    if (moveLeft     || moveRight)    velocity.x -= direction.x * spd * delta;
    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
  }

  // Build BVH one geometry per frame — eliminates stutter from lazy computation
  if (bvhQueue.length > 0) bvhQueue.shift().computeBoundsTree();

  if (!gameLost && !gameWon) {
    collisionDetection();
    checkRoomChange(controls);
    playerMesh.position.copy(controls.object.position);
    updateRoomLights(delta, now / 1000);
    updateSanity(delta);
    applySanityFX();
    updateEntities(delta);
    // Throttle non-critical updates — run every N frames
    if (frameCount % 2 === 0) updatePages();
    if (frameCount % 4 === 0) { updatePageCompass(); updatePageRadar(); }

    // Pulse exit
    if (exitMesh) {
      exitMesh.material.emissiveIntensity = 0.4 + Math.sin(now / 400) * 0.3;
    }

    if (checkEntityKills()) {
      triggerDeath();
    } else if (exitMesh && controls.object.position.distanceTo(exitMesh.position) < 1.2) {
      triggerWin();
    }
  }

  renderer.render(scene, camera);
}

// ─── Restart ──────────────────────────────────────────────────────────────────

document.getElementById('restart').addEventListener('click', async () => {
  menuEl.style.display = 'none';
  startTime = undefined;
  await init();
});

window.addEventListener('resize', () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Volume sliders ───────────────────────────────────────────────────────────

function applyVolume(v) {
  volumeLevel = v;
  localStorage.setItem('volumeLevel', v);
  audioListener?.setMasterVolume(v);
}

function syncVolumeUI(v) {
  const pct = `${Math.round(v * 100)}%`;
  const s1 = document.getElementById('volumeSlider');
  const l1 = document.getElementById('volumeLabel');
  const s2 = document.getElementById('volumeSliderMenu');
  const l2 = document.getElementById('volumeLabelMenu');
  if (s1) s1.value = v;
  if (l1) l1.textContent = pct;
  if (s2) s2.value = v;
  if (l2) l2.textContent = pct;
}

document.getElementById('volumeSlider')?.addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  applyVolume(v);
  syncVolumeUI(v);
});
// Stop slider clicks from bubbling to #introScreen and triggering onIntroClick prematurely
document.getElementById('volumeSlider')?.addEventListener('click', e => e.stopPropagation());

document.getElementById('volumeSliderMenu')?.addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  applyVolume(v);
  syncVolumeUI(v);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

syncVolumeUI(volumeLevel);
await init();
