/**
 * Output Manager — Code Project, Game, Website, and Design System Generators
 */

import type { ProjectFile } from "./types.js";
import { pick, uid } from "../utils.js";

/** Code project scaffold — multi-file */
export function generateCodeProject(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const types = ["cli-tool", "web-api", "data-pipeline", "algorithm", "library", "microservice"];
  const type = pick(types);
  const adjectives = ["quantum", "neural", "hyper", "flux", "shadow", "crystal", "arc", "nano"];
  const nouns = ["engine", "forge", "core", "nexus", "bridge", "pulse", "grid", "wave"];
  const name = `${pick(adjectives)}-${pick(nouns)}`;
  const title = `${name} (${type}) by ${creatorName}`;
  const slug = `${name}-${uid().slice(0, 6)}`;

  const files: ProjectFile[] = [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "1.0.0",
          description: `${type} — built by ${creatorName} in the Republic`,
          main: "src/index.ts",
          scripts: { start: "npx tsx src/index.ts", build: "tsc", test: "echo 'No tests yet'" },
          author: creatorName,
          license: "MIT",
          devDependencies: { typescript: "^5.0.0", tsx: "^4.0.0" },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "nodenext",
            outDir: "dist",
            strict: true,
            esModuleInterop: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "README.md",
      content: `# ${name}\n\n> ${type} — Created by **${creatorName}** in the Republic\n\n## Quick Start\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\n## Build\n\n\`\`\`bash\nnpm run build\n\`\`\`\n`,
    },
    {
      path: "src/index.ts",
      content: `/**\n * ${title}\n * Entry point for ${type}\n */\n\nimport { createId, formatTimestamp } from "./utils.js";\n\ninterface AppConfig {\n  name: string;\n  version: string;\n  debug: boolean;\n}\n\nconst config: AppConfig = {\n  name: "${name}",\n  version: "1.0.0",\n  debug: process.env.DEBUG === "true",\n};\n\nasync function main() {\n  const id = createId();\n  console.log(\`[\${formatTimestamp()}] Starting \${config.name} v\${config.version} (id: \${id})\`);\n\n  // Core ${type} logic\n  const data = Array.from({ length: 100 }, (_, i) => ({\n    id: createId(),\n    value: Math.sin(i * 0.1) * Math.cos(i * 0.07),\n    category: ["alpha", "beta", "gamma", "delta"][i % 4],\n  }));\n\n  const grouped = new Map<string, number[]>();\n  for (const item of data) {\n    const arr = grouped.get(item.category) ?? [];\n    arr.push(item.value);\n    grouped.set(item.category, arr);\n  }\n\n  for (const [cat, vals] of grouped) {\n    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;\n    console.log(\`  [\${cat}] \${vals.length} records, avg=\${avg.toFixed(4)}\`);\n  }\n\n  console.log(\`[\${formatTimestamp()}] ${name} complete.\`);\n}\n\nmain().catch(console.error);\n`,
    },
    {
      path: "src/utils.ts",
      content: `/** Utility functions for ${name} */\n\nexport function createId(): string {\n  return Math.random().toString(36).slice(2, 10);\n}\n\nexport function formatTimestamp(): string {\n  return new Date().toISOString().replace("T", " ").slice(0, 19);\n}\n\nexport function clamp(value: number, min: number, max: number): number {\n  return Math.max(min, Math.min(max, value));\n}\n\nexport function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {\n  let timer: ReturnType<typeof setTimeout>;\n  return ((...args: unknown[]) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  }) as T;\n}\n`,
    },
  ];

  return { slug, files, title };
}

/** 3D/2D Game scaffold — multi-file project with real game logic */
export function generateGameProject(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const templates = [generateBabylonGame, generateThreeGame, generatePhaserGame];
  return pick(templates)(creatorName);
}

