/**
 * Republic — 3D World Generators
 * Each function returns a standalone HTML file using Three.js CDN.
 * Written to republic-output/3d-worlds/ by the autonomous production system.
 * No build step required — pure HTML + CDN Three.js r162.
 */

export interface GeneratedWorld {
  filename: string;
  html: string;
  title: string;
  theme: string;
}

const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r162/three.min.js";
const ORBIT_CDN =
  "https://cdn.jsdelivr.net/npm/three@0.162.0/examples/jsm/controls/OrbitControls.js";

function worldHtml(title: string, theme: string, sceneScript: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden;background:#000;font-family:'Segoe UI',sans-serif}
canvas{display:block}
#ui{position:fixed;top:12px;left:12px;color:#fff;font-size:13px;
  background:rgba(0,0,0,.45);padding:8px 14px;border-radius:8px;
  backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.15)}
#ui h2{font-size:15px;color:#7df;margin-bottom:4px}
#ui p{opacity:.7;font-size:11px}
</style>
</head>
<body>
<div id="ui"><h2>${title}</h2><p>Drag to orbit · Scroll to zoom · Right-drag to pan</p></div>
<script src="${THREE_CDN}"></script>
<script type="module">
import { OrbitControls } from '${ORBIT_CDN}';
const T = THREE;
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// ─── SCENE SETUP ───
${sceneScript}
// ─── ANIMATE ───
let clock = new T.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  controls.update();
  if (typeof onTick === 'function') onTick(t);
  renderer.render(scene, camera);
}
animate();
</script>
</body></html>`;
}

// ─── CYBERPUNK CITY ──────────────────────────────────────────────

export function generateCyberpunkCity(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Cyberpunk City`;
  const script = `
scene.background = new T.Color(0x050510);
scene.fog = new T.FogExp2(0x050510, 0.025);
camera.position.set(0, 12, 40);

// Ground
const ground = new T.Mesh(
  new T.PlaneGeometry(200, 200),
  new T.MeshStandardMaterial({ color: 0x111120, roughness: 0.9, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grid on ground
const gridHelper = new T.GridHelper(200, 100, 0x0033ff, 0x001166);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const neonColors = [0xff0066, 0x00ffcc, 0x9933ff, 0xff6600, 0x00aaff];
const buildings = [];

for (let i = 0; i < 80; i++) {
  const w = 2 + Math.random() * 5;
  const h = 4 + Math.random() * 35;
  const d = 2 + Math.random() * 5;
  const col = neonColors[Math.floor(Math.random() * neonColors.length)];
  const geo = new T.BoxGeometry(w, h, d);
  const mat = new T.MeshStandardMaterial({
    color: 0x0a0a1a,
    emissive: col,
    emissiveIntensity: 0.04,
    roughness: 0.8,
    metalness: 0.3
  });
  const mesh = new T.Mesh(geo, mat);
  const x = (Math.random() - 0.5) * 80;
  const z = (Math.random() - 0.5) * 80;
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  scene.add(mesh);
  buildings.push({ mesh, col, h });

  // Neon sign light
  const light = new T.PointLight(col, 0.8, 15);
  light.position.set(x, h, z);
  scene.add(light);
}

// Rain particles
const rainGeo = new T.BufferGeometry();
const rainCount = 3000;
const positions = new Float32Array(rainCount * 3);
for (let i = 0; i < rainCount; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 100;
  positions[i * 3 + 1] = Math.random() * 60;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
}
rainGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
const rain = new T.Points(rainGeo, new T.PointsMaterial({ color: 0x88ccff, size: 0.08, transparent: true, opacity: 0.5 }));
scene.add(rain);

// Ambient + directional light
scene.add(new T.AmbientLight(0x111133, 0.6));
const sun = new T.DirectionalLight(0x4466ff, 0.5);
sun.position.set(20, 40, 20);
sun.castShadow = true;
scene.add(sun);

function onTick(t) {
  // Rain fall
  const pos = rain.geometry.attributes.position.array;
  for (let i = 0; i < rainCount; i++) {
    pos[i * 3 + 1] -= 0.4;
    if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 60;
  }
  rain.geometry.attributes.position.needsUpdate = true;
  rain.rotation.y = t * 0.01;

  // Pulse building emissives
  buildings.forEach((b, i) => {
    const pulse = 0.03 + Math.sin(t * 1.5 + i) * 0.02;
    b.mesh.material.emissiveIntensity = Math.max(0, pulse);
  });
}
`;
  return {
    filename: `cyberpunk_${Date.now()}.html`,
    html: worldHtml(title, "cyberpunk", script),
    title,
    theme: "cyberpunk",
  };
}

