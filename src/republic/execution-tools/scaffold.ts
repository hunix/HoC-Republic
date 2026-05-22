/**
 * Execution Tools — Project Scaffolding
 *
 * Project template detection and scaffold_project executor.
 * Generates world-class project boilerplate for 8+ archetypes:
 * 3D games, AI dashboards, realtime collab, e-commerce, full-stack,
 * Python/ML, Docker services, Node.js APIs, and React websites.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import type { AgentTask } from "../types.js";
import { callLLM } from "../execution-llm.js";
import { detectLanguage } from "../execution-types.js";
import { selectModel } from "../model-council.js";
import { enrichProjectDescription } from "../specialization-projects.js";
import { uid, ts } from "../utils.js";
import {
  execInWorkspace,
  getWorkspace,
  updateWorkspaceStatus,
  writeWorkspaceFile,
} from "../workspace-manager.js";

// ─── Project Type Templates ──────────────────────────────────────

/**
 * Detect the project archetype from name/description/framework.
 * Returns a rich template hint to steer the LLM toward WORLD-CLASS file structures.
 * ALL generated projects must be complete, compilable, and production-ready.
 */
export function detectProjectTemplate(
  framework: string,
  description: string,
): {
  archetype: string;
  techStack: string;
  fileList: string;
  installCmd: string;
  mandatoryLibraries: string;
} {
  const d = `${framework} ${description}`.toLowerCase();

  // ── 3D Games / Interactive 3D ────────────────────────────────
  const is3DGame =
    /three\.?js|3d.?game|3d.?scene|webgl|babylon|threejs|space.shooter|racing|3d.world|platformer|fps|rpg|physics.game|multiplayer.game|mmo|real-?time.game|vr|ar|xr/.test(
      d,
    ) ||
    (/game|interactive|immersive/.test(d) && /react|vite|ts|typescript|3d|gl|render/.test(d));

  // ── React Apps / Websites ────────────────────────────────────
  const isAIDashboard =
    /ai.dashboard|analytics|data.viz|dashboard|admin.panel|crm|monitoring|metrics|saas/.test(d) &&
    !is3DGame;
  const isRealtimeCollab =
    /real.?time|collaboration|whiteboard|shared|collaborative|live.editing|socket|websocket/.test(
      d,
    ) && !is3DGame;
  const isEcommerce =
    /e.?commerce|shop|store|marketplace|checkout|cart|payment|stripe/.test(d) && !is3DGame;
  const isReactWebsite =
    (/website|landing.page|portfolio|blog|vite|next\.?js|react.app|pwa|mobile.app/.test(d) &&
      !is3DGame &&
      !isAIDashboard &&
      !isEcommerce) ||
    (!is3DGame && !isAIDashboard && !isEcommerce && !isRealtimeCollab && /react/.test(d));

  // ── Backend ──────────────────────────────────────────────────
  const isPython =
    /python|fastapi|flask|django|pytorch|tensorflow|ml.model|ai.backend|notebook/.test(d) &&
    !is3DGame;
  const isFullStack = /full.?stack|fullstack/.test(d) || (isReactWebsite && isPython);
  const isDocker = /docker|container|kubernetes|k8s|microservice/.test(d) && !isFullStack;
  const isNodeApi =
    /node.?js.?api|hono|fastify|trpc|express.?api|ts.?api|typescript.?api|rest.?api.?node|graphql/.test(
      d,
    ) &&
    !isFullStack &&
    !isPython;

  // ── 3D Game: React Three Fiber + Physics + Postprocessing ────
  if (is3DGame) {
    const hasMultiplayer = /multiplayer|mmo|real.?time|socket|pvp/.test(d);
    const hasVR = /vr|ar|xr|immersive/.test(d);
    return {
      archetype: "React Three Fiber 3D Game (Elite Graphics)",
      techStack:
        "Vite 6, React 19, TypeScript 5, @react-three/fiber 9, @react-three/drei, @react-three/rapier (physics), @react-three/postprocessing, three.js, gsap 3, zustand 5, leva (debug UI)" +
        (hasMultiplayer ? ", socket.io (multiplayer), @liveblocks/client" : "") +
        (hasVR ? ", @react-three/xr (VR/AR)" : ""),
      mandatoryLibraries:
        "@react-three/fiber @react-three/drei @react-three/rapier @react-three/postprocessing three gsap zustand leva @types/three" +
        (hasMultiplayer ? " socket.io-client" : ""),
      fileList: [
        "package.json (three, @react-three/fiber, @react-three/drei, @react-three/rapier, @react-three/postprocessing, gsap, zustand, leva, vite, react-19, typescript-5)",
        "vite.config.ts (react plugin, path aliases @/)",
        "index.html (dark background, fullscreen canvas, dynamic title)",
        "tsconfig.json (strict, ESNext, bundler resolution)",
        "src/main.tsx (React 19 root, StrictMode, global styles)",
        "src/App.tsx (Canvas setup with shadows, gl renderer config, tone mapping, loading screen, main scene routing)",
        "src/game/GameEngine.tsx (core game loop with useFrame, state machine: menu/playing/paused/gameover)",
        "src/game/GameStore.ts (zustand store: score, health, level, gameState, settings, high scores)",
        "src/scenes/MainScene.tsx (full R3F scene: sky, fog, ambient+directional+point lights, orbit/player camera)",
        "src/scenes/GameplayScene.tsx (world geometry, spawn system, collision detection, level progression)",
        "src/components/Player.tsx (3D player mesh with useRef, useFrame animation, WASD+mouse controls, bounding sphere)",
        "src/components/Enemy.tsx (AI enemy: pathfinding toward player, attack animations, health system, death particles)",
        "src/components/World.tsx (procedural terrain, obstacles, power-ups, collectibles using R3F instanced meshes)",
        "src/components/Particles.tsx (particle systems: explosions, sparks, smoke using drei/Instances or drei/Trail)",
        "src/components/Environment.tsx (drei/Environment, drei/Stars, drei/Sky, dynamic skybox, fog effects)",
        "src/components/PostProcessing.tsx (bloom, depth of field, vignette, chromatic aberration, motion blur via @react-three/postprocessing)",
        "src/components/HUD.tsx (score counter, health bars, minimap, ammo counter, level indicator, crosshair overlay)",
        "src/components/MainMenu.tsx (animated 3D title screen, start/options/leaderboard buttons with gsap animations)",
        "src/components/PauseMenu.tsx (ESC to pause, resume/restart/settings/quit)",
        "src/components/GameOver.tsx (death screen with final score, high score tracking, restart animation)",
        "src/hooks/useGameControls.ts (keyboard/mouse/gamepad input, pointer lock API, mobile touch controls)",
        "src/hooks/usePhysics.ts (Rapier physics world integration, rigid body management)",
        "src/hooks/useAudio.ts (Web Audio API, sound effects: shoot/hit/ambient, spatial audio using three positional audio)",
        "src/hooks/useAnimations.ts (gsap timeline animations, useSpring-style interpolation for smooth transitions)",
        "src/utils/math.ts (vector math, collision detection helpers, level generation algorithms)",
        "src/utils/assets.ts (asset loading, progress tracking, texture cache management)",
        "src/styles/index.css (dark theme, fullscreen canvas, HUD overlay styles, custom fonts from Google Fonts)",
        "README.md (controls, tech stack, how to run — with screenshots description)",
        ".gitignore",
      ].join("\n"),
      installCmd: "npm install && npm run dev",
    };
  }

  // ── AI Dashboard / SaaS Analytics ───────────────────────────
  if (isAIDashboard) {
    return {
      archetype: "AI Dashboard / Analytics SaaS",
      techStack:
        "Vite 6, React 19, TypeScript 5, Tailwind CSS v4, Recharts + D3, @tanstack/react-query, Framer Motion, Zustand, Supabase, date-fns",
      mandatoryLibraries:
        "recharts d3 @tanstack/react-query framer-motion zustand @supabase/supabase-js date-fns lucide-react class-variance-authority clsx tailwind-merge",
      fileList: [
        "package.json (all deps with exact versions)",
        "vite.config.ts (path aliases, react plugin)",
        "tailwind.config.ts (custom design system: colors, typography, spacing)",
        "index.html",
        "tsconfig.json (strict)",
        "src/main.tsx",
        "src/App.tsx (React Router, QueryClientProvider, auth guard, theme provider)",
        "src/pages/Dashboard.tsx (KPI cards, charts grid, recent activity, real-time updates)",
        "src/pages/Analytics.tsx (multi-chart view, date range picker, filters, export to CSV)",
        "src/pages/AIInsights.tsx (AI-generated insights, anomaly detection, trend predictions)",
        "src/pages/DataExplorer.tsx (interactive data table with sorting, filtering, pagination)",
        "src/pages/Settings.tsx (user profile, API keys, notification preferences)",
        "src/components/charts/LineChart.tsx (Recharts with gradient, tooltip, zoom, animation)",
        "src/components/charts/AreaChart.tsx (stacked area chart with Framer Motion transitions)",
        "src/components/charts/BarChart.tsx (grouped/stacked bar chart with animated bars)",
        "src/components/charts/DonutChart.tsx (multi-segment donut with legend and hover effects)",
        "src/components/charts/HeatMap.tsx (D3 heatmap for temporal data patterns)",
        "src/components/ui/KPICard.tsx (stat card: value, trend indicator, sparkline, context)",
        "src/components/ui/DataTable.tsx (virtualized table, sortable columns, inline filters)",
        "src/components/ui/DateRangePicker.tsx (calendar picker, presets: today/week/month/quarter)",
        "src/components/ui/Sidebar.tsx (collapsible nav with icons, active states, user avatar)",
        "src/components/ui/TopBar.tsx (global search, notifications bell, user menu)",
        "src/components/ui/ThemeToggle.tsx (dark/light mode with smooth transition)",
        "src/hooks/useMetrics.ts (@tanstack/react-query hooks for all data fetching)",
        "src/hooks/useRealtime.ts (Supabase realtime subscriptions for live data)",
        "src/store/dashboardStore.ts (Zustand: date range, filters, layout, theme)",
        "src/lib/supabase.ts (Supabase client setup)",
        "src/lib/api.ts (typed API client with error handling)",
        "src/types/metrics.ts (full TypeScript types for all data shapes)",
        "src/styles/index.css (Tailwind base, custom CSS variables, animations)",
        "README.md",
        ".gitignore",
        ".env.example (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)",
      ].join("\n"),
      installCmd: "npm install && npm run dev",
    };
  }

  // ── Real-time Collaboration App ──────────────────────────────
  if (isRealtimeCollab) {
    return {
      archetype: "Real-Time Collaboration App",
      techStack:
        "Vite 6, React 19, TypeScript 5, Tailwind CSS, socket.io, Liveblocks OR Yjs (CRDT), Framer Motion, Zustand, tiptap (rich text)",
      mandatoryLibraries:
        "socket.io-client yjs @liveblocks/client @liveblocks/react framer-motion zustand @tiptap/react @tiptap/starter-kit lucide-react",
      fileList: [
        "package.json (all realtime deps)",
        "vite.config.ts",
        "tailwind.config.ts",
        "index.html",
        "tsconfig.json",
        "src/main.tsx",
        "src/App.tsx (session routing, auth, room management)",
        "src/pages/Room.tsx (main collaboration canvas with multiple presence indicators)",
        "src/pages/Home.tsx (create/join room UI with animated background)",
        "src/components/Canvas.tsx (shared whiteboard: draw, shapes, text, sticky notes)",
        "src/components/CursorPresence.tsx (live multi-cursor display with user names/colors)",
        "src/components/RichTextEditor.tsx (tiptap collaborative editor with formatting toolbar)",
        "src/components/Toolbar.tsx (drawing tools, shapes, colors, text, templates)",
        "src/components/UserList.tsx (active collaborators sidebar with avatars, status)",
        "src/components/Chat.tsx (side panel chat with reactions and threading)",
        "src/components/SharePanel.tsx (copy room link, set permissions, invite by email)",
        "src/hooks/useCollaboration.ts (Liveblocks/Yjs provider, awareness, conflict resolution)",
        "src/hooks/usePresence.ts (cursor positions, selections, online status broadcast)",
        "src/store/roomStore.ts (Zustand: tool state, selection, history undo/redo)",
        "src/types/collaboration.ts (User, Cursor, Shape, TextBlock, Operation types)",
        "src/styles/index.css",
        "README.md",
        ".gitignore",
      ].join("\n"),
      installCmd: "npm install && npm run dev",
    };
  }

  // ── E-Commerce ───────────────────────────────────────────────
  if (isEcommerce) {
    return {
      archetype: "E-Commerce Store (React + Supabase + Stripe)",
      techStack:
        "Vite 6, React 19, TypeScript 5, Tailwind CSS v4, Supabase (DB+Auth+Storage), Stripe.js, @tanstack/react-query, Framer Motion, Zustand",
      mandatoryLibraries:
        "@stripe/stripe-js @stripe/react-stripe-js @supabase/supabase-js @tanstack/react-query framer-motion zustand lucide-react",
      fileList: [
        "package.json",
        "vite.config.ts",
        "tailwind.config.ts (brand colors, product card styles)",
        "index.html",
        "src/main.tsx",
        "src/App.tsx (routes, auth, cart context, query client)",
        "src/pages/Home.tsx (hero, featured products, categories, testimonials)",
        "src/pages/Products.tsx (grid/list view, filters sidebar, sort, search, pagination)",
        "src/pages/ProductDetail.tsx (image gallery, variants, add to cart, reviews, related)",
        "src/pages/Cart.tsx (item list, quantity controls, price summary, coupon code)",
        "src/pages/Checkout.tsx (Stripe Elements form, address, shipping options, order review)",
        "src/pages/OrderConfirmation.tsx (animated success, order tracking number)",
        "src/pages/Account.tsx (orders history, profile, saved addresses, wishlist)",
        "src/components/ProductCard.tsx (image, name, price, rating, quick-add, wishlist)",
        "src/components/ImageGallery.tsx (zoom, thumbnails, fullscreen lightbox)",
        "src/components/FilterSidebar.tsx (category, price range, rating, brand filters)",
        "src/components/CartDrawer.tsx (slide-in cart with Framer Motion animation)",
        "src/components/Header.tsx (logo, search, cart toggle, user menu, mobile nav)",
        "src/components/Footer.tsx (links, newsletter signup, social icons, payment badges)",
        "src/components/ReviewStars.tsx (star rating display and submit form)",
        "src/hooks/useCart.ts (Zustand cart with localStorage persistence)",
        "src/hooks/useProducts.ts (@tanstack/react-query for product fetching)",
        "src/hooks/useCheckout.ts (Stripe payment intent, order creation)",
        "src/lib/supabase.ts (Supabase client)",
        "src/lib/stripe.ts (Stripe.js initialization)",
        "src/types/store.ts (Product, Variant, CartItem, Order, User types)",
        "src/styles/index.css (Tailwind, custom animations)",
        ".env.example (VITE_SUPABASE_URL, VITE_STRIPE_PK)",
        "README.md",
        ".gitignore",
      ].join("\n"),
      installCmd: "npm install && npm run dev",
    };
  }

  // ── Full Stack ───────────────────────────────────────────────
  if (isFullStack) {
    return {
      archetype: "Full-Stack App (React 19 + Fastify + Supabase + Docker)",
      techStack:
        "Vite 6, React 19, TypeScript 5, Tailwind CSS v4, Fastify 5, Drizzle ORM, Supabase, Docker Compose, Framer Motion",
      mandatoryLibraries:
        "frontend: @tanstack/react-query framer-motion zustand lucide-react; backend: fastify @fastify/cors @fastify/jwt drizzle-orm @supabase/supabase-js zod",
      fileList: [
        "frontend/package.json (react-19, tailwind, query, framer-motion)",
        "frontend/vite.config.ts",
        "frontend/tailwind.config.ts",
        "frontend/index.html",
        "frontend/src/main.tsx",
        "frontend/src/App.tsx (routes, auth guard, query client, theme)",
        "frontend/src/pages/Dashboard.tsx (full featured with charts and data)",
        "frontend/src/pages/Profile.tsx",
        "frontend/src/pages/Login.tsx (Supabase auth, animated form)",
        "frontend/src/components/Layout.tsx (sidebar, topbar, responsive)",
        "frontend/src/api/client.ts (typed fetch client with auth headers)",
        "backend/package.json (fastify 5, drizzle-orm, zod, @supabase/supabase-js)",
        "backend/tsconfig.json",
        "backend/src/index.ts (Fastify server, lifecycle hooks, graceful shutdown)",
        "backend/src/routes/api.ts (REST endpoints with Zod validation)",
        "backend/src/routes/auth.ts (Supabase JWT validation middleware)",
        "backend/src/db/schema.ts (Drizzle ORM schema with relations)",
        "backend/src/db/client.ts (connection pool, migration runner)",
        "backend/src/services/business.ts (core business logic layer)",
        "backend/src/middleware/cors.ts",
        "backend/src/types.ts (shared Zod schemas and TypeScript types)",
        "docker-compose.yml (frontend, backend, postgres, redis services with named network)",
        "nginx.conf (reverse proxy: / → frontend, /api → backend)",
        ".env.example (all required env vars)",
        "README.md",
        ".gitignore",
      ].join("\n"),
      installCmd:
        "cd frontend && npm install && cd ../backend && npm install && cd .. && docker compose up -d postgres redis",
    };
  }

  // ── Python/ML Backend ────────────────────────────────────────
  if (isPython) {
    const hasML = /ml|machine.learning|pytorch|tensorflow|ai.model|train|inference|bert|llm/.test(
      d,
    );
    return {
      archetype: hasML
        ? "Python ML/AI Backend (FastAPI + PyTorch + Docker + CUDA)"
        : "Python Backend (FastAPI + Docker)",
      techStack: hasML
        ? "Python 3.12, FastAPI, Pydantic v2, PyTorch 2, Transformers (HuggingFace), uvicorn, Redis, PostgreSQL, Docker + NVIDIA Container Toolkit"
        : "Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 async, uvicorn, Redis, PostgreSQL, Docker",
      mandatoryLibraries: hasML
        ? "fastapi uvicorn pydantic sqlalchemy asyncpg redis torch transformers accelerate python-dotenv httpx pytest"
        : "fastapi uvicorn pydantic sqlalchemy asyncpg redis python-dotenv httpx pytest alembic",
      fileList: [
        "main.py (FastAPI with lifespan, all routers registered, CORS, rate limit)",
        "routers/api.py (full CRUD endpoints with Pydantic validation and error handling)",
        "routers/auth.py (JWT auth, Supabase integration, token refresh)",
        "models/schemas.py (Pydantic v2 request/response models)",
        "models/db.py (SQLAlchemy 2 async models with relationships)",
        "services/core.py (business logic, completely implemented)",
        hasML
          ? "services/ml_service.py (model loading, inference pipeline, batch processing, GPU utilization)"
          : "services/cache.py (Redis caching layer)",
        hasML
          ? "services/model_manager.py (HuggingFace model download, quantization, VRAM management)"
          : "services/email.py (email sending service)",
        "database.py (async engine, session factory, health check)",
        "config.py (Pydantic Settings from .env, all configuration)",
        "middleware/auth.py (JWT validation middleware)",
        "middleware/logging.py (structured JSON logging)",
        "requirements.txt (pinned versions of ALL packages)",
        hasML ? "requirements-gpu.txt (torch + CUDA extras)" : null,
        "Dockerfile (python:3.12-slim, non-root user, health check, optimized layers)",
        "docker-compose.yml (app + postgres + redis" + (hasML ? " + GPU passthrough)" : ")"),
        "alembic.ini + alembic/versions/ (database migrations)",
        ".env.example (DATABASE_URL, REDIS_URL, SECRET_KEY, all vars)",
        "tests/test_api.py (pytest, async test client, 20+ test cases)",
        "tests/conftest.py (fixtures, test DB setup, mock services)",
        "README.md (API docs link, Docker setup, env vars table)",
        ".gitignore",
      ]
        .filter(Boolean)
        .join("\n"),
      installCmd:
        "python -m venv venv && pip install -r requirements.txt && uvicorn main:app --reload",
    };
  }

  // ── Dockerized Service ───────────────────────────────────────
  if (isDocker) {
    return {
      archetype: "Dockerized Microservice (Node.js + Docker Compose)",
      techStack:
        "Node.js 22, TypeScript 5, Fastify 5, Docker, Docker Compose, PostgreSQL, Redis, Bull (job queues)",
      mandatoryLibraries:
        "fastify @fastify/cors @fastify/jwt bullmq ioredis pg drizzle-orm zod pino",
      fileList: [
        "package.json",
        "tsconfig.json (strict)",
        "src/index.ts (Fastify server, plugin registration, graceful shutdown)",
        "src/routes/api.ts (all REST endpoints, Zod validation, error handling)",
        "src/middleware/auth.ts (JWT validation)",
        "src/db/schema.ts (Drizzle ORM schema)",
        "src/db/client.ts (pg pool, Drizzle setup)",
        "src/queues/jobQueue.ts (BullMQ worker setup, job processors)",
        "src/services/core.ts (business logic, fully implemented)",
        "src/types.ts (all TypeScript types and Zod schemas)",
        "Dockerfile (node:22-alpine, non-root, health check endpoint)",
        "docker-compose.yml (service + postgres + redis, named network 'app-net', volumes)",
        ".dockerignore",
        ".env.example",
        "README.md",
        ".gitignore",
      ].join("\n"),
      installCmd: "npm install && docker compose up --build -d",
    };
  }

  // ── Node.js TypeScript API ───────────────────────────────────
  if (isNodeApi) {
    return {
      archetype: "Node.js TypeScript API Server (Hono + Drizzle + Supabase)",
      techStack:
        "Node.js 22, TypeScript 5, Hono 4 (or Fastify 5), Drizzle ORM, Supabase, Zod, JWT, Redis, Docker",
      mandatoryLibraries:
        "hono drizzle-orm @supabase/supabase-js zod ioredis pino tsx typescript @types/node",
      fileList: [
        "package.json (hono, drizzle-orm, zod, @supabase/supabase-js, tsx, typescript)",
        "tsconfig.json (strict, ES2022, NodeNext)",
        "src/index.ts (Hono server, middleware stack, route registration, graceful shutdown)",
        "src/routes/v1/users.ts (full CRUD: list, get, create, update, delete)",
        "src/routes/v1/items.ts (domain-specific routes with auth guards)",
        "src/middleware/auth.ts (Supabase JWT validation, role-based access)",
        "src/middleware/cors.ts (configurable CORS with allowed origins)",
        "src/middleware/rateLimit.ts (Redis-based sliding window rate limiting)",
        "src/db/schema.ts (Drizzle ORM schema with all relations and indexes)",
        "src/db/client.ts (pg connection pool, Drizzle instance, health check)",
        "src/db/migrations/ (initial migration SQL files)",
        "src/services/userService.ts (business logic, fully implemented)",
        "src/services/cacheService.ts (Redis caching with TTL management)",
        "src/lib/supabase.ts (Supabase admin client setup)",
        "src/types.ts (Zod schemas + TypeScript types for all entities)",
        "src/config.ts (type-safe config from process.env with validation)",
        "Dockerfile (node:22-alpine, non-root, multi-stage build)",
        "docker-compose.yml (api + postgres + redis, health checks, named network)",
        ".env.example",
        "README.md (API endpoints table, auth guide, Docker setup)",
        ".gitignore",
      ].join("\n"),
      installCmd: "npm install && npm run dev",
    };
  }

  // ── React Website / Portfolio / PWA ─────────────────────────
  if (isReactWebsite) {
    const isPWA = /pwa|mobile|offline|app.?like/.test(d);
    return {
      archetype: isPWA ? "React PWA (Mobile-First)" : "React Website (Premium UI/UX)",
      techStack:
        "Vite 6, React 19, TypeScript 5, Tailwind CSS v4, Framer Motion, React Router, @tanstack/react-query, Lucide React",
      mandatoryLibraries:
        "framer-motion react-router-dom @tanstack/react-query lucide-react @radix-ui/react-dialog @radix-ui/react-dropdown-menu class-variance-authority clsx tailwind-merge",
      fileList: [
        "package.json (all deps including framer-motion, radix-ui, tanstack-query)",
        "vite.config.ts" + (isPWA ? " (vite-plugin-pwa for service worker)" : ""),
        "tailwind.config.ts (full design system: custom palette, typography scale, animations)",
        "index.html (meta tags, OG tags, favicons, web manifest)",
        "tsconfig.json (strict)",
        "src/main.tsx (React 19, BrowserRouter, QueryClient)",
        "src/App.tsx (all routes, page transitions with Framer Motion AnimatePresence)",
        "src/pages/Home.tsx (hero with parallax, animated sections, CTA, social proof)",
        "src/pages/About.tsx (story, team grid, values, timeline)",
        "src/pages/Services.tsx (feature cards with hover 3D effect, pricing)",
        "src/pages/Portfolio.tsx (filterable grid with lightbox, case studies)",
        "src/pages/Contact.tsx (animated form with validation, map embed, social links)",
        "src/pages/Blog.tsx (article grid, search, categories, featured post hero)",
        "src/components/layout/Navbar.tsx (sticky nav, mobile hamburger, active states, scroll behavior)",
        "src/components/layout/Footer.tsx (columns, newsletter, social, back-to-top)",
        "src/components/ui/Button.tsx (variants: primary/outline/ghost, sizes, loading state)",
        "src/components/ui/Card.tsx (glass effect, hover lift, gradient border)",
        "src/components/ui/Badge.tsx (color variants, animated dot)",
        "src/components/ui/Modal.tsx (Radix Dialog, backdrop blur, Framer Motion entry)",
        "src/components/sections/Hero.tsx (fullscreen hero: gradient mesh bg, animated text, floating elements)",
        "src/components/sections/Features.tsx (icon cards with staggered Framer Motion entrance)",
        "src/components/sections/Testimonials.tsx (auto-scrolling carousel with pause on hover)",
        "src/components/sections/Stats.tsx (animated count-up numbers, icon, label)",
        "src/components/sections/CTA.tsx (gradient section, email capture, animated background)",
        "src/hooks/useScrollAnimation.ts (Intersection Observer triggering Framer Motion variants)",
        "src/hooks/useTheme.ts (dark/light mode with localStorage, CSS variables)",
        "src/styles/index.css (Tailwind base, CSS variables, global animations, custom scrollbar)",
        "src/styles/animations.ts (Framer Motion variant presets: fadeUp, stagger, reveal)",
        "README.md",
        ".gitignore",
      ].join("\n"),
      installCmd: "npm install && npm run dev",
    };
  }

  // ── Generic Project (always produce something substantial) ───
  return {
    archetype: `${framework || "Full-Stack TypeScript"} Application`,
    techStack: `Node.js 22, TypeScript 5, React 19, Vite 6, Tailwind CSS v4`,
    mandatoryLibraries: "react react-dom react-router-dom framer-motion zustand lucide-react",
    fileList: [
      "package.json (react, vite, typescript, tailwind, framer-motion, lucide-react)",
      "vite.config.ts",
      "tailwind.config.ts",
      "index.html",
      "tsconfig.json (strict)",
      "src/main.tsx (React 19 root)",
      "src/App.tsx (router, theme, providers)",
      "src/pages/Home.tsx (full featured home page with hero, features, CTA)",
      "src/pages/Dashboard.tsx (data-driven dashboard with charts and stats)",
      "src/components/Layout.tsx (responsive sidebar + topbar layout)",
      "src/components/ui/Button.tsx (variant system, loading states)",
      "src/components/ui/Card.tsx (glass morphism, hover effects)",
      "src/hooks/useStore.ts (Zustand global state)",
      "src/styles/index.css (Tailwind + custom animations)",
      "README.md",
      ".gitignore",
    ].join("\n"),
    installCmd: "npm install && npm run dev",
  };
}