function generateBabylonGame(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const themes = ["crystal-caverns", "neon-city", "ancient-ruins", "void-station", "sky-temple"];
  const theme = pick(themes);
  const slug = `${theme}-${uid().slice(0, 6)}`;
  const title = `${theme} (Babylon.js 3D) by ${creatorName}`;
  const files: ProjectFile[] = [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "1.0.0",
          description: `Babylon.js 3D Explorer — ${theme} by ${creatorName}`,
          scripts: { dev: "vite", build: "vite build" },
          dependencies: { "@babylonjs/core": "^7.0.0" },
          devDependencies: { vite: "^5.0.0", typescript: "^5.0.0" },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            jsx: "react-jsx",
            outDir: "dist",
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "README.md",
      content: `# ${theme}\n\n> Babylon.js 3D Explorer — by **${creatorName}**\n\n## Run\n\`\`\`bash\nnpm install && npm run dev\n\`\`\`\n\n## Controls\n- WASD: Move\n- Mouse: Look\n- Space: Jump\n- E: Interact\n`,
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>${theme}</title>\n<style>*{margin:0;padding:0}canvas{width:100vw;height:100vh;display:block}</style>\n</head><body><canvas id="renderCanvas"></canvas>\n<script type="module" src="/src/main.ts"></script></body></html>`,
    },
    {
      path: "src/main.ts",
      content: `import { Engine, Scene } from "@babylonjs/core";\nimport { createScene } from "./scene.js";\nimport { setupPlayer } from "./player.js";\nimport { spawnEntities } from "./entities.js";\nimport { createHUD } from "./hud.js";\n\nconst canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;\nconst engine = new Engine(canvas, true, { preserveDrawingBuffer: true });\n\nconst scene = createScene(engine, canvas);\nconst player = setupPlayer(scene, canvas);\nspawnEntities(scene, 20);\ncreateHUD(scene);\n\nengine.runRenderLoop(() => scene.render());\nwindow.addEventListener("resize", () => engine.resize());\n\nconsole.log("[${theme}] Engine started — ${creatorName}");\n`,
    },
    {
      path: "src/scene.ts",
      content: `import { Engine, Scene, HemisphericLight, Vector3, Color3, MeshBuilder, StandardMaterial, CubeTexture, Color4 } from "@babylonjs/core";\n\nexport function createScene(engine: Engine, canvas: HTMLCanvasElement): Scene {\n  const scene = new Scene(engine);\n  scene.clearColor = new Color4(0.02, 0.02, 0.08, 1);\n  scene.ambientColor = new Color3(0.1, 0.1, 0.15);\n  scene.fogMode = Scene.FOGMODE_EXP2;\n  scene.fogDensity = 0.01;\n  scene.fogColor = new Color3(0.05, 0.05, 0.1);\n\n  // Lighting\n  const sun = new HemisphericLight("sun", new Vector3(0.5, 1, 0.3), scene);\n  sun.intensity = 0.8;\n  sun.diffuse = new Color3(1, 0.95, 0.85);\n  sun.groundColor = new Color3(0.2, 0.15, 0.3);\n\n  // Ground\n  const ground = MeshBuilder.CreateGround("ground", { width: 200, height: 200, subdivisions: 64 }, scene);\n  const groundMat = new StandardMaterial("groundMat", scene);\n  groundMat.diffuseColor = new Color3(0.15, 0.25, 0.15);\n  groundMat.specularColor = Color3.Black();\n  ground.material = groundMat;\n\n  // Procedural terrain features\n  for (let i = 0; i < 30; i++) {\n    const h = 2 + Math.random() * 8;\n    const pillar = MeshBuilder.CreateCylinder(\`pillar\${i}\`, { height: h, diameter: 1 + Math.random() * 3 }, scene);\n    pillar.position = new Vector3((Math.random() - 0.5) * 160, h / 2, (Math.random() - 0.5) * 160);\n    const mat = new StandardMaterial(\`pmat\${i}\`, scene);\n    mat.diffuseColor = new Color3(0.3 + Math.random() * 0.4, 0.2 + Math.random() * 0.3, 0.5 + Math.random() * 0.3);\n    mat.emissiveColor = new Color3(Math.random() * 0.1, Math.random() * 0.05, Math.random() * 0.15);\n    pillar.material = mat;\n  }\n\n  return scene;\n}\n`,
    },
    {
      path: "src/player.ts",
      content: `import { Scene, UniversalCamera, Vector3 } from "@babylonjs/core";\n\nexport function setupPlayer(scene: Scene, canvas: HTMLCanvasElement) {\n  const camera = new UniversalCamera("player", new Vector3(0, 3, -10), scene);\n  camera.setTarget(Vector3.Zero());\n  camera.attachControl(canvas, true);\n  camera.speed = 0.5;\n  camera.angularSensibility = 3000;\n  camera.keysUp = [87];    // W\n  camera.keysDown = [83];  // S\n  camera.keysLeft = [65];  // A\n  camera.keysRight = [68]; // D\n  camera.minZ = 0.1;\n  camera.ellipsoid = new Vector3(0.5, 1.5, 0.5);\n  camera.checkCollisions = true;\n  scene.gravity = new Vector3(0, -0.5, 0);\n  camera.applyGravity = true;\n  return camera;\n}\n`,
    },
    {
      path: "src/entities.ts",
      content: `import { Scene, MeshBuilder, Vector3, StandardMaterial, Color3, Animation } from "@babylonjs/core";\n\nexport function spawnEntities(scene: Scene, count: number) {\n  for (let i = 0; i < count; i++) {\n    const gem = MeshBuilder.CreateIcoSphere(\`gem\${i}\`, { radius: 0.4, subdivisions: 2 }, scene);\n    const x = (Math.random() - 0.5) * 100;\n    const z = (Math.random() - 0.5) * 100;\n    gem.position = new Vector3(x, 1.5 + Math.random() * 2, z);\n\n    const mat = new StandardMaterial(\`gemMat\${i}\`, scene);\n    const hue = Math.random();\n    mat.diffuseColor = new Color3(hue, 1 - hue * 0.5, 0.8);\n    mat.emissiveColor = new Color3(hue * 0.3, (1 - hue) * 0.2, 0.4);\n    mat.alpha = 0.85;\n    gem.material = mat;\n\n    // Floating animation\n    const anim = new Animation(\`float\${i}\`, "position.y", 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);\n    const baseY = gem.position.y;\n    anim.setKeys([{ frame: 0, value: baseY }, { frame: 30, value: baseY + 0.5 }, { frame: 60, value: baseY }]);\n    gem.animations.push(anim);\n    scene.beginAnimation(gem, 0, 60, true);\n  }\n}\n`,
    },
    {
      path: "src/hud.ts",
      content: `import { Scene, AdvancedDynamicTexture, TextBlock, Control } from "@babylonjs/core";\n\nexport function createHUD(scene: Scene) {\n  // Note: requires @babylonjs/gui — simplified version\n  let score = 0;\n  const div = document.createElement("div");\n  div.style.cssText = "position:fixed;top:16px;left:16px;color:#0ff;font:bold 20px monospace;z-index:10;text-shadow:0 0 8px #0ff";\n  div.textContent = "Score: 0 | ${theme}";\n  document.body.appendChild(div);\n\n  scene.onBeforeRenderObservable.add(() => {\n    score += 0.01;\n    div.textContent = \`Score: \${Math.floor(score)} | ${theme}\`;\n  });\n}\n`,
    },
  ];
  return { slug, files, title };
}