// ─── FOREST ──────────────────────────────────────────────────────

export function generateForest(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Enchanted Forest`;
  const script = `
scene.background = new T.Color(0x0d1a0d);
scene.fog = new T.Fog(0x0d2a0d, 20, 80);
camera.position.set(0, 8, 25);

// Ground
const ground = new T.Mesh(
  new T.PlaneGeometry(200, 200),
  new T.MeshStandardMaterial({ color: 0x1a3a10, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Trees
function makeTree(x, z, h) {
  const trunk = new T.Mesh(
    new T.CylinderGeometry(0.2, 0.35, h * 0.35, 8),
    new T.MeshStandardMaterial({ color: 0x4a2a0a, roughness: 1 })
  );
  trunk.position.set(x, h * 0.175, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const r = h * 0.25 * (1 - i / layers * 0.5);
    const yOff = h * (0.3 + i * 0.22);
    const cone = new T.Mesh(
      new T.ConeGeometry(r, h * 0.3, 8),
      new T.MeshStandardMaterial({ color: 0x1a5a15, roughness: 1 })
    );
    cone.position.set(x, yOff, z);
    cone.castShadow = true;
    scene.add(cone);
  }
}
for (let i = 0; i < 60; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 4 + Math.random() * 35;
  makeTree(Math.cos(angle) * dist, Math.sin(angle) * dist, 5 + Math.random() * 8);
}

// Fireflies
const ffGeo = new T.BufferGeometry();
const ffCount = 200;
const ffPos = new Float32Array(ffCount * 3);
for (let i = 0; i < ffCount; i++) {
  ffPos[i*3] = (Math.random()-0.5)*40;
  ffPos[i*3+1] = 1 + Math.random()*8;
  ffPos[i*3+2] = (Math.random()-0.5)*40;
}
ffGeo.setAttribute('position', new T.BufferAttribute(ffPos, 3));
const fireflies = new T.Points(ffGeo, new T.PointsMaterial({ color: 0xaaffaa, size: 0.2, transparent: true }));
scene.add(fireflies);

// Moonlight
const moon = new T.DirectionalLight(0x8888ff, 0.8);
moon.position.set(-20, 40, 10);
moon.castShadow = true;
scene.add(moon);
scene.add(new T.AmbientLight(0x112211, 0.5));

const ffBaseY = ffPos.slice();

function onTick(t) {
  const p = fireflies.geometry.attributes.position.array;
  for (let i = 0; i < ffCount; i++) {
    p[i*3+1] = ffBaseY[i*3+1] + Math.sin(t * 2 + i * 0.7) * 0.5;
    p[i*3] = ffPos[i*3] + Math.sin(t * 0.5 + i) * 0.3;
  }
  fireflies.geometry.attributes.position.needsUpdate = true;
  fireflies.material.opacity = 0.5 + Math.sin(t * 3) * 0.3;
}
`;
  return {
    filename: `forest_${Date.now()}.html`,
    html: worldHtml(title, "forest", script),
    title,
    theme: "forest",
  };
}

// ─── OCEAN ───────────────────────────────────────────────────────

export function generateOcean(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Ocean Sunset`;
  const script = `
scene.background = new T.Color(0x0a1528);
camera.position.set(0, 8, 30);

// Procedural ocean plane with vertex animation in shader
const oceanGeo = new T.PlaneGeometry(200, 200, 80, 80);
oceanGeo.rotateX(-Math.PI / 2);
const ocean = new T.Mesh(oceanGeo, new T.MeshStandardMaterial({
  color: 0x004488, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.9
}));
ocean.receiveShadow = true;
scene.add(ocean);

// Islands
function island(x, z, r) {
  const m = new T.Mesh(new T.CylinderGeometry(r, r*1.4, 2, 16),
    new T.MeshStandardMaterial({ color: 0xc8a060, roughness: 1 }));
  m.position.set(x, 0.5, z);
  scene.add(m);
  const palm = new T.Mesh(new T.CylinderGeometry(0.1, 0.2, 4, 8),
    new T.MeshStandardMaterial({ color: 0x6a4a20 }));
  palm.position.set(x, 3, z);
  scene.add(palm);
  const top = new T.Mesh(new T.SphereGeometry(1.5, 8, 6),
    new T.MeshStandardMaterial({ color: 0x22aa22, roughness: 1 }));
  top.position.set(x, 5.5, z);
  scene.add(top);
}
island(-8, -5, 3); island(10, 8, 2.5); island(-15, 12, 4);

// Stars
const starGeo = new T.BufferGeometry();
const starPos = new Float32Array(2000 * 3);
for (let i = 0; i < 2000; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = 300;
  starPos[i*3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i*3+1] = r * Math.abs(Math.cos(phi));
  starPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
scene.add(new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0.8 })));

// Sun/moon
const sunMesh = new T.Mesh(new T.SphereGeometry(5, 16, 16),
  new T.MeshBasicMaterial({ color: 0xff8822 }));
scene.add(sunMesh);
const sunLight = new T.DirectionalLight(0xff9944, 2);
scene.add(sunLight);
scene.add(new T.AmbientLight(0x112244, 0.4));

const oceanPositions = oceanGeo.attributes.position;
const origY = new Float32Array(oceanPositions.array.length);
for (let i = 0; i < origY.length; i++) origY[i] = oceanPositions.array[i];

function onTick(t) {
  // Wave animation
  for (let i = 0; i < oceanPositions.count; i++) {
    const x = origY[i*3], z = origY[i*3+2];
    oceanPositions.setY(i, Math.sin(x * 0.3 + t) * 0.6 + Math.sin(z * 0.25 + t * 0.7) * 0.4);
  }
  oceanPositions.needsUpdate = true;
  oceanGeo.computeVertexNormals();

  // Sun motion
  const sunAngle = -0.3 + Math.sin(t * 0.1) * 0.3;
  const dist = 80;
  sunMesh.position.set(0, Math.sin(sunAngle) * dist, -Math.cos(sunAngle) * dist);
  sunLight.position.copy(sunMesh.position);
  const skyBright = Math.max(0.05, Math.sin(sunAngle + 0.5));
  scene.background = new T.Color(skyBright * 0.05, skyBright * 0.08, skyBright * 0.18 + 0.05);
}
`;
  return {
    filename: `ocean_${Date.now()}.html`,
    html: worldHtml(title, "ocean", script),
    title,
    theme: "ocean",
  };
}

// ─── SPACE STATION ───────────────────────────────────────────────

export function generateSpaceStation(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Space Station`;
  const script = `
scene.background = new T.Color(0x000005);
camera.position.set(0, 15, 50);

// Stars
const starGeo = new T.BufferGeometry();
const starArr = new Float32Array(5000 * 3);
for (let i = 0; i < 5000; i++) {
  starArr[i*3] = (Math.random()-0.5)*1000;
  starArr[i*3+1] = (Math.random()-0.5)*1000;
  starArr[i*3+2] = (Math.random()-0.5)*1000;
}
starGeo.setAttribute('position', new T.BufferAttribute(starArr, 3));
scene.add(new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.5 })));

// Station core ring
const ringGeo = new T.TorusGeometry(12, 3, 16, 64);
const ringMat = new T.MeshStandardMaterial({ color: 0x778899, metalness: 0.9, roughness: 0.2 });
const ring = new T.Mesh(ringGeo, ringMat);
ring.castShadow = true;
scene.add(ring);

// Central hub
const hub = new T.Mesh(new T.CylinderGeometry(3, 3, 10, 16),
  new T.MeshStandardMaterial({ color: 0x556677, metalness: 0.8, roughness: 0.3 }));
scene.add(hub);

// Solar panels
for (let side of [-1, 1]) {
  const arm = new T.Mesh(new T.BoxGeometry(20, 0.3, 0.5),
    new T.MeshStandardMaterial({ color: 0x334455 }));
  arm.position.set(side * 18, 0, 0);
  scene.add(arm);
  const panel = new T.Mesh(new T.BoxGeometry(12, 0.1, 6),
    new T.MeshStandardMaterial({ color: 0x112244, emissive: 0x001133, emissiveIntensity: 0.3, metalness: 0.6 }));
  panel.position.set(side * 24, 0, 0);
  scene.add(panel);
}

// Docked ships
for (let i = 0; i < 4; i++) {
  const angle = Math.PI / 2 * i;
  const ship = new T.Mesh(new T.ConeGeometry(0.8, 4, 8),
    new T.MeshStandardMaterial({ color: 0xaabbcc, metalness: 0.7 }));
  ship.position.set(Math.cos(angle)*15, 0, Math.sin(angle)*15);
  ship.rotation.z = Math.PI/2 - angle;
  scene.add(ship);
}

// Windows
for (let i = 0; i < 24; i++) {
  const angle = (i/24)*Math.PI*2;
  const win = new T.Mesh(new T.CircleGeometry(0.25, 8),
    new T.MeshBasicMaterial({ color: 0xaaddff }));
  win.position.set(Math.cos(angle)*12.3, Math.sin(angle)*2, Math.sin(angle)*12.3);
  win.lookAt(0,0,0);
  scene.add(win);
  const light = new T.PointLight(0x88ccff, 0.4, 5);
  light.position.copy(win.position);
  scene.add(light);
}

// Nebula glow
const sun = new T.DirectionalLight(0xffffff, 1);
sun.position.set(50, 30, 80);
sun.castShadow = true;
scene.add(sun);
scene.add(new T.AmbientLight(0x111122, 0.5));

// Earth sphere far away
const earth = new T.Mesh(new T.SphereGeometry(15, 32, 32),
  new T.MeshStandardMaterial({ color: 0x224488, emissive: 0x001122, roughness: 0.8 }));
earth.position.set(-80, -30, -150);
scene.add(earth);

function onTick(t) {
  ring.rotation.y = t * 0.15;
  ring.rotation.x = Math.sin(t * 0.08) * 0.05;
  hub.rotation.y = -t * 0.2;
  earth.rotation.y = t * 0.03;
}
`;
  return {
    filename: `station_${Date.now()}.html`,
    html: worldHtml(title, "space", script),
    title,
    theme: "space",
  };
}

// ─── CRYSTAL CAVE ────────────────────────────────────────────────

export function generateCrystalCave(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Crystal Cave`;
  const script = `
scene.background = new T.Color(0x020510);
scene.fog = new T.Fog(0x020510, 15, 50);
camera.position.set(0, 4, 18);

// Ground
scene.add(Object.assign(new T.Mesh(
  new T.PlaneGeometry(60, 60),
  new T.MeshStandardMaterial({ color: 0x050a1a, roughness: 0.9, metalness: 0.2 })
), { rotation: { x: -Math.PI/2 } }));

const crystalColors = [0x00ffcc, 0xaa44ff, 0xff0088, 0x0088ff, 0xffcc00];
const crystals = [];

function makeCrystal(x, y, z, h, col) {
  const geo = new T.ConeGeometry(0.3 + Math.random()*0.4, h, 6);
  const mat = new T.MeshStandardMaterial({
    color: col, metalness: 0.9, roughness: 0.05,
    emissive: col, emissiveIntensity: 0.3, transparent: true, opacity: 0.85
  });
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y + h/2, z);
  m.rotation.y = Math.random() * Math.PI;
  scene.add(m);
  crystals.push({ mesh: m, mat, baseI: 0.3 + Math.random()*0.3, phase: Math.random()*Math.PI*2 });
  const light = new T.PointLight(col, 0.8, 8);
  light.position.set(x, y + h, z);
  scene.add(light);
  return m;
}

for (let i = 0; i < 80; i++) {
  const a = Math.random()*Math.PI*2;
  const d = 2 + Math.random()*12;
  const col = crystalColors[Math.floor(Math.random()*crystalColors.length)];
  makeCrystal(Math.cos(a)*d, 0, Math.sin(a)*d, 1+Math.random()*5, col);
}

// Stalactites from ceiling
for (let i = 0; i < 30; i++) {
  const geo = new T.ConeGeometry(0.15+Math.random()*0.3, 1.5+Math.random()*3, 6);
  const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x112233, roughness: 0.9 }));
  m.position.set((Math.random()-0.5)*20, 8, (Math.random()-0.5)*20);
  m.rotation.z = Math.PI;
  scene.add(m);
}

// Particle dust
const dustGeo = new T.BufferGeometry();
const dustPos = new Float32Array(500*3);
for(let i=0;i<500;i++){
  dustPos[i*3]=(Math.random()-0.5)*30;
  dustPos[i*3+1]=Math.random()*8;
  dustPos[i*3+2]=(Math.random()-0.5)*30;
}
dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
const dust = new T.Points(dustGeo, new T.PointsMaterial({color:0xffffff,size:0.06,transparent:true,opacity:0.4}));
scene.add(dust);

scene.add(new T.AmbientLight(0x050520, 0.5));

function onTick(t) {
  crystals.forEach(c => {
    c.mat.emissiveIntensity = c.baseI + Math.sin(t*2 + c.phase) * 0.15;
  });
  const dp = dust.geometry.attributes.position.array;
  for(let i=0;i<500;i++){
    dp[i*3+1] = (dp[i*3+1] + 0.004) % 8;
    dp[i*3] += Math.sin(t+i)*0.002;
  }
  dust.geometry.attributes.position.needsUpdate = true;
}
`;
  return {
    filename: `crystal_${Date.now()}.html`,
    html: worldHtml(title, "cave", script),
    title,
    theme: "cave",
  };
}

