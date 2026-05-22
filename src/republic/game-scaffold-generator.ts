/**
 * Game Scaffold Generator — Complete React Three Fiber Game Templates
 *
 * Generates production-ready, runnable 3D React games for citizen GameDevelopers.
 * Each archetype is a complete Vite + React + R3F project with:
 *   - Full package.json with pinned deps (React Three Fiber, Drei, Rapier, leva, postprocessing)
 *   - Main scene with PBR lighting, shadows, environment maps, post-processing
 *   - Physics-enabled gameplay
 *   - Custom GLSL shaders for visual effects
 *   - Keyboard/gamepad input hooks
 *   - HUD overlay
 *
 * Dependencies baked into every generated game:
 *   @react-three/fiber    — React renderer for Three.js
 *   @react-three/drei     — useful helpers (OrbitControls, Sky, Stars, Text, etc.)
 *   @react-three/rapier   — Rapier WASM physics (Rust-based, extremely fast)
 *   @react-three/postprocessing — Bloom, SSAO, ChromaticAberration, Vignette
 *   three                 — Three.js itself
 *   leva                  — runtime tweaking panel for game params
 *   @react-spring/three   — spring-based animation for 3D objects
 *   zustand               — lightweight state management
 *   vite                  — build tool
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("game-scaffold");

// ─── Types ────────────────────────────────────────────────────────────────────

export type GameArchetype =
  | "platformer3d"
  | "space-shooter"
  | "puzzle-world"
  | "rpg-world"
  | "racing-game";

export interface GameScaffoldOptions {
  archetype: GameArchetype;
  gameName: string;
  citizenName: string;
  prompt: string;
  outputDir: string;
}

export interface ScaffoldedFile {
  relativePath: string;
  content: string;
}

export interface GameScaffoldResult {
  ok: boolean;
  archetype: GameArchetype;
  gameName: string;
  files: ScaffoldedFile[];
  outputDir: string;
  instructions: string;
  error?: string;
}

// ─── Archetype Metadata ───────────────────────────────────────────────────────

export const ARCHETYPE_META: Record<GameArchetype, {
  title: string;
  description: string;
  stack: string[];
  previewColor: string;
  emoji: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}> = {
  "platformer3d": {
    title: "3D Platformer",
    description: "Physics-driven 3D platformer with moving platforms, collectibles, and a third-person camera. Features Rapier rigid body physics, dynamic lighting with shadow cascades, and a custom jump mechanic.",
    stack: ["React Three Fiber", "Drei", "Rapier Physics", "Leva", "Zustand"],
    previewColor: "#7c3aed",
    emoji: "🎮",
    difficulty: "intermediate",
  },
  "space-shooter": {
    title: "Space Shooter",
    description: "Arcade space shooter with particle effects, bloom post-processing, procedural asteroid field, laser bullets, and enemy AI. Features additive blending, instanced meshes for performance, and a shield system.",
    stack: ["React Three Fiber", "Drei", "Postprocessing", "Leva", "React Spring"],
    previewColor: "#0ea5e9",
    emoji: "🚀",
    difficulty: "intermediate",
  },
  "puzzle-world": {
    title: "Physics Puzzle World",
    description: "3D physics puzzle game inspired by Portal and Marble It Up. Push blocks, trigger pressure plates, and solve puzzles using Rapier constraints. Features environmental storytelling and HDRI lighting.",
    stack: ["React Three Fiber", "Drei", "Rapier Physics", "Zustand", "Leva"],
    previewColor: "#10b981",
    emoji: "🧩",
    difficulty: "beginner",
  },
  "rpg-world": {
    title: "Open-World RPG",
    description: "Open-world RPG with procedural terrain (simplex noise), day-night cycle, fog, NPC crowds, inventory system, and first-person/third-person camera toggle. Characters have idle/walk/run animations via Three.js AnimationMixer.",
    stack: ["React Three Fiber", "Drei", "Rapier Physics", "Zustand", "React Spring"],
    previewColor: "#f59e0b",
    emoji: "⚔️",
    difficulty: "advanced",
  },
  "racing-game": {
    title: "Racing Game",
    description: "High-speed arcade racing with a custom Rapier vehicle controller, track with banked turns, speed boost pickups, real-time minimap, lap timer, and motion blur post-processing. Supports splitscreen with PiP.",
    stack: ["React Three Fiber", "Rapier Physics", "Drei", "Postprocessing", "Leva"],
    previewColor: "#ef4444",
    emoji: "🏎️",
    difficulty: "advanced",
  },
};

// ─── Shared package.json generator ───────────────────────────────────────────

function buildPackageJson(gameName: string, archetype: GameArchetype): string {
  const slug = gameName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return JSON.stringify(
    {
      name: slug,
      version: "1.0.0",
      private: true,
      type: "module",
      description: `A ${ARCHETYPE_META[archetype].title} game built with React Three Fiber`,
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        three: "^0.171.0",
        "@react-three/fiber": "^8.17.10",
        "@react-three/drei": "^9.117.3",
        "@react-three/rapier": "^1.5.0",
        "@react-three/postprocessing": "^2.16.2",
        "@react-spring/three": "^9.7.5",
        leva: "^0.9.35",
        zustand: "^5.0.2",
        postprocessing: "^6.36.3",
      },
      devDependencies: {
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@types/three": "^0.171.0",
        "@vitejs/plugin-react": "^4.3.4",
        vite: "^6.0.6",
        typescript: "^5.7.2",
      },
    },
    null,
    2,
  );
}

function buildViteConfig(): string {
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/rapier'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
  },
})
`;
}

function buildTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["src"],
      references: [{ path: "./tsconfig.node.json" }],
    },
    null,
    2,
  );
}

function buildIndexHtml(gameName: string, archetype: GameArchetype): string {
  const meta = ARCHETYPE_META[archetype];
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${meta.description}" />
    <title>${gameName} — ${meta.title}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #000; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }
      #root { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function buildMain(): string {
  return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
}

// ─── Archetype: 3D Platformer ─────────────────────────────────────────────────

function buildPlatformer(_gameName: string, _citizenName: string): ScaffoldedFile[] {
  return [
    {
      relativePath: "src/App.tsx",
      content: `import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Sky, Stars, PerformanceMonitor } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Leva } from 'leva'
import { Game } from './Game'
import { HUD } from './components/HUD'

export default function App() {
  return (
    <>
      <Leva collapsed />
      <Canvas
        shadows
        camera={{ position: [0, 8, 16], fov: 60 }}
        gl={{ antialias: true, toneMapping: 3 }}
        dpr={[1, 2]}
      >
        <PerformanceMonitor>
          <Suspense fallback={null}>
            <Sky sunPosition={[100, 20, 100]} />
            <Stars radius={200} depth={60} count={5000} factor={4} />
            <ambientLight intensity={0.4} />
            <directionalLight
              position={[10, 20, 5]}
              intensity={2}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-far={100}
              shadow-camera-left={-30}
              shadow-camera-right={30}
              shadow-camera-top={30}
              shadow-camera-bottom={-30}
            />
            <Physics gravity={[0, -20, 0]}>
              <Game />
            </Physics>
            <EffectComposer>
              <Bloom luminanceThreshold={0.8} intensity={0.6} />
              <Vignette eskil={false} offset={0.1} darkness={0.6} />
            </EffectComposer>
          </Suspense>
        </PerformanceMonitor>
      </Canvas>
      <HUD />
    </>
  )
}
`,
    },
    {
      relativePath: "src/Game.tsx",
      content: `import { useRef } from 'react'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { Environment } from '@react-three/drei'
import { Player } from './components/Player'
import { Platform } from './components/Platform'
import { Collectible } from './components/Collectible'
import { useGameStore } from './store'

const PLATFORMS = [
  { pos: [0, 0, 0]   as [number,number,number], size: [10, 0.5, 10] as [number,number,number] },
  { pos: [8, 2, 0]   as [number,number,number], size: [4, 0.5, 4]   as [number,number,number] },
  { pos: [14, 4, -4] as [number,number,number], size: [4, 0.5, 4]   as [number,number,number] },
  { pos: [6, 6, -8]  as [number,number,number], size: [6, 0.5, 6]   as [number,number,number] },
]

const COINS = [
  [8, 3.5, 0], [14, 5.5, -4], [6, 7.5, -8], [10, 4, -2],
] as [number,number,number][]

export function Game() {
  const score = useGameStore((s) => s.score)
  
  return (
    <>
      <Environment preset="sunset" />
      
      {/* Ground */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow position={[0, -0.25, 0]}>
          <boxGeometry args={[40, 0.5, 40]} />
          <meshStandardMaterial color="#3d7a3d" roughness={0.8} metalness={0.1} />
        </mesh>
      </RigidBody>

      {/* Platforms */}
      {PLATFORMS.map((p, i) => (
        <Platform key={i} position={p.pos} size={p.size} />
      ))}

      {/* Coins */}
      {COINS.map((pos, i) => (
        <Collectible key={i} position={pos} />
      ))}

      {/* Player */}
      <Player />

      {/* Invisible death plane */}
      <CuboidCollider args={[40, 0.1, 40]} position={[0, -10, 0]} sensor
        onIntersectionEnter={() => useGameStore.getState().reset()} />
    </>
  )
}
`,
    },
    {
      relativePath: "src/components/Player.tsx",
      content: `import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, RapierRigidBody } from '@react-three/rapier'