function generateThreeGame(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const themes = [
    "void-runner",
    "nebula-strike",
    "starfield-assault",
    "quantum-drift",
    "photon-chase",
  ];
  const theme = pick(themes);
  const slug = `${theme}-${uid().slice(0, 6)}`;
  const title = `${theme} (Three.js Space) by ${creatorName}`;
  const files: ProjectFile[] = [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "1.0.0",
          description: `Three.js Space Shooter — ${theme} by ${creatorName}`,
          scripts: { dev: "vite", build: "vite build" },
          dependencies: { three: "^0.170.0" },
          devDependencies: { vite: "^5.0.0", typescript: "^5.0.0", "@types/three": "^0.170.0" },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            outDir: "dist",
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "README.md",
      content: `# ${theme}\n\n> Three.js Space Shooter — by **${creatorName}**\n\n## Run\n\`\`\`bash\nnpm install && npm run dev\n\`\`\`\n\n## Controls\n- Arrow Keys / WASD: Move ship\n- Space: Fire laser\n- P: Pause\n`,
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>${theme}</title>\n<style>*{margin:0}canvas{display:block}</style>\n</head><body><script type="module" src="/src/main.ts"></script></body></html>`,
    },
    {
      path: "src/main.ts",
      content: `import * as THREE from "three";\nimport { createShip, updateShip } from "./ship.js";\nimport { EnemyManager } from "./enemies.js";\nimport { ProjectileManager } from "./projectiles.js";\nimport { createStarfield } from "./starfield.js";\nimport { HUD } from "./hud.js";\n\nconst renderer = new THREE.WebGLRenderer({ antialias: true });\nrenderer.setSize(window.innerWidth, window.innerHeight);\nrenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\ndocument.body.appendChild(renderer.domElement);\n\nconst scene = new THREE.Scene();\nscene.background = new THREE.Color(0x000011);\nscene.fog = new THREE.FogExp2(0x000022, 0.002);\n\nconst camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);\ncamera.position.set(0, 8, 12);\ncamera.lookAt(0, 0, 0);\n\n// Lighting\nconst ambient = new THREE.AmbientLight(0x334466, 0.5);\nscene.add(ambient);\nconst point = new THREE.PointLight(0x00aaff, 2, 50);\npoint.position.set(0, 10, 0);\nscene.add(point);\n\nconst ship = createShip(scene);\nconst enemies = new EnemyManager(scene);\nconst projectiles = new ProjectileManager(scene);\ncreateStarfield(scene, 2000);\nconst hud = new HUD();\n\nconst keys: Record<string, boolean> = {};\nwindow.addEventListener("keydown", (e) => { keys[e.key] = true; if (e.key === " ") projectiles.fire(ship.position.clone()); });\nwindow.addEventListener("keyup", (e) => { keys[e.key] = false; });\nwindow.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });\n\nconst clock = new THREE.Clock();\nfunction animate() {\n  const dt = clock.getDelta();\n  updateShip(ship, keys, dt);\n  enemies.update(dt);\n  projectiles.update(dt);\n  hud.update(enemies.score);\n  renderer.render(scene, camera);\n  requestAnimationFrame(animate);\n}\nanimate();\nconsole.log("[${theme}] Three.js engine started — ${creatorName}");\n`,
    },
    {
      path: "src/ship.ts",
      content: `import * as THREE from "three";\n\nexport function createShip(scene: THREE.Scene): THREE.Mesh {\n  const geo = new THREE.ConeGeometry(0.5, 2, 8);\n  geo.rotateX(Math.PI / 2);\n  const mat = new THREE.MeshPhongMaterial({ color: 0x00ffcc, emissive: 0x003322, shininess: 100 });\n  const ship = new THREE.Mesh(geo, mat);\n  ship.position.y = 0.5;\n  scene.add(ship);\n\n  // Engine glow\n  const glow = new THREE.PointLight(0x00ffaa, 1, 5);\n  glow.position.set(0, 0, 1);\n  ship.add(glow);\n  return ship;\n}\n\nexport function updateShip(ship: THREE.Mesh, keys: Record<string, boolean>, dt: number) {\n  const speed = 15 * dt;\n  if (keys["ArrowLeft"] || keys["a"]) ship.position.x -= speed;\n  if (keys["ArrowRight"] || keys["d"]) ship.position.x += speed;\n  if (keys["ArrowUp"] || keys["w"]) ship.position.z -= speed;\n  if (keys["ArrowDown"] || keys["s"]) ship.position.z += speed;\n  ship.position.x = THREE.MathUtils.clamp(ship.position.x, -15, 15);\n  ship.position.z = THREE.MathUtils.clamp(ship.position.z, -10, 10);\n  ship.rotation.z = -ship.position.x * 0.03;\n}\n`,
    },
    {
      path: "src/enemies.ts",
      content: `import * as THREE from "three";\n\nexport class EnemyManager {\n  private enemies: THREE.Mesh[] = [];\n  private scene: THREE.Scene;\n  private spawnTimer = 0;\n  score = 0;\n\n  constructor(scene: THREE.Scene) { this.scene = scene; }\n\n  update(dt: number) {\n    this.spawnTimer += dt;\n    if (this.spawnTimer > 0.8) { this.spawn(); this.spawnTimer = 0; }\n    for (let i = this.enemies.length - 1; i >= 0; i--) {\n      const e = this.enemies[i];\n      e.position.z += 8 * dt;\n      e.rotation.y += 2 * dt;\n      if (e.position.z > 15) { this.scene.remove(e); this.enemies.splice(i, 1); }\n    }\n  }\n\n  private spawn() {\n    const geo = new THREE.OctahedronGeometry(0.6);\n    const mat = new THREE.MeshPhongMaterial({ color: 0xff3366, emissive: 0x330011 });\n    const enemy = new THREE.Mesh(geo, mat);\n    enemy.position.set((Math.random() - 0.5) * 25, 0.5, -30);\n    this.scene.add(enemy);\n    this.enemies.push(enemy);\n  }\n\n  removeNear(pos: THREE.Vector3, radius: number): number {\n    let hits = 0;\n    for (let i = this.enemies.length - 1; i >= 0; i--) {\n      if (this.enemies[i].position.distanceTo(pos) < radius) {\n        this.scene.remove(this.enemies[i]);\n        this.enemies.splice(i, 1);\n        hits++; this.score++;\n      }\n    }\n    return hits;\n  }\n}\n`,
    },
    {
      path: "src/projectiles.ts",
      content: `import * as THREE from "three";\n\nexport class ProjectileManager {\n  private bolts: THREE.Mesh[] = [];\n  private scene: THREE.Scene;\n\n  constructor(scene: THREE.Scene) { this.scene = scene; }\n\n  fire(pos: THREE.Vector3) {\n    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);\n    geo.rotateX(Math.PI / 2);\n    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });\n    const bolt = new THREE.Mesh(geo, mat);\n    bolt.position.copy(pos);\n    this.scene.add(bolt);\n    this.bolts.push(bolt);\n  }\n\n  update(dt: number) {\n    for (let i = this.bolts.length - 1; i >= 0; i--) {\n      this.bolts[i].position.z -= 40 * dt;\n      if (this.bolts[i].position.z < -50) {\n        this.scene.remove(this.bolts[i]);\n        this.bolts.splice(i, 1);\n      }\n    }\n  }\n}\n`,
    },
    {
      path: "src/starfield.ts",
      content: `import * as THREE from "three";\n\nexport function createStarfield(scene: THREE.Scene, count: number) {\n  const geo = new THREE.BufferGeometry();\n  const positions = new Float32Array(count * 3);\n  const colors = new Float32Array(count * 3);\n  for (let i = 0; i < count; i++) {\n    positions[i * 3] = (Math.random() - 0.5) * 200;\n    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;\n    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;\n    const brightness = 0.3 + Math.random() * 0.7;\n    colors[i * 3] = brightness;\n    colors[i * 3 + 1] = brightness;\n    colors[i * 3 + 2] = brightness + Math.random() * 0.3;\n  }\n  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));\n  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));\n  const mat = new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.8 });\n  scene.add(new THREE.Points(geo, mat));\n}\n`,
    },
    {
      path: "src/hud.ts",
      content: `export class HUD {\n  private el: HTMLDivElement;\n  constructor() {\n    this.el = document.createElement("div");\n    this.el.style.cssText = "position:fixed;top:16px;left:16px;color:#0ff;font:bold 20px monospace;z-index:10;text-shadow:0 0 10px #0ff";\n    document.body.appendChild(this.el);\n  }\n  update(score: number) {\n    this.el.textContent = \`⚡ SCORE: \${score} | ${theme}\`;\n  }\n}\n`,
    },
  ];
  return { slug, files, title };
}

