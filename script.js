/**
 * THE CANOPY PROTOCOL - 3D Fluid Survival Engine
 * Features: Dense Forest Generation, Join Code Rooms, Multiplayer Sync, Boss Fights
 */

const CONFIG = {
  mapSize: 400,
  numTrees: 600,
  numRocks: 250,
  dayDurationSec: 300
};

// Hardcoded Firebase Configuration
const FIREBASE_CREDENTIALS = {
  apiKey: "AIzaSyCBV-K_SIJLrozRZ2v2ZkQSe9tTkHtrL1k",
  authDomain: "forest-game-82fba.firebaseapp.com",
  databaseURL: "https://forest-game-82fba-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "forest-game-82fba",
  storageBucket: "forest-game-82fba.firebasestorage.app",
  messagingSenderId: "510972700470",
  appId: "1:510972700470:web:8d95fde2de455a7f793597"
};

const state = {
  roomId: 'forest-squad',
  playerId: 'player_' + Math.floor(Math.random() * 10000),
  username: 'Rift',
  difficulty: 'normal',
  db: null,
  isFirebaseActive: false,
  hp: 100,
  stamina: 100,
  hunger: 100,
  selectedSlot: 1,
  inventory: {
    axe: 1,
    pickaxe: 1,
    wood: 0,
    stone: 0,
    food: 3,
    beacon: 0
  },
  remotePlayers: {},
  remotePlayerMeshes: {}
};

// Controls & Physics
const keys = {};
const playerPos = new THREE.Vector3(0, 1.6, 0);
let cameraYaw = 0;
let cameraPitch = 0;
let isLocked = false;
let bobTimer = 0;

// Three.js Core
let scene, camera, renderer;
let dirLight, hemiLight, fog;
let raycaster;
let targetObject = null;
const interactables = [];

// Mobs & Boss State
const mobs = [];
let callerBoss = null;
let bossActive = false;
let bossHp = 100;
let chopper = null;
let extractionReady = false;

// DOM Elements
const setupOverlay = document.getElementById('setup-overlay');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start-btn');
const usernameInput = document.getElementById('username-input');
const roomIdInput = document.getElementById('room-id');
const difficultySelect = document.getElementById('difficulty-select');
const musicToggleBtn = document.getElementById('music-toggle-btn');
const bgm = document.getElementById('bgm');
let musicPlaying = false;

const SLOT_ITEMS = {
  1: 'axe',
  2: 'pickaxe',
  3: 'wood',
  4: 'stone',
  5: 'food',
  6: 'beacon'
};

window.addEventListener('DOMContentLoaded', () => {
  startBtn.addEventListener('click', launchGame);
  musicToggleBtn.addEventListener('click', toggleMusic);
  setupHotbarListeners();
});

function toggleMusic() {
  musicPlaying = !musicPlaying;
  if (musicPlaying) {
    bgm.play().catch(() => {});
    musicToggleBtn.innerText = "🎵 Music: ON";
  } else {
    bgm.pause();
    musicToggleBtn.innerText = "🎵 Music: OFF";
  }
}

function launchGame() {
  state.username = usernameInput.value.trim() || 'Rift';
  state.roomId = roomIdInput.value.trim().toLowerCase() || 'forest-squad';
  state.difficulty = difficultySelect.value;

  document.getElementById('active-room-code').innerText = state.roomId.toUpperCase();

  try {
    firebase.initializeApp(FIREBASE_CREDENTIALS);
    state.db = firebase.database();
    state.isFirebaseActive = true;
    console.log("Firebase connected successfully!");
  } catch (e) {
    console.warn("Firebase already initialized.");
  }

  setupOverlay.classList.add('hidden');
  hud.classList.remove('hidden');

  initEngine();
  if (state.isFirebaseActive) {
    initRealtimeNetwork();
  }
}