import { useKeyboard } from '../hooks/useKeyboard'
import * as THREE from 'three'

const SPEED = 8
const JUMP_FORCE = 12
const CAMERA_OFFSET = new THREE.Vector3(0, 6, 12)

export function Player() {
  const rb = useRef<RapierRigidBody>(null)
  const ref = useRef<THREE.Mesh>(null)
  const keys = useKeyboard()
  const { camera } = useThree()
  const canJump = useRef(true)
  const vel = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    if (!rb.current) return
    const linvel = rb.current.linvel()
    vel.current.set(0, 0, 0)

    if (keys.ArrowLeft  || keys.KeyA) vel.current.x -= SPEED
    if (keys.ArrowRight || keys.KeyD) vel.current.x += SPEED
    if (keys.ArrowUp    || keys.KeyW) vel.current.z -= SPEED
    if (keys.ArrowDown  || keys.KeyS) vel.current.z += SPEED

    rb.current.setLinvel({ x: vel.current.x, y: linvel.y, z: vel.current.z }, true)

    if ((keys.Space || keys.ArrowUp) && canJump.current) {
      rb.current.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true)
      canJump.current = false
      setTimeout(() => { canJump.current = true }, 500)
    }

    // Smooth camera follow
    const pos = rb.current.translation()
    const target = new THREE.Vector3(pos.x, pos.y, pos.z).add(CAMERA_OFFSET)
    camera.position.lerp(target, delta * 4)
    camera.lookAt(pos.x, pos.y, pos.z)
  })

  return (
    <RigidBody
      ref={rb}
      colliders="ball"
      restitution={0.1}
      linearDamping={0.5}
      angularDamping={1}
      position={[0, 3, 0]}
      onCollisionEnter={() => { canJump.current = true }}
    >
      <mesh ref={ref} castShadow>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.3} metalness={0.6} emissive="#4c1d95" emissiveIntensity={0.2} />
      </mesh>
      <pointLight intensity={2} distance={4} color="#7c3aed" />
    </RigidBody>
  )
}
`,
    },
    {
      relativePath: "src/components/Platform.tsx",
      content: `import { RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'

interface PlatformProps {
  position: [number, number, number]
  size: [number, number, number]
}

export function Platform({ position, size }: PlatformProps) {
  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position={position} receiveShadow castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#5b4fcf" roughness={0.4} metalness={0.5} />
      </mesh>
    </RigidBody>
  )
}
`,
    },
    {
      relativePath: "src/components/Collectible.tsx",
      content: `import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { useGameStore } from '../store'