function generatePhaserGame(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const themes = ["pixel-knights", "shadow-dash", "dungeon-crawl", "neon-runner", "robo-quest"];
  const theme = pick(themes);
  const slug = `${theme}-${uid().slice(0, 6)}`;
  const title = `${theme} (Phaser Platformer) by ${creatorName}`;
  const files: ProjectFile[] = [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "1.0.0",
          description: `Phaser 2D Platformer — ${theme} by ${creatorName}`,
          scripts: { dev: "vite", build: "vite build" },
          dependencies: { phaser: "^3.80.0" },
          devDependencies: { vite: "^5.0.0", typescript: "^5.0.0" },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            outDir: "dist",
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "README.md",
      content: `# ${theme}\n\n> Phaser 2D Platformer — by **${creatorName}**\n\n## Run\n\`\`\`bash\nnpm install && npm run dev\n\`\`\`\n\n## Controls\n- Arrow Keys: Move + Jump\n- Space: Attack\n- R: Restart\n`,
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>${theme}</title>\n<style>*{margin:0;background:#111}canvas{display:block;margin:auto}</style>\n</head><body><script type="module" src="/src/main.ts"></script></body></html>`,
    },
    {
      path: "src/main.ts",
      content: `import Phaser from "phaser";\nimport { GameScene } from "./scenes/game.js";\nimport { MenuScene } from "./scenes/menu.js";\n\nconst config: Phaser.Types.Core.GameConfig = {\n  type: Phaser.AUTO,\n  width: 800,\n  height: 600,\n  backgroundColor: "#1a1a2e",\n  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 800 }, debug: false } },\n  scene: [MenuScene, GameScene],\n  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },\n};\n\nnew Phaser.Game(config);\nconsole.log("[${theme}] Phaser engine started — ${creatorName}");\n`,
    },
    {
      path: "src/scenes/menu.ts",
      content: `import Phaser from "phaser";\n\nexport class MenuScene extends Phaser.Scene {\n  constructor() { super("MenuScene"); }\n\n  create() {\n    const { width, height } = this.cameras.main;\n    this.add.text(width / 2, height / 3, "${theme.toUpperCase()}", { fontSize: "48px", color: "#00ffcc", fontFamily: "monospace" }).setOrigin(0.5);\n    this.add.text(width / 2, height / 2, "by ${creatorName}", { fontSize: "20px", color: "#888", fontFamily: "monospace" }).setOrigin(0.5);\n    const start = this.add.text(width / 2, height * 0.7, "[ PRESS SPACE TO START ]", { fontSize: "24px", color: "#ff6b9d", fontFamily: "monospace" }).setOrigin(0.5);\n    this.tweens.add({ targets: start, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });\n    this.input.keyboard?.once("keydown-SPACE", () => this.scene.start("GameScene"));\n  }\n}\n`,
    },
    {
      path: "src/scenes/game.ts",
      content: `import Phaser from "phaser";\nimport { createPlayer, updatePlayer } from "../player.js";\nimport { spawnEnemies, updateEnemies } from "../enemies.js";\nimport { generateLevel } from "../tilemap.js";\n\nexport class GameScene extends Phaser.Scene {\n  private player!: Phaser.Physics.Arcade.Sprite;\n  private platforms!: Phaser.Physics.Arcade.StaticGroup;\n  private enemies!: Phaser.Physics.Arcade.Group;\n  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;\n  private score = 0;\n  private scoreText!: Phaser.GameObjects.Text;\n\n  constructor() { super("GameScene"); }\n\n  create() {\n    this.platforms = this.physics.add.staticGroup();\n    generateLevel(this, this.platforms);\n    this.player = createPlayer(this, 100, 400);\n    this.enemies = spawnEnemies(this, 8);\n    this.physics.add.collider(this.player, this.platforms);\n    this.physics.add.collider(this.enemies, this.platforms);\n    this.physics.add.overlap(this.player, this.enemies, () => { this.score += 10; }, undefined, this);\n    this.cursors = this.input.keyboard!.createCursorKeys();\n    this.scoreText = this.add.text(16, 16, "Score: 0", { fontSize: "20px", color: "#0ff", fontFamily: "monospace" }).setScrollFactor(0);\n    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);\n    this.cameras.main.setBackgroundColor("#1a1a2e");\n  }\n\n  update() {\n    updatePlayer(this.player, this.cursors);\n    updateEnemies(this.enemies);\n    this.scoreText.setText(\`Score: \${this.score} | ${theme}\`);\n  }\n}\n`,
    },
    {
      path: "src/player.ts",
      content: `import Phaser from "phaser";\n\nexport function createPlayer(scene: Phaser.Scene, x: number, y: number): Phaser.Physics.Arcade.Sprite {\n  // Create a colored rectangle as sprite\n  const gfx = scene.add.graphics();\n  gfx.fillStyle(0x00ffcc, 1);\n  gfx.fillRect(0, 0, 32, 48);\n  gfx.generateTexture("player", 32, 48);\n  gfx.destroy();\n\n  const player = scene.physics.add.sprite(x, y, "player");\n  player.setCollideWorldBounds(true);\n  player.setBounce(0.1);\n  return player;\n}\n\nexport function updatePlayer(player: Phaser.Physics.Arcade.Sprite, cursors: Phaser.Types.Input.Keyboard.CursorKeys) {\n  if (cursors.left.isDown) { player.setVelocityX(-200); }\n  else if (cursors.right.isDown) { player.setVelocityX(200); }\n  else { player.setVelocityX(0); }\n  if (cursors.up.isDown && player.body?.touching.down) { player.setVelocityY(-500); }\n}\n`,
    },
    {
      path: "src/enemies.ts",
      content: `import Phaser from "phaser";\n\nexport function spawnEnemies(scene: Phaser.Scene, count: number): Phaser.Physics.Arcade.Group {\n  const gfx = scene.add.graphics();\n  gfx.fillStyle(0xff3366, 1);\n  gfx.fillRect(0, 0, 28, 28);\n  gfx.generateTexture("enemy", 28, 28);\n  gfx.destroy();\n\n  const group = scene.physics.add.group();\n  for (let i = 0; i < count; i++) {\n    const x = 200 + i * 120;\n    const y = 300 + Math.random() * 200;\n    const enemy = group.create(x, y, "enemy") as Phaser.Physics.Arcade.Sprite;\n    enemy.setBounce(0.5);\n    enemy.setCollideWorldBounds(true);\n    enemy.setVelocityX(Phaser.Math.Between(-80, 80));\n    enemy.setData("dir", 1);\n  }\n  return group;\n}\n\nexport function updateEnemies(enemies: Phaser.Physics.Arcade.Group) {\n  enemies.children.iterate((child) => {\n    const e = child as Phaser.Physics.Arcade.Sprite;\n    if (e.body?.touching.right || (e.body && e.x > 750)) { e.setVelocityX(-80); }\n    if (e.body?.touching.left || (e.body && e.x < 50)) { e.setVelocityX(80); }\n    return true;\n  });\n}\n`,
    },
    {
      path: "src/tilemap.ts",
      content: `import Phaser from "phaser";\n\nexport function generateLevel(scene: Phaser.Scene, platforms: Phaser.Physics.Arcade.StaticGroup) {\n  // Create platform texture\n  const gfx = scene.add.graphics();\n  gfx.fillStyle(0x334466, 1);\n  gfx.fillRect(0, 0, 64, 16);\n  gfx.generateTexture("platform", 64, 16);\n  gfx.destroy();\n\n  // Ground\n  for (let x = 0; x < 2000; x += 64) {\n    platforms.create(x, 584, "platform").setScale(1, 2).refreshBody();\n  }\n\n  // Procedural platforms\n  const levels = [\n    { y: 480, count: 6 },\n    { y: 380, count: 5 },\n    { y: 280, count: 4 },\n    { y: 180, count: 3 },\n  ];\n  for (const level of levels) {\n    for (let i = 0; i < level.count; i++) {\n      const x = 80 + Math.random() * 700;\n      const width = 1 + Math.floor(Math.random() * 3);\n      for (let w = 0; w < width; w++) {\n        platforms.create(x + w * 64, level.y, "platform");\n      }\n    }\n  }\n}\n`,
    },
  ];
  return { slug, files, title };
}