// -------------------------------------------------------------
// 3D GRAPHICS & DENSE FOREST SETUP
// -------------------------------------------------------------
function initEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8da3a6);
  fog = new THREE.FogExp2(0x8da3a6, 0.008);
  scene.fog = fog;

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.copy(playerPos);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x223322, 0.6);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
  dirLight.position.set(100, 150, 50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  const d = 150;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  raycaster = new THREE.Raycaster();
  raycaster.far = 6;

  buildTerrain();
  buildForest();
  spawnMobs();

  document.addEventListener('click', () => {
    if (!isLocked) {
      document.body.requestPointerLock();
    } else {
      handleInteraction();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    isLocked = document.pointerLockElement === document.body;
  });

  document.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code.startsWith('Digit')) {
      const slot = parseInt(e.code.replace('Digit', ''));
      if (slot >= 1 && slot <= 6) selectHotbarSlot(slot);
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('resize', onWindowResize);

  animate(0);
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(CONFIG.mapSize, CONFIG.mapSize, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1f3322, roughness: 0.9, metalness: 0.1 });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function buildForest() {
  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.7, 7, 8);
  const foliageGeo = new THREE.ConeGeometry(3.5, 6, 8);
  const rockGeo = new THREE.DodecahedronGeometry(1.5, 1);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.9 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x133b19, roughness: 0.8 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4f5451, roughness: 0.9 });

  // Procedural Tree Generation
  for (let i = 0; i < CONFIG.numTrees; i++) {
    const x = (Math.random() - 0.5) * (CONFIG.mapSize - 30);
    const z = (Math.random() - 0.5) * (CONFIG.mapSize - 30);
    if (Math.hypot(x, z) < 10) continue; // Keep spawn area clear

    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, 0, z);

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    for (let j = 0; j < 3; j++) {
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.y = 6 + j * 2.5;
      foliage.scale.set(1 - j * 0.15, 1 - j * 0.15, 1 - j * 0.15);
      foliage.castShadow = true;
      treeGroup.add(foliage);
    }

    treeGroup.userData = { type: 'tree', hp: 5, id: `tree_${i}` };
    scene.add(treeGroup);
    interactables.push(treeGroup);
  }

  // Procedural Rock Generation
  for (let i = 0; i < CONFIG.numRocks; i++) {
    const x = (Math.random() - 0.5) * (CONFIG.mapSize - 30);
    const z = (Math.random() - 0.5) * (CONFIG.mapSize - 30);
    if (Math.hypot(x, z) < 8) continue;

    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, 0.8, z);
    rock.scale.set(1 + Math.random(), 0.8 + Math.random() * 0.8, 1 + Math.random());
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;

    rock.userData = { type: 'rock', hp: 4, id: `rock_${i}` };
    scene.add(rock);
    interactables.push(rock);
  }
}

function spawnMobs() {
  for (let i = 0; i < 8; i++) {
    const mobGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.5, 4, 8), bodyMat);
    body.position.y = 1.2;
    mobGroup.add(body);

    const rx = (Math.random() - 0.5) * 200;
    const rz = (Math.random() - 0.5) * 200;
    mobGroup.position.set(rx, 0, rz);

    scene.add(mobGroup);
    mobs.push({ mesh: mobGroup, patrolAngle: Math.random() * Math.PI * 2 });
  }
}

function spawnCallerBoss() {
  if (bossActive) return;
  bossActive = true;
  document.getElementById('boss-hud').classList.remove('hidden');

  const bossGroup = new THREE.Group();
  const callerMat = new THREE.MeshStandardMaterial({ color: 0x4a148c, roughness: 0.3, emissive: 0x220033 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 8), callerMat);
  body.position.y = 2;
  bossGroup.add(body);

  bossGroup.position.set(0, 0, -50);
  scene.add(bossGroup);
  callerBoss = bossGroup;
}

function spawnChopper() {
  if (extractionReady) return;
  extractionReady = true;
  alert("Anomaly defeated! Emergency Chopper inbound to center camp for extraction!");

  const chopperGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334433, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6), bodyMat);
  body.position.y = 15;
  chopperGroup.add(body);

  chopperGroup.position.set(0, 0, 0);
  scene.add(chopperGroup);
  chopper = chopperGroup;
}

// -------------------------------------------------------------
// GAME LOOP & FLUID ANIMATIONS
// -------------------------------------------------------------
let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);

  const delta = (time - lastTime) / 1000 || 0;
  lastTime = time;

  if (isLocked) {
    updateMovement(delta);
  }

  updateMobs(delta);
  updateBoss(delta);
  updateDayNightCycle(time);
  updateRaycasting();
  updateUI();

  if (state.isFirebaseActive) {
    syncLocalPlayerToFirebase();
  }

  renderer.render(scene, camera);
}