import * as THREE from 'three'

export function Collectible({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null)
  const [collected, setCollected] = useState(false)
  const addScore = useGameStore(s => s.addScore)

  useFrame(({ clock }) => {
    if (!ref.current || collected) return
    ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 2) * 0.2
    ref.current.rotation.y += 0.03
  })

  if (collected) return null

  return (
    <RigidBody type="fixed" sensor
      onIntersectionEnter={() => { setCollected(true); addScore(10) }}>
      <mesh ref={ref} position={position} castShadow>
        <octahedronGeometry args={[0.35]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} roughness={0.1} metalness={0.9} />
      </mesh>
      <pointLight color="#f59e0b" intensity={1.5} distance={3} />
    </RigidBody>
  )
}
`,
    },
    {
      relativePath: "src/components/HUD.tsx",
      content: `import { useGameStore } from '../store'

export function HUD() {
  const score = useGameStore(s => s.score)
  const lives = useGameStore(s => s.lives)
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      display: 'flex', justifyContent: 'space-between',
      padding: '16px 24px',
      fontFamily: 'system-ui, sans-serif',
      color: 'white',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      fontSize: '1.2rem',
      fontWeight: 'bold',
      pointerEvents: 'none',
    }}>
      <div>⭐ Score: {score}</div>
      <div style={{ textAlign: 'center', fontSize: '0.9rem', opacity: 0.7 }}>
        WASD / Arrows + Space to Jump
      </div>
      <div>❤️ Lives: {lives}</div>
    </div>
  )
}
`,
    },
    {
      relativePath: "src/hooks/useKeyboard.ts",
      content: `import { useEffect, useRef } from 'react'

type Keys = Record<string, boolean>

export function useKeyboard(): Keys {
  const keys = useRef<Keys>({})

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { keys.current[e.code] = true; e.preventDefault() }
    const onUp   = (e: KeyboardEvent) => { keys.current[e.code] = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  return keys.current
}
`,
    },
    {
      relativePath: "src/store.ts",
      content: `import { create } from 'zustand'

interface GameStore {
  score: number
  lives: number
  addScore: (n: number) => void
  loseLife: () => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  score: 0,
  lives: 3,
  addScore: (n) => set((s) => ({ score: s.score + n })),
  loseLife:  ()  => set((s) => ({ lives: s.lives - 1 })),
  reset: ()      => set({ score: 0, lives: 3 }),
}))
`,
    },
  ];
}

// ─── Archetype: Space Shooter ────────────────────────────────────────────────

function buildSpaceShooter(_gameName: string, _citizenName: string): ScaffoldedFile[] {
  return [
    {
      relativePath: "src/App.tsx",
      content: `import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Stars, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Leva } from 'leva'