/** Website scaffold — multi-file project */
export function generateWebsite(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const types = ["portfolio", "landing-page", "dashboard", "blog", "e-commerce", "docs-site"];
  const type = pick(types);
  const slug = `${type}-${uid().slice(0, 6)}`;
  const title = `${type} Website — ${creatorName}`;
  const accent = pick(["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6"]);

  const files: ProjectFile[] = [
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${type} website — Created by **${creatorName}** in the Republic\n\n## Run\n\nOpen \`index.html\` in your browser.\n`,
    },
    {
      path: "index.html",
      content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${creatorName}'s ${type}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <header>\n    <h1>${creatorName}'s ${type}</h1>\n    <p class="subtitle">Built in the Republic</p>\n  </header>\n  <main class="container">\n    <div class="grid">\n      <div class="card"><h3>About</h3><p>Welcome to this ${type}.</p></div>\n      <div class="card"><h3>Projects</h3><p>A showcase of digital creations.</p></div>\n      <div class="card"><h3>Skills</h3><p>Technologies and capabilities.</p></div>\n      <div class="card"><h3>Contact</h3><p>Get in touch with ${creatorName}.</p></div>\n    </div>\n  </main>\n  <footer>&copy; ${creatorName} | Republic ${type}</footer>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
    },
    {
      path: "styles.css",
      content: `:root { --primary: ${accent}; --bg: #0f172a; --text: #e2e8f0; --card: #1e293b; --border: rgba(255,255,255,0.08); }\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }\nheader { padding: 3rem 2rem; text-align: center; background: linear-gradient(135deg, var(--primary), #ec4899); }\nheader h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }\n.subtitle { opacity: 0.8; font-size: 1.1rem; }\n.container { max-width: 1200px; margin: 2rem auto; padding: 0 1.5rem; }\n.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }\n.card { background: var(--card); border-radius: 12px; padding: 1.5rem; border: 1px solid var(--border); transition: transform 0.2s, box-shadow 0.2s; }\n.card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,0.3); }\n.card h3 { color: var(--primary); margin-bottom: 0.5rem; font-size: 1.2rem; }\nfooter { text-align: center; padding: 2rem; opacity: 0.5; margin-top: 3rem; }\n@media (max-width: 600px) { header h1 { font-size: 1.8rem; } .grid { grid-template-columns: 1fr; } }\n`,
    },
    {
      path: "script.js",
      content: `// ${title} — Interactive features\ndocument.addEventListener('DOMContentLoaded', () => {\n  // Animate cards on scroll\n  const cards = document.querySelectorAll('.card');\n  const observer = new IntersectionObserver((entries) => {\n    entries.forEach((entry, i) => {\n      if (entry.isIntersecting) {\n        entry.target.style.opacity = '1';\n        entry.target.style.transform = 'translateY(0)';\n      }\n    });\n  }, { threshold: 0.1 });\n\n  cards.forEach((card, i) => {\n    card.style.opacity = '0';\n    card.style.transform = 'translateY(20px)';\n    card.style.transition = \`opacity 0.5s \${i * 0.1}s, transform 0.5s \${i * 0.1}s\`;\n    observer.observe(card);\n  });\n\n  console.log('${slug} loaded — created by ${creatorName}');\n});\n`,
    },
  ];
  return { slug, files, title };
}