function updateMovement(delta) {
  const speed = keys['ShiftLeft'] ? 12 : 6;
  const moveVector = new THREE.Vector3();

  if (keys['KeyW']) moveVector.z -= 1;
  if (keys['KeyS']) moveVector.z += 1;
  if (keys['KeyA']) moveVector.x -= 1;
  if (keys['KeyD']) moveVector.x += 1;

  moveVector.normalize();

  const euler = new THREE.Euler(0, cameraYaw, 0, 'YXZ');
  moveVector.applyEuler(euler);

  playerPos.addScaledVector(moveVector, speed * delta);

  if (moveVector.length() > 0) {
    bobTimer += delta * (keys['ShiftLeft'] ? 14 : 9);
    camera.position.y = playerPos.y + Math.sin(bobTimer) * 0.08;
    state.stamina = Math.max(0, state.stamina - (keys['ShiftLeft'] ? 10 : 3) * delta);
  } else {
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, playerPos.y, 10 * delta);
    state.stamina = Math.min(100, state.stamina + 15 * delta);
  }

  const limit = CONFIG.mapSize / 2 - 5;
  playerPos.x = THREE.MathUtils.clamp(playerPos.x, -limit, limit);
  playerPos.z = THREE.MathUtils.clamp(playerPos.z, -limit, limit);

  camera.position.x = playerPos.x;
  camera.position.z = playerPos.z;
  camera.rotation.set(0, 0, 0);
  camera.rotation.y = cameraYaw;
  camera.rotation.x = cameraPitch;

  state.hunger = Math.max(0, state.hunger - 0.5 * delta);
}

function handlePointerMove(e) {
  if (!isLocked) return;
  const sensitivity = 0.002;
  cameraYaw -= e.movementX * sensitivity;
  cameraPitch -= e.movementY * sensitivity;
  cameraPitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraPitch));
}

function updateMobs(delta) {
  mobs.forEach(m => {
    m.patrolAngle += delta * 0.5;
    m.mesh.position.x += Math.cos(m.patrolAngle) * delta * 2;
    m.mesh.position.z += Math.sin(m.patrolAngle) * delta * 2;
  });
}

function updateBoss(delta) {
  if (!bossActive || !callerBoss) return;
  callerBoss.lookAt(playerPos.x, callerBoss.position.y, playerPos.z);
  const dir = new THREE.Vector3().subVectors(playerPos, callerBoss.position).normalize();
  callerBoss.position.addScaledVector(dir, delta * 1.5);

  if (callerBoss.position.distanceTo(playerPos) < 2.5) {
    state.hp = Math.max(0, state.hp - 10 * delta);
  }
}

function updateDayNightCycle(time) {
  const cycle = (time / 1000) % CONFIG.dayDurationSec;
  const progress = cycle / CONFIG.dayDurationSec;
  const angle = progress * Math.PI * 2;

  dirLight.position.x = Math.cos(angle) * 200;
  dirLight.position.y = Math.sin(angle) * 200;

  const isNight = dirLight.position.y < 0;
  dirLight.intensity = isNight ? 0.05 : 1.2;
  hemiLight.intensity = isNight ? 0.1 : 0.6;

  const skyColor = isNight ? new THREE.Color(0x050a12) : new THREE.Color(0x8da3a6);
  scene.background.copy(skyColor);
  fog.color.copy(skyColor);

  if (isNight && !bossActive && state.difficulty !== 'easy') {
    spawnCallerBoss();
  }

  const totalMinutes = Math.floor(progress * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mins = String(totalMinutes % 60).padStart(2, '0');
  document.getElementById('clock').innerText = `${hours}:${mins}`;
}

function updateRaycasting() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(interactables, true);

  const targetNameEl = document.getElementById('target-name');
  const targetActionEl = document.getElementById('target-action');

  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !obj.userData.type) {
      obj = obj.parent;
    }

    if (obj.userData.type) {
      targetObject = obj;
      targetNameEl.innerText = obj.userData.type.toUpperCase();
      const item = SLOT_ITEMS[state.selectedSlot];
      if (obj.userData.type === 'tree') {
        targetActionEl.innerText = item === 'axe' ? '[Left Click] Chop Tree' : 'Requires Axe';
      } else if (obj.userData.type === 'rock') {
        targetActionEl.innerText = item === 'pickaxe' ? '[Left Click] Mine Rock' : 'Requires Pickaxe';
      }
      return;
    }
  }

  if (bossActive && callerBoss) {
    const dist = callerBoss.position.distanceTo(playerPos);
    if (dist < 6) {
      targetObject = callerBoss;
      targetNameEl.innerText = 'THE HAUNTED CALLER';
      targetActionEl.innerText = '[Left Click] Attack Boss with Weapon';
      return;
    }
  }

  targetObject = null;
  targetNameEl.innerText = '';
  targetActionEl.innerText = '';
}