// ─── PROCEDURAL CITY ─────────────────────────────────────────────

export function generateCity(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s City`;
  const script = `
scene.background = new T.Color(0x8ab4d8);
scene.fog = new T.Fog(0xaabbcc, 60, 200);
camera.position.set(0, 30, 80);

// Ground
const ground = new T.Mesh(new T.PlaneGeometry(400, 400),
  new T.MeshStandardMaterial({ color: 0x444454, roughness: 0.95 }));
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// Roads grid
for (let i = -5; i <= 5; i++) {
  const road1 = new T.Mesh(new T.PlaneGeometry(2, 200),
    new T.MeshStandardMaterial({ color: 0x222233, roughness: 1 }));
  road1.rotation.x = -Math.PI/2;
  road1.position.set(i*14, 0.01, 0);
  scene.add(road1);
  const road2 = new T.Mesh(new T.PlaneGeometry(200, 2),
    new T.MeshStandardMaterial({ color: 0x222233, roughness: 1 }));
  road2.rotation.x = -Math.PI/2;
  road2.position.set(0, 0.01, i*14);
  scene.add(road2);
}

// Buildings
const SLOTS = [];
for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
  if (Math.abs(x) !== 0 || Math.abs(z) !== 0) SLOTS.push([x*14, z*14]);
}
const windows = [];
SLOTS.forEach(([x, z]) => {
  const w = 6 + Math.random()*6;
  const h = 6 + Math.random()*40;
  const d = 6 + Math.random()*6;
  const hue = Math.floor(Math.random()*360);
  const m = new T.Mesh(new T.BoxGeometry(w, h, d),
    new T.MeshStandardMaterial({ color: new T.Color('hsl('+hue+',15%,30%)'), metalness: 0.4, roughness: 0.6 }));
  m.position.set(x, h/2, z);
  m.castShadow = true;
  scene.add(m);
  // Rooftop light
  const roofLight = new T.PointLight(0xffcc88, 0.4, 20);
  roofLight.position.set(x, h+1, z);
  scene.add(roofLight);
  windows.push(roofLight);
});