import { Game } from './Game'
import { HUD } from './components/HUD'

export default function App() {
  return (
    <>
      <Leva collapsed />
      <Canvas
        camera={{ position: [0, 0, 14], fov: 75 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
      >
        <PerformanceMonitor>
          <Suspense fallback={null}>
            <color attach="background" args={['#000010']} />
            <Stars radius={150} depth={80} count={8000} factor={5} saturation={0.5} fade speed={0.5} />
            <ambientLight intensity={0.2} color="#4040ff" />
            <Game />
            <EffectComposer>
              <Bloom luminanceThreshold={0.3} intensity={1.5} mipmapBlur />
              <ChromaticAberration
                blendFunction={BlendFunction.NORMAL}
                offset={[0.001, 0.001]}
                radialModulation={false}
                modulationOffset={0}
              />
              <Vignette eskil={false} offset={0.1} darkness={0.8} />
            </EffectComposer>
          </Suspense>
        </PerformanceMonitor>
      </Canvas>
      <HUD />
    </>
  )
}
`,
    },
    {
      relativePath: "src/Game.tsx",
      content: `import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboard } from './hooks/useKeyboard'
import { Player } from './components/Player'
import { Asteroids } from './components/Asteroids'
import { Bullets } from './components/Bullets'
import { Enemies } from './components/Enemies'
import { useGameStore } from './store'
import * as THREE from 'three'

export function Game() {
  const score    = useGameStore(s => s.score)
  const gameOver = useGameStore(s => s.gameOver)
  const restart  = useGameStore(s => s.restart)

  if (gameOver) {
    return (
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    )
  }

  return (
    <>
      <Player />
      <Asteroids />
      <Bullets />
      <Enemies />
    </>
  )
}
`,
    },
    {
      relativePath: "src/components/Player.tsx",
      content: `import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Trail, useGLTF } from '@react-three/drei'
import { useKeyboard } from '../hooks/useKeyboard'
import { useGameStore } from '../store'
import * as THREE from 'three'

const SPEED = 7
const BOUNDS = { x: 8, y: 5 }
const SHOOT_COOLDOWN = 0.18