function handleInteraction() {
  const activeItem = SLOT_ITEMS[state.selectedSlot];

  if (activeItem === 'food' && state.inventory.food > 0) {
    state.inventory.food--;
    state.hunger = Math.min(100, state.hunger + 30);
    state.hp = Math.min(100, state.hp + 15);
    return;
  }

  if (activeItem === 'beacon' && state.inventory.beacon >= 5) {
    spawnChopper();
    return;
  }

  if (targetObject === callerBoss) {
    bossHp -= 25;
    document.getElementById('boss-hp-fill').style.width = `${bossHp}%`;
    if (bossHp <= 0) {
      scene.remove(callerBoss);
      bossActive = false;
      document.getElementById('boss-hud').classList.add('hidden');
      state.inventory.beacon += 5;
      alert("The Haunted Caller defeated! Gather 5 Beacon parts to trigger the rescue chopper!");
    }
    return;
  }

  if (!targetObject || !targetObject.userData) return;

  if (targetObject.userData.type === 'tree' && activeItem === 'axe') {
    targetObject.userData.hp--;
    state.inventory.wood += 2;
    if (targetObject.userData.hp <= 0) removeInteractable(targetObject);
  } else if (targetObject.userData.type === 'rock' && activeItem === 'pickaxe') {
    targetObject.userData.hp--;
    state.inventory.stone += 2;
    if (targetObject.userData.hp <= 0) removeInteractable(targetObject);
  }
}

function removeInteractable(obj) {
  scene.remove(obj);
  const idx = interactables.indexOf(obj);
  if (idx > -1) interactables.splice(idx, 1);
  if (state.isFirebaseActive) {
    state.db.ref(`rooms/${state.roomId}/destroyed/${obj.userData.id}`).set(true);
  }
}

function setupHotbarListeners() {
  document.querySelectorAll('.hotbar-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      e.stopPropagation();
      const num = parseInt(slot.getAttribute('data-slot'));
      selectHotbarSlot(num);
    });
  });
}

function selectHotbarSlot(num) {
  state.selectedSlot = num;
  document.querySelectorAll('.hotbar-slot').forEach(s => s.classList.remove('active'));
  document.querySelector(`.hotbar-slot[data-slot="${num}"]`).classList.add('active');
}

function updateUI() {
  document.getElementById('hp-bar').style.width = `${state.hp}%`;
  document.getElementById('stamina-bar').style.width = `${state.stamina}%`;
  document.getElementById('hunger-bar').style.width = `${state.hunger}%`;

  document.getElementById('count-axe').innerText = state.inventory.axe;
  document.getElementById('count-pickaxe').innerText = state.inventory.pickaxe;
  document.getElementById('count-wood').innerText = state.inventory.wood;
  document.getElementById('count-stone').innerText = state.inventory.stone;
  document.getElementById('count-food').innerText = state.inventory.food;
  document.getElementById('count-beacon').innerText = state.inventory.beacon;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------------------------------------
// FIREBASE MULTIPLAYER SYNC (MAX 6 PLAYERS)
// -------------------------------------------------------------
function initRealtimeNetwork() {
  const playerRef = state.db.ref(`rooms/${state.roomId}/players/${state.playerId}`);
  playerRef.onDisconnect().remove();

  state.db.ref(`rooms/${state.roomId}/players`).on('value', (snapshot) => {
    const players = snapshot.val() || {};
    if (Object.keys(players).length > 6) {
      alert("Room is full! Maximum 6 players allowed.");
    }
    syncRemotePlayerMeshes(players);
  });

  state.db.ref(`rooms/${state.roomId}/destroyed`).on('child_added', (snapshot) => {
    const destroyedId = snapshot.key;
    const target = interactables.find(item => item.userData.id === destroyedId);
    if (target) removeInteractable(target);
  });
}

function syncLocalPlayerToFirebase() {
  state.db.ref(`rooms/${state.roomId}/players/${state.playerId}`).set({
    name: state.username,
    x: playerPos.x,
    y: playerPos.y,
    z: playerPos.z,
    yaw: cameraYaw
  });
}

function syncRemotePlayerMeshes(players) {
  Object.keys(players).forEach(id => {
    if (id === state.playerId) return;

    const p = players[id];
    if (!state.remotePlayerMeshes[id]) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x38a8d9 })
      );
      body.position.y = 0.9;
      group.add(body);
      scene.add(group);
      state.remotePlayerMeshes[id] = group;
    }

    state.remotePlayerMeshes[id].position.set(p.x, p.y - 1.6, p.z);
    state.remotePlayerMeshes[id].rotation.y = p.yaw;
  });

  Object.keys(state.remotePlayerMeshes).forEach(id => {
    if (!players[id]) {
      scene.remove(state.remotePlayerMeshes[id]);
      delete state.remotePlayerMeshes[id];
    }
  });
}