// Sun
const sun = new T.DirectionalLight(0xffd0a0, 1.5);
sun.position.set(40, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(new T.AmbientLight(0x7799cc, 0.5));

function onTick(t) {
  windows.forEach((l, i) => {
    l.intensity = 0.3 + Math.sin(t*2 + i) * 0.1;
  });
}
`;
  return {
    filename: `city_${Date.now()}.html`,
    html: worldHtml(title, "city", script),
    title,
    theme: "city",
  };
}

// ─── DESERT DUNES ────────────────────────────────────────────────

export function generateDesert(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Desert Dunes`;
  const script = `
scene.background = new T.Color(0xf4a460);
scene.fog = new T.Fog(0xfad6a5, 40, 150);
camera.position.set(0, 12, 40);

const geo = new T.PlaneGeometry(200, 200, 100, 100);
geo.rotateX(-Math.PI/2);
const pos = geo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  pos.setY(i, Math.sin(x * 0.05)*3 + Math.sin(z*0.07)*2.5 + Math.sin((x+z)*0.03)*2);
}
geo.computeVertexNormals();
const sand = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xdeb887, roughness: 1 }));
sand.receiveShadow = true;
scene.add(sand);

// Cacti
function cactus(x, z) {
  const mat = new T.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 });
  const stem = new T.Mesh(new T.CylinderGeometry(0.25, 0.3, 3, 8), mat);
  stem.position.set(x, 5, z);
  scene.add(stem);
  for (let s of [-1, 1]) {
    const arm = new T.Mesh(new T.CylinderGeometry(0.15, 0.18, 1.5, 8), mat);
    arm.rotation.z = s * 0.6;
    arm.position.set(x + s*0.6, 5.5, z);
    scene.add(arm);
    const tip = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 1, 8), mat);
    tip.position.set(x + s*1.1, 6, z);
    scene.add(tip);
  }
}
for (let i = 0; i < 20; i++) cactus((Math.random()-0.5)*60, (Math.random()-0.5)*60);

// Sand particles  
const sandGeo = new T.BufferGeometry();
const sp = new Float32Array(800*3);
for(let i=0;i<800;i++){sp[i*3]=(Math.random()-0.5)*80;sp[i*3+1]=Math.random()*5;sp[i*3+2]=(Math.random()-0.5)*80;}
sandGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
const sandPart = new T.Points(sandGeo, new T.PointsMaterial({color:0xf4d090,size:0.1,transparent:true,opacity:0.6}));
scene.add(sandPart);

// Sun
const sunOrb = new T.Mesh(new T.SphereGeometry(6,16,16), new T.MeshBasicMaterial({color:0xffdd44}));
sunOrb.position.set(0, 60, -100);
scene.add(sunOrb);
const sunL = new T.DirectionalLight(0xffe4b0, 2);
sunL.position.copy(sunOrb.position);
sunL.castShadow = true;
scene.add(sunL);
scene.add(new T.AmbientLight(0xddbb88, 0.4));

function onTick(t) {
  const pp = sandPart.geometry.attributes.position.array;
  for(let i=0;i<800;i++){pp[i*3]+=0.05;if(pp[i*3]>40)pp[i*3]=-40;}
  sandPart.geometry.attributes.position.needsUpdate = true;
}
`;
  return {
    filename: `desert_${Date.now()}.html`,
    html: worldHtml(title, "desert", script),
    title,
    theme: "desert",
  };
}