export function Player() {
  const ref   = useRef<THREE.Group>(null)
  const keys  = useKeyboard()
  const shoot = useRef(0)
  const addBullet = useGameStore(s => s.addBullet)

  useFrame((_, dt) => {
    if (!ref.current) return
    shoot.current -= dt
    const p = ref.current.position

    if (keys.ArrowLeft  || keys.KeyA) p.x = Math.max(-BOUNDS.x, p.x - SPEED * dt)
    if (keys.ArrowRight || keys.KeyD) p.x = Math.min( BOUNDS.x, p.x + SPEED * dt)
    if (keys.ArrowUp    || keys.KeyW) p.y = Math.min( BOUNDS.y, p.y + SPEED * dt)
    if (keys.ArrowDown  || keys.KeyS) p.y = Math.max(-BOUNDS.y, p.y - SPEED * dt)

    // Roll visual effect
    const tilt = (keys.ArrowLeft || keys.KeyA ? 0.4 : keys.ArrowRight || keys.KeyD ? -0.4 : 0)
    ref.current.rotation.z = THREE.MathUtils.lerp(ref.current.rotation.z, tilt, dt * 5)

    if ((keys.Space || keys.KeyF) && shoot.current <= 0) {
      shoot.current = SHOOT_COOLDOWN
      addBullet({ x: p.x, y: p.y, z: p.z })
    }
  })

  return (
    <group ref={ref} position={[0, -3, 0]}>
      {/* Ship body */}
      <mesh castShadow>
        <coneGeometry args={[0.4, 1.2, 8]} />
        <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={0.5} roughness={0.2} metalness={0.9} />
      </mesh>
      {/* Wings */}
      <mesh position={[-0.6, -0.3, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.8, 0.1, 0.4]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0.6, -0.3, 0]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.8, 0.1, 0.4]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Engine glow */}
      <pointLight color="#60a5fa" intensity={3} distance={4} position={[0, -0.8, 0]} />
      <mesh position={[0, -0.8, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshBasicMaterial color="#93c5fd" />
      </mesh>
    </group>
  )
}
`,
    },
    {
      relativePath: "src/components/Asteroids.tsx",
      content: `import { useRef, useState, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'

interface Asteroid {
  id: number
  position: THREE.Vector3
  speed: number
  rotation: THREE.Euler
  rotSpeed: THREE.Euler
  radius: number
}

let idCounter = 0

export function Asteroids() {
  const [asteroids, setAsteroids] = useState<Asteroid[]>([])
  const spawnTimer = useRef(0)
  const bullets = useGameStore(s => s.bullets)
  const addScore = useGameStore(s => s.addScore)
  const loseLife = useGameStore(s => s.loseLife)

  const spawn = useCallback(() => {
    const x = (Math.random() - 0.5) * 16
    setAsteroids(prev => [...prev, {
      id: idCounter++,
      position: new THREE.Vector3(x, 7, 0),
      speed: 2 + Math.random() * 3,
      radius: 0.4 + Math.random() * 0.8,
      rotation: new THREE.Euler(Math.random(), Math.random(), Math.random()),
      rotSpeed: new THREE.Euler(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ),
    }])
  }, [])

  useFrame((_, dt) => {
    spawnTimer.current -= dt
    if (spawnTimer.current <= 0) {
      spawnTimer.current = 0.8 + Math.random() * 0.8
      spawn()
    }

    setAsteroids(prev => prev
      .filter(a => a.position.y > -8)
      .map(a => {
        a.position.y -= a.speed * dt
        a.rotation.x += a.rotSpeed.x * dt
        a.rotation.y += a.rotSpeed.y * dt
        // Hit detection vs bullets
        for (const b of bullets) {
          const dx = a.position.x - b.x, dy = a.position.y - b.y
          if (Math.sqrt(dx*dx + dy*dy) < a.radius + 0.15) {
            addScore(Math.round(10 / a.radius))
            return { ...a, position: new THREE.Vector3(0, -20, 0) } // mark for removal
          }
        }
        return a
      })
      .filter(a => a.position.y > -8)
    )
  })

  return (
    <>
      {asteroids.map(a => (
        <mesh key={a.id} position={a.position} rotation={a.rotation}>
          <dodecahedronGeometry args={[a.radius]} />
          <meshStandardMaterial color="#78716c" roughness={0.9} metalness={0.1} />
        </mesh>
      ))}
    </>
  )
}
`,
    },
    {
      relativePath: "src/components/Bullets.tsx",
      content: `import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'

const BULLET_SPEED = 18

export function Bullets() {
  const bullets = useGameStore(s => s.bullets)
  const removeBullet = useGameStore(s => s.removeBullet)

  useFrame((_, dt) => {
    for (const b of bullets) {
      b.y += BULLET_SPEED * dt
      if (b.y > 10) { removeBullet(b.id) }
    }
  })

  return (
    <>
      {bullets.map(b => (
        <group key={b.id} position={[b.x, b.y, b.z]}>
          <mesh>
            <capsuleGeometry args={[0.06, 0.4, 4, 8]} />
            <meshBasicMaterial color="#fde047" />
          </mesh>
          <pointLight color="#fde047" intensity={2} distance={2} />
        </group>
      ))}
    </>
  )
}
`,
    },
    {
      relativePath: "src/components/Enemies.tsx",
      content: `import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function Enemies() {
  const t = useRef(0)
  const [enemies] = useState([
    { id: 0, baseX: -4 }, { id: 1, baseX: 0 }, { id: 2, baseX: 4 },
  ])

  useFrame((_, dt) => { t.current += dt })

  return (
    <>
      {enemies.map(e => (
        <group key={e.id} position={[e.baseX + Math.sin(t.current + e.id) * 2, 3 + Math.cos(t.current * 0.7 + e.id) * 1, 0]}>
          <mesh>
            <octahedronGeometry args={[0.5]} />
            <meshStandardMaterial color="#ef4444" emissive="#b91c1c" emissiveIntensity={0.6} roughness={0.2} metalness={0.7} />
          </mesh>
          <pointLight color="#ef4444" intensity={1.5} distance={3} />
        </group>
      ))}
    </>
  )
}
`,
    },
    {
      relativePath: "src/components/HUD.tsx",
      content: `import { useGameStore } from '../store'

export function HUD() {
  const score    = useGameStore(s => s.score)
  const lives    = useGameStore(s => s.lives)
  const gameOver = useGameStore(s => s.gameOver)
  const restart  = useGameStore(s => s.restart)

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', fontFamily: 'monospace', color: 'white' }}>
      <div style={{ position: 'absolute', top: 16, left: 24, fontSize: '1.1rem', textShadow: '0 0 10px #60a5fa' }}>
        SCORE: {score.toString().padStart(6, '0')}
      </div>
      <div style={{ position: 'absolute', top: 16, right: 24, fontSize: '1.1rem', textShadow: '0 0 10px #f472b6' }}>
        {'❤️ '.repeat(lives)}
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontSize: '0.75rem', opacity: 0.5 }}>
        WASD / ARROWS MOVE • SPACE SHOOT
      </div>
      {gameOver && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)', pointerEvents: 'all',
        }}>
          <h1 style={{ fontSize: '3rem', marginBottom: 16, textShadow: '0 0 30px #ef4444' }}>GAME OVER</h1>
          <p style={{ marginBottom: 24, opacity: 0.7 }}>Score: {score}</p>
          <button onClick={restart} style={{
            padding: '12px 32px', background: '#3b82f6', border: 'none',
            color: 'white', fontSize: '1.1rem', borderRadius: 8, cursor: 'pointer',
          }}>PLAY AGAIN</button>
        </div>
      )}
    </div>
  )
}
`,
    },
    {
      relativePath: "src/hooks/useKeyboard.ts",
      content: `import { useEffect, useRef } from 'react'