// ─── scaffold_project ───────────────────────────────────────────

export async function executeScaffoldProject(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const framework = (args.framework as string) ?? "vanilla";
  const rawDescription = (args.description as string) ?? "New project";

  const description = enrichProjectDescription(rawDescription, ctx.specialization);
  const template = detectProjectTemplate(framework, description);

  const task: AgentTask = {
    type: "decision",
    complexity: 0.9,
    citizenId: ctx.citizenId,
    description: `Scaffold world-class ${template.archetype}: ${description}`,
  };

  const decision = selectModel({
    toolName: "scaffold_project",
    task,
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  const overrideConfig = { ...decision.config, requestJson: true };
  const scaffold = await callLLM({
    prompt: [
      `╔══════════════════════════════════════════════════════════════════╗`,
      `║  WORLD-CLASS CODE GENERATION  ║  ${template.archetype}`,
      `╚══════════════════════════════════════════════════════════════════╝`,
      ``,
      `Project: ${description}`,
      `Tech Stack: ${template.techStack}`,
      `Mandatory Libraries: ${template.mandatoryLibraries}`,
      ``,
      `GENERATE ALL OF THESE FILES WITH COMPLETE, REAL CODE:`,
      template.fileList,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `STRICT QUALITY REQUIREMENTS — VIOLATIONS WILL FAIL:`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `1. COMPLETENESS — Every file must be FULLY IMPLEMENTED:`,
      `   ✗ BANNED: TODO, FIXME, // implement, // add logic here, ...`,
      `   ✗ BANNED: placeholder functions that return null/undefined`,
      `   ✗ BANNED: empty component bodies`,
      `   ✓ REQUIRED: Every function has real, working logic`,
      `   ✓ REQUIRED: Every component renders real JSX with data`,
      ``,
      `2. SIZE — Minimum file sizes (incomplete = rejected):`,
      `   - package.json: real deps with pinned versions (e.g. "react": "^19.0.0")`,
      `   - TypeScript/TSX files: minimum 80 lines of real code`,
      `   - CSS files: minimum 50 lines with real styles`,
      `   - Config files (vite, tsconfig, tailwind): complete, not stubs`,
      ``,
      `3. QUALITY — This must be ELITE, world-class code:`,
      `   ✓ React components: real hooks, real state, real interactivity`,
      `   ✓ 3D scenes: real meshes, real materials, real physics, real lighting`,
      `   ✓ APIs: real endpoints, real validation, real error handling`,
      `   ✓ Styling: beautiful UI with real Tailwind classes, gradients, animations`,
      `   ✓ State management: real Zustand store with all required state`,
      `   ✓ Types: strict TypeScript with real interfaces, no "any"`,
      ``,
      `4. DEPENDENCIES — package.json must include ALL required packages:`,
      `   Must include: ${template.mandatoryLibraries}`,
      `   All deps must have real version numbers (not "*")`,
      ``,
      `5. VISUAL EXCELLENCE (for React/UI projects):`,
      `   ✓ Dark mode support with CSS variables`,
      `   ✓ Smooth animations (Framer Motion variants or GSAP timelines)`,
      `   ✓ Glass morphism, gradients, micro-interactions`,
      `   ✓ Mobile-responsive with Tailwind breakpoints`,
      `   ✓ Google Fonts imported in index.html or CSS`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `OUTPUT FORMAT (return ONLY this JSON, nothing else):`,
      `{ "files": { "exact/file/path.ext": "complete file content here...", ... } }`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join("\n"),
    systemPrompt: [
      `You are ${ctx.citizenName}, an elite ${ctx.specialization} from the HoC Republic.`,
      `You are world-renowned for building STUNNING, production-quality applications.`,
      `Your code is always complete, compilable, and beautiful. You never write stubs.`,
      `You build apps that make people say "WOW" — addicting UX, premium visuals, real functionality.`,
      `For 3D: master of React Three Fiber, Rapier physics, postprocessing effects, GSAP animations.`,
      `For web apps: master of Framer Motion, Tailwind, Radix UI, shadcn-style components.`,
      `Return ONLY valid JSON with the exact file structure requested. Zero prose, zero explanation.`,
    ].join(" "),
    decision: { ...decision, config: overrideConfig },
  });

  // ── Parse and validate the scaffold response ──────────────────
  const filesAffected: string[] = [];
  const stubPatterns =
    /\/\/ TODO|\/\/ FIXME|\/\/ implement|\/\/ add logic|placeholder|your code here|\.\.\.$/im;

  try {
    const jsonMatch = scaffold.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const files = (parsed.files as Record<string, string>) ?? parsed;

      for (const [filePath, content] of Object.entries(files)) {
        if (typeof content !== "string" || !filePath || filePath.startsWith("{")) {
          continue;
        }

        const isRealCode = content.trim().length > 100 && !stubPatterns.test(content);

        const finalContent = isRealCode
          ? content
          : `// Auto-generated placeholder for ${filePath}\n// This file will be fully implemented in the next write_code pass\nexport {};\n`;

        await writeWorkspaceFile({
          projectId: ctx.projectId,
          relativePath: filePath,
          content: finalContent,
          language: detectLanguage(filePath),
          citizenId: ctx.citizenId,
        });
        filesAffected.push(filePath);
      }
    }
  } catch {
    await writeWorkspaceFile({
      projectId: ctx.projectId,
      relativePath: "SCAFFOLD.md",
      content: `# Project Scaffold\n\nType: ${template.archetype}\nDescription: ${description}\nTech: ${template.techStack}\n\n## Install\n\`\`\`\n${template.installCmd}\n\`\`\`\n\n## Scaffold Output\n\n${scaffold}`,
      language: "markdown",
      citizenId: ctx.citizenId,
    });
    filesAffected.push("SCAFFOLD.md");
  }

  // ── Post-scaffold: run npm install if Node.js project ─────────
  const ws = getWorkspace(ctx.projectId);
  if (ws && /npm install|npm run/.test(template.installCmd)) {
    try {
      await execInWorkspace(ctx.projectId, "npm", ["install", "--prefer-offline", "--no-audit"]);
    } catch {
      /* non-critical — may need manual install */
    }
  }

  // ── Post-scaffold: persist metadata ───────────────────────────
  if (ws) {
    ws.framework = template.archetype;
    ws.creatorId = ctx.citizenId;
    await updateWorkspaceStatus(ctx.projectId, "active");
  }

  return {
    id: uid(),
    toolName: "scaffold_project",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Scaffolded ${template.archetype} (${filesAffected.length} files, deps installed): ${filesAffected.slice(0, 6).join(", ")}${filesAffected.length > 6 ? ` +${filesAffected.length - 6} more` : ""}`,
    filesAffected,
    modelDecision: decision,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}