// ─── ARCTIC ──────────────────────────────────────────────────────

export function generateArctic(creatorName: string): GeneratedWorld {
  const title = `${creatorName}'s Arctic Aurora`;
  const script = `
scene.background = new T.Color(0x010a18);
scene.fog = new T.Fog(0x010a18, 40, 120);
camera.position.set(0, 10, 40);

// Snow ground
const geo = new T.PlaneGeometry(200, 200, 60, 60);
geo.rotateX(-Math.PI/2);
const pos = geo.attributes.position;
for(let i=0;i<pos.count;i++) pos.setY(i, Math.sin(pos.getX(i)*0.1)*0.8 + Math.random()*0.3);
geo.computeVertexNormals();
scene.add(new T.Mesh(geo, new T.MeshStandardMaterial({color:0xddeeff, roughness:0.95})));

// Ice structures  
for(let i=0;i<25;i++){
  const h=3+Math.random()*10;
  const m=new T.Mesh(new T.ConeGeometry(0.8+Math.random(),h,6),
    new T.MeshStandardMaterial({color:0x99ccee,metalness:0.9,roughness:0.05,transparent:true,opacity:0.8}));
  m.position.set((Math.random()-0.5)*60, h/2, (Math.random()-0.5)*60);
  scene.add(m);
}

// Snow particles
const snowGeo = new T.BufferGeometry();
const snowP = new Float32Array(3000*3);
for(let i=0;i<3000;i++){snowP[i*3]=(Math.random()-0.5)*100;snowP[i*3+1]=Math.random()*30;snowP[i*3+2]=(Math.random()-0.5)*100;}
snowGeo.setAttribute('position', new T.BufferAttribute(snowP,3));
const snow = new T.Points(snowGeo, new T.PointsMaterial({color:0xffffff,size:0.15,transparent:true,opacity:0.8}));
scene.add(snow);

// Aurora borealis - curved plane waves
const auroraColors=[0x00ff88, 0x0088ff, 0xaa00ff, 0x00ffcc];
const auroras=[];
for(let i=0;i<4;i++){
  const ag=new T.PlaneGeometry(120, 20, 60, 10);
  const am=new T.MeshBasicMaterial({color:auroraColors[i],transparent:true,opacity:0.12,side:T.DoubleSide});
  const aurora=new T.Mesh(ag, am);
  aurora.position.set(0, 25+i*5, -60);
  aurora.rotation.x = -0.3;
  aurora.rotation.y = i*0.3;
  scene.add(aurora);
  auroras.push({mesh:aurora, mat:am, phase:i*Math.PI/2});
}

scene.add(new T.AmbientLight(0x112233, 0.6));
const moonL = new T.DirectionalLight(0x8899cc, 0.8);
moonL.position.set(-20,40,10);
scene.add(moonL);

const snowOrig=snowP.slice();
function onTick(t){
  const sp=snow.geometry.attributes.position.array;
  for(let i=0;i<3000;i++){
    sp[i*3+1]-=0.05;if(sp[i*3+1]<0)sp[i*3+1]=30;
    sp[i*3]+=Math.sin(t+i)*0.01;
  }
  snow.geometry.attributes.position.needsUpdate=true;
  auroras.forEach((a,i)=>{
    a.mat.opacity=0.08+Math.sin(t*0.5+a.phase)*0.08;
    const vp=a.mesh.geometry.attributes.position;
    for(let j=0;j<vp.count;j++){
      const x=vp.getX(j);
      vp.setZ(j,Math.sin(x*0.04+t*0.8+i)*3+Math.sin(x*0.02+t*0.5)*2);
    }
    vp.needsUpdate=true;
    a.mesh.geometry.computeVertexNormals();
  });
}
`;
  return {
    filename: `arctic_${Date.now()}.html`,
    html: worldHtml(title, "arctic", script),
    title,
    theme: "arctic",
  };
}

// ─── REGISTRY ───────────────────────────────────────────────────

export const WORLD_GENERATORS = [
  generateCyberpunkCity,
  generateForest,
  generateOcean,
  generateSpaceStation,
  generateCrystalCave,
  generateCity,
  generateDesert,
  generateArctic,
];

export function generateRandomWorld(creatorName: string): GeneratedWorld {
  const fn = WORLD_GENERATORS[Math.floor(Math.random() * WORLD_GENERATORS.length)];
  return fn(creatorName);
}