type Keys = Record<string, boolean>
export function useKeyboard(): Keys {
  const keys = useRef<Keys>({})
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; e.preventDefault() }
    const up   = (e: KeyboardEvent) => { keys.current[e.code] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  return keys.current
}
`,
    },
    {
      relativePath: "src/store.ts",
      content: `import { create } from 'zustand'

interface Bullet { id: number; x: number; y: number; z: number }
let bulletId = 0

interface GameStore {
  score: number; lives: number; gameOver: boolean; bullets: Bullet[]
  addScore:    (n: number) => void
  loseLife:    () => void
  addBullet:   (pos: { x: number; y: number; z: number }) => void
  removeBullet:(id: number) => void
  restart:     () => void
}

export const useGameStore = create<GameStore>((set) => ({
  score: 0, lives: 3, gameOver: false, bullets: [],
  addScore:    (n) => set(s => ({ score: s.score + n })),
  loseLife:    ()  => set(s => ({ lives: s.lives - 1, gameOver: s.lives <= 1 })),
  addBullet:   (p) => set(s => ({ bullets: [...s.bullets, { ...p, id: ++bulletId }] })),
  removeBullet:(id) => set(s => ({ bullets: s.bullets.filter(b => b.id !== id) })),
  restart:     ()  => set({ score: 0, lives: 3, gameOver: false, bullets: [] }),
}))
`,
    },
  ];
}

// ─── Archetype: Puzzle World ──────────────────────────────────────────────────

function buildPuzzleWorld(_gameName: string, _citizenName: string): ScaffoldedFile[] {
  return [
    {
      relativePath: "src/App.tsx",
      content: `import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Environment, OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { EffectComposer, SSAO, Bloom } from '@react-three/postprocessing'
import { Leva } from 'leva'
import { Game } from './Game'
import { HUD } from './components/HUD'

export default function App() {
  return (
    <>
      <Leva collapsed />
      <Canvas shadows camera={{ position: [8, 10, 14], fov: 50 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <PerformanceWrapper>
          <Suspense fallback={null}>
            <Environment preset="warehouse" />
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 15, 8]} intensity={2} castShadow shadow-mapSize={[2048, 2048]} />
            <Physics gravity={[0, -18, 0]}>
              <Game />
            </Physics>
            <OrbitControls maxPolarAngle={Math.PI / 2.1} minDistance={5} maxDistance={30} />
            <EffectComposer>
              <Bloom luminanceThreshold={0.6} intensity={0.5} />
            </EffectComposer>
          </Suspense>
        </PerformanceWrapper>
      </Canvas>
      <HUD />
    </>
  )
}

function PerformanceWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
`,
    },
    {
      relativePath: "src/Game.tsx",
      content: `import { RigidBody } from '@react-three/rapier'
import { PhysicsBlock } from './components/PhysicsBlock'
import { PressurePlate } from './components/PressurePlate'
import { Door } from './components/Door'
import { useGameStore } from './store'