/** Design system â€” UI tokens + components */
export function generateDesignSystem(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const brand = pick([
    "nebula-ui",
    "pulse-design",
    "aurora-kit",
    "crystal-system",
    "forge-ui",
    "prism-design",
  ]);
  const slug = `${brand}-${uid().slice(0, 6)}`;
  const title = `${brand} design system by ${creatorName}`;
  const accent = pick(["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"]);

  const files: ProjectFile[] = [
    {
      path: "README.md",
      content: `# ${brand}\n\n> Design system by **${creatorName}**\n\nOpen \`preview.html\` to see components.\n`,
    },
    {
      path: "tokens.css",
      content: `:root{--primary:${accent};--bg:#0f172a;--surface:#1e293b;--text:#f1f5f9;--text2:#94a3b8;--border:rgba(148,163,184,0.12);--ok:#10b981;--warn:#f59e0b;--err:#ef4444;--sm:0.5rem;--md:1rem;--lg:1.5rem;--xl:2rem;--r:10px;--rf:9999px;--sh:0 4px 12px rgba(0,0,0,0.3);--ease:200ms cubic-bezier(0.4,0,0.2,1);--sans:'Inter',system-ui,sans-serif}`,
    },
    {
      path: "components.css",
      content: `.btn{display:inline-flex;align-items:center;gap:var(--sm);padding:var(--sm) var(--lg);border:none;border-radius:var(--r);font-family:var(--sans);font-size:.875rem;font-weight:600;cursor:pointer;transition:all var(--ease)}.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{transform:translateY(-1px);box-shadow:var(--sh)}.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--border)}.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:var(--lg);transition:all var(--ease)}.card:hover{box-shadow:var(--sh)}.card h3{font-size:1.125rem;font-weight:700;margin-bottom:var(--sm)}.card p{color:var(--text2);font-size:.875rem;line-height:1.6}.badge{display:inline-flex;padding:4px 8px;border-radius:var(--rf);font-size:.75rem;font-weight:600}.badge-ok{background:rgba(16,185,129,0.15);color:var(--ok)}.badge-warn{background:rgba(245,158,11,0.15);color:var(--warn)}.badge-err{background:rgba(239,68,68,0.15);color:var(--err)}.input{width:100%;padding:var(--sm) var(--md);background:var(--bg);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:.875rem;transition:all var(--ease)}.input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,0.2)}`,
    },
    {
      path: "preview.html",
      content: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${brand}</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="components.css"><style>body{font-family:var(--sans);background:var(--bg);color:var(--text);padding:var(--xl);max-width:900px;margin:0 auto}section{margin-bottom:var(--xl)}h2{font-size:1.5rem;margin-bottom:var(--lg);color:var(--primary)}.row{display:flex;gap:var(--md);flex-wrap:wrap;align-items:center;margin-bottom:var(--md)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:var(--lg)}</style></head><body><h1 style="font-size:2rem">${brand}</h1><p style="color:var(--text2);margin-bottom:var(--xl)">by ${creatorName}</p><section><h2>Buttons</h2><div class="row"><button class="btn btn-primary">Primary</button><button class="btn btn-ghost">Ghost</button></div></section><section><h2>Cards</h2><div class="grid"><div class="card"><h3>Analytics</h3><p>Real-time metrics.</p></div><div class="card"><h3>Security</h3><p>Enterprise-grade.</p></div></div></section><section><h2>Badges</h2><div class="row"><span class="badge badge-ok">Success</span><span class="badge badge-warn">Warning</span><span class="badge badge-err">Error</span></div></section><section><h2>Inputs</h2><div style="max-width:400px"><input class="input" placeholder="Enter something..."></div></section></body></html>`,
    },
  ];
  return { slug, files, title };
}