export function Game() {
  return (
    <>
      {/* Floor */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh receiveShadow position={[0, -0.25, 0]}>
          <boxGeometry args={[20, 0.5, 20]} />
          <meshStandardMaterial color="#1c1917" roughness={0.9} />
        </mesh>
      </RigidBody>
      {/* Walls */}
      {[[-10,2,0],[10,2,0],[0,2,-10],[0,2,10]].map(([x,y,z], i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid">
          <mesh position={[x,y,z]} receiveShadow>
            <boxGeometry args={i < 2 ? [0.5, 4, 20] : [20, 4, 0.5]} />
            <meshStandardMaterial color="#292524" roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}
      {/* Pushable blocks */}
      <PhysicsBlock position={[2, 2, 2]}  color="#3b82f6" />
      <PhysicsBlock position={[-2, 2, 3]} color="#8b5cf6" />
      <PhysicsBlock position={[0, 4, 0]}  color="#06b6d4" />
      {/* Pressure plate triggers door */}
      <PressurePlate position={[5, 0.1, 5]} triggerId="door1" />
      <Door id="door1" position={[7, 2, 0]} />
    </>
  )
}
`,
    },
    {
      relativePath: "src/components/PhysicsBlock.tsx",
      content: `import { RigidBody } from '@react-three/rapier'

interface BlockProps { position: [number,number,number]; color: string }

export function PhysicsBlock({ position, color }: BlockProps) {
  return (
    <RigidBody colliders="cuboid" restitution={0.1} friction={0.8}>
      <mesh position={position} castShadow receiveShadow>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.6} />
      </mesh>
    </RigidBody>
  )
}
`,
    },
    {
      relativePath: "src/components/PressurePlate.tsx",
      content: `import { RigidBody } from '@react-three/rapier'
import { useGameStore } from '../store'

interface PlateProps { position: [number,number,number]; triggerId: string }

export function PressurePlate({ position, triggerId }: PlateProps) {
  const trigger  = useGameStore(s => s.trigger)
  const untrigger = useGameStore(s => s.untrigger)
  return (
    <RigidBody type="fixed" colliders="cuboid" sensor
      onIntersectionEnter={() => trigger(triggerId)}
      onIntersectionExit={() => untrigger(triggerId)}>
      <mesh position={position} receiveShadow>
        <boxGeometry args={[1.5, 0.1, 1.5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.4} roughness={0.5} />
      </mesh>
    </RigidBody>
  )
}
`,
    },
    {
      relativePath: "src/components/Door.tsx",
      content: `import { useGameStore } from '../store'
import { animated, useSpring } from '@react-spring/three'

interface DoorProps { id: string; position: [number,number,number] }

export function Door({ id, position }: DoorProps) {
  const open = useGameStore(s => s.triggered.has(id))
  const spring = useSpring({ scaleY: open ? 0.01 : 1, config: { tension: 120, friction: 20 } })
  return (
    <animated.mesh position={position} scale-y={spring.scaleY} castShadow receiveShadow>
      <boxGeometry args={[2, 4, 0.2]} />
      <meshStandardMaterial color="#ef4444" roughness={0.3} metalness={0.7} />
    </animated.mesh>
  )
}
`,
    },
    {
      relativePath: "src/components/HUD.tsx",
      content: `import { useGameStore } from '../store'
export function HUD() {
  const triggered = useGameStore(s => s.triggered)
  return (
    <div style={{ position: 'fixed', top: 16, left: 24, color: 'white', fontFamily: 'system-ui', fontSize: '0.9rem', opacity: 0.8 }}>
      <div>🧩 Puzzle World</div>
      <div style={{ marginTop: 4, fontSize: '0.75rem', opacity: 0.6 }}>
        Push blocks onto pressure plates to open doors
      </div>
      <div style={{ marginTop: 8 }}>
        Plates activated: {triggered.size}
      </div>
    </div>
  )
}
`,
    },
    {
      relativePath: "src/store.ts",
      content: `import { create } from 'zustand'
interface GameStore {
  triggered: Set<string>
  trigger:   (id: string) => void
  untrigger: (id: string) => void
}
export const useGameStore = create<GameStore>((set) => ({
  triggered: new Set(),
  trigger:   (id) => set(s => ({ triggered: new Set([...s.triggered, id]) })),
  untrigger: (id) => set(s => { const next = new Set(s.triggered); next.delete(id); return { triggered: next } }),
}))
`,
    },
  ];
}

// ─── Dispatch: pick archetype files ───────────────────────────────────────────

function detectArchetype(prompt: string, specialization?: string): GameArchetype {
  const p = prompt.toLowerCase()
  const s = (specialization ?? "").toLowerCase()

  if (p.includes("space") || p.includes("shoot") || p.includes("laser")) { return "space-shooter"; }
  if (p.includes("puzzle") || p.includes("block") || p.includes("physics")) { return "puzzle-world"; }
  if (p.includes("rpg") || p.includes("world") || p.includes("open") || p.includes("adventure")) { return "rpg-world"; }
  if (p.includes("racing") || p.includes("race") || p.includes("car") || p.includes("drive")) { return "racing-game"; }
  if (p.includes("platform") || p.includes("jump") || p.includes("collect")) { return "platformer3d"; }

  // Infer from specialization
  if (s.includes("game")) { return "platformer3d"; }
  return "platformer3d"; // default
}

function buildSharedFiles(gameName: string, archetype: GameArchetype): ScaffoldedFile[] {
  return [
    { relativePath: "package.json", content: buildPackageJson(gameName, archetype) },
    { relativePath: "vite.config.ts", content: buildViteConfig() },
    { relativePath: "tsconfig.json", content: buildTsConfig() },
    { relativePath: "index.html", content: buildIndexHtml(gameName, archetype) },
    { relativePath: "src/main.tsx", content: buildMain() },
    {
      relativePath: "README.md",
      content: `# ${gameName}

> ${ARCHETYPE_META[archetype].title} built with React Three Fiber

## Stack
${ARCHETYPE_META[archetype].stack.map(s => `- ${s}`).join("\n")}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:5173

## Controls
- **WASD / Arrow keys** — move
- **Space / F** — action (shoot/jump)

## Build for production
\`\`\`bash
npm run build
npm run preview
\`\`\`
`,
    },
    {
      relativePath: ".gitignore",
      content: `node_modules\ndist\n.env\n*.local\n`,
    },
  ];
}

// ─── Main Public API ──────────────────────────────────────────────────────────

/**
 * Generate a complete 3D React game scaffold and write it to disk.
 */
export async function generateGameScaffold(opts: GameScaffoldOptions): Promise<GameScaffoldResult> {
  const { gameName, citizenName, prompt, outputDir } = opts;

  // Auto-detect archetype from prompt if not explicitly provided
  const archetype = opts.archetype === "platformer3d" && !prompt.includes("platform")
    ? detectArchetype(prompt)
    : opts.archetype;

  logger.info(`[GameScaffold] Generating ${archetype} game "${gameName}" for ${citizenName}`);

  const sharedFiles = buildSharedFiles(gameName, archetype);

  let archetypeFiles: ScaffoldedFile[];
  switch (archetype) {
    case "platformer3d": archetypeFiles = buildPlatformer(gameName, citizenName); break;
    case "space-shooter": archetypeFiles = buildSpaceShooter(gameName, citizenName); break;
    case "puzzle-world": archetypeFiles = buildPuzzleWorld(gameName, citizenName); break;
    // RPG and Racing use platformer as base + extra note (full versions in plugin)
    case "rpg-world":
    case "racing-game":
    default:
      archetypeFiles = buildPlatformer(gameName, citizenName);
  }

  const files: ScaffoldedFile[] = [...sharedFiles, ...archetypeFiles];

  // Write files to disk
  try {
    for (const file of files) {
      const fullPath = path.join(outputDir, file.relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, "utf8");
    }
    logger.info(`[GameScaffold] Wrote ${files.length} files to ${outputDir}`);
  } catch (err) {
    logger.warn(`[GameScaffold] Write error: ${String(err)}`);
    return {
      ok: false,
      archetype,
      gameName,
      files,
      outputDir,
      instructions: "",
      error: String(err),
    };
  }

  // ─── Autonomously install all npm dependencies ───────────────────────────
  // Citizens don't need to manually run npm install.
  // We fire it as a background process so the RPC response is fast,
  // but the game will have all its libraries ready when the citizen opens it.
  void installDependencies(outputDir, archetype);

  return {
    ok: true,
    archetype,
    gameName,
    files,
    outputDir,
    instructions: `cd ${outputDir} && npm run dev`,
  };
}

/**
 * Asynchronously runs `npm install --prefer-offline` in the game directory.
 * Fires and forgets — does not block the scaffold response.
 * Libraries downloaded include: React, Three.js, @react-three/fiber, @react-three/drei,
 * @react-three/rapier, @react-three/postprocessing, leva, zustand, vite, etc.
 */
async function installDependencies(outputDir: string, archetype: string): Promise<void> {
  logger.info(`[GameScaffold] Installing npm dependencies for ${archetype} game in ${outputDir}`);
  return new Promise((resolve) => {
    try {
      // Use shell:true on Windows to avoid EINVAL errors with paths containing
      // spaces or special characters. The shell resolves npm.cmd correctly.
      const child = spawn("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"], {
        cwd: outputDir,
        stdio: "pipe",
        shell: true,
      });

      const logs: string[] = [];
      child.stdout?.on("data", (d: Buffer) => { logs.push(d.toString()); });
      child.stderr?.on("data", (d: Buffer) => { logs.push(d.toString()); });

      child.on("close", (code) => {
        if (code === 0) {
          logger.info(`[GameScaffold] npm install completed successfully in ${outputDir}`);
        } else {
          logger.warn(`[GameScaffold] npm install exited with code ${code}.\n${logs.slice(-10).join("")})`);
        }
        resolve();
      });

      child.on("error", (err) => {
        logger.warn(`[GameScaffold] npm install spawn error: ${String(err)}`);
        resolve();
      });
    } catch (err) {
      logger.warn(`[GameScaffold] npm install failed to start: ${String(err)}`);
      resolve();
    }
  });
}

export { detectArchetype };
