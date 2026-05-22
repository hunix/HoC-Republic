/**
 * Republic DevStudio — Full-Stack Library Catalog
 *
 * Comprehensive npm package reference for citizen developers.
 * Covers every domain needed to build production full-stack applications:
 * 3D/WebGL, ecommerce, payments, email, auth, AI/ML, real-time,
 * file/storage, UI, state, testing, animation, PDF, geospatial, and more.
 *
 * Citizens query this to know exactly which packages to install for any feature.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LibraryEntry {
  name: string;           // npm package name
  displayName: string;
  domain: string;
  description: string;
  install: string;        // npm install command
  docs: string;
  weekly?: string;        // approx weekly downloads (human-readable)
  tags: string[];
  reactOnly?: boolean;    // true if React-specific
  backendOnly?: boolean;  // true if Node.js/server-only
  license?: string;
}

export interface LibraryDomain {
  id: string;
  label: string;
  description: string;
  icon: string;
  packages: LibraryEntry[];
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const LIBRARY_CATALOG: LibraryDomain[] = [
  {
    id: "3d-webgl",
    label: "3D / WebGL / Game",
    description: "Build 3D games, interactive visualizations, and physics simulations in the browser",
    icon: "🎮",
    packages: [
      { name: "@react-three/fiber", displayName: "React Three Fiber", domain: "3d-webgl", description: "React renderer for Three.js — build 3D scenes declaratively", install: "npm install three @react-three/fiber", docs: "https://docs.pmnd.rs/react-three-fiber", weekly: "450k", tags: ["3d","react","threejs"], reactOnly: true, license: "MIT" },
      { name: "@react-three/drei", displayName: "Three.js Drei", domain: "3d-webgl", description: "Helpers and abstractions for R3F: cameras, controls, loaders, shaders", install: "npm install @react-three/drei", docs: "https://drei.pmnd.rs", weekly: "380k", tags: ["3d","react","helpers"], reactOnly: true, license: "MIT" },
      { name: "@react-three/rapier", displayName: "Rapier Physics", domain: "3d-webgl", description: "Fast WASM physics engine (Rapier) for R3F: rigid bodies, colliders, joints", install: "npm install @react-three/rapier", docs: "https://rapier.rs", weekly: "85k", tags: ["physics","3d","wasm"], reactOnly: true, license: "MIT" },
      { name: "three", displayName: "Three.js", domain: "3d-webgl", description: "3D library for WebGL — core renderer, geometries, materials, cameras", install: "npm install three @types/three", docs: "https://threejs.org", weekly: "1.2M", tags: ["3d","webgl","canvas"], license: "MIT" },
      { name: "@react-three/postprocessing", displayName: "Post Processing", domain: "3d-webgl", description: "Visual effects for R3F: bloom, depth-of-field, glitch, chromatic aberration", install: "npm install @react-three/postprocessing postprocessing", docs: "https://pmnd.rs", tags: ["3d","vfx","effects"], reactOnly: true },
      { name: "cannon-es", displayName: "Cannon.js ES", domain: "3d-webgl", description: "Lightweight 3D physics engine (rigid bodies, broadphase collision)", install: "npm install cannon-es", docs: "https://pmndrs.github.io/cannon-es", tags: ["physics","3d"], license: "MIT" },
      { name: "pixi.js", displayName: "PixiJS", domain: "3d-webgl", description: "2D WebGL renderer — fastest 2D sprites, particles, games", install: "npm install pixi.js", docs: "https://pixijs.com", weekly: "400k", tags: ["2d","webgl","canvas","game"], license: "MIT" },
      { name: "phaser", displayName: "Phaser", domain: "3d-webgl", description: "Full-featured 2D game framework: physics, cameras, tilemaps, animations", install: "npm install phaser", docs: "https://phaser.io", weekly: "120k", tags: ["game","2d","framework"], license: "MIT" },
      { name: "babylonjs", displayName: "Babylon.js", domain: "3d-webgl", description: "Enterprise-grade 3D engine: PBR, VR/AR, GUI, physics, audio", install: "npm install @babylonjs/core", docs: "https://babylonjs.com", tags: ["3d","webgl","xr","enterprise"], license: "Apache-2.0" },
      { name: "@use-gesture/react", displayName: "use-gesture", domain: "3d-webgl", description: "Bind mouse/touch/scroll gestures — works great with R3F for interactive 3D", install: "npm install @use-gesture/react", docs: "https://use-gesture.netlify.app", tags: ["gesture","3d","interaction"], reactOnly: true },
    ],
  },
  {
    id: "animation",
    label: "Animation / Motion",
    description: "Animate UI elements, transitions, and micro-interactions",
    icon: "✨",
    packages: [
      { name: "framer-motion", displayName: "Framer Motion", domain: "animation", description: "Production-ready animations for React: layout, presenceAnimate, gestures", install: "npm install framer-motion", docs: "https://framer.com/motion", weekly: "3M", tags: ["animation","react","css"], reactOnly: true, license: "MIT" },
      { name: "gsap", displayName: "GSAP", domain: "animation", description: "Professional-grade animation library: timelines, scrollTrigger, morphSVG", install: "npm install gsap", docs: "https://gsap.com", weekly: "800k", tags: ["animation","timeline","scroll"], license: "Standard GSAP" },
      { name: "motion", displayName: "Motion (motion.dev)", domain: "animation", description: "Lightweight successor to Framer Motion — works with any JS framework", install: "npm install motion", docs: "https://motion.dev", tags: ["animation","lightweight"], license: "MIT" },
      { name: "lottie-react", displayName: "Lottie", domain: "animation", description: "Render Adobe After Effects animations as JSON (Bodymovin)", install: "npm install lottie-react", docs: "https://airbnb.io/lottie", weekly: "280k", tags: ["animation","lottie","after-effects"], reactOnly: true, license: "MIT" },
      { name: "react-spring", displayName: "React Spring", domain: "animation", description: "Spring physics-based animations for React", install: "npm install @react-spring/web", docs: "https://react-spring.dev", tags: ["animation","physics","react"], reactOnly: true, license: "MIT" },
      { name: "animejs", displayName: "Anime.js", domain: "animation", description: "Lightweight JS animation engine: CSS, SVG, DOM, JS objects", install: "npm install animejs", docs: "https://animejs.com", tags: ["animation","svg","css"], license: "MIT" },
    ],
  },
  {
    id: "payments",
    label: "Payments & Billing",
    description: "Accept payments, manage subscriptions, and handle invoicing",
    icon: "💳",
    packages: [
      { name: "@stripe/stripe-js", displayName: "Stripe JS", domain: "payments", description: "Stripe payment processing for browser: card elements, PaymentIntent, Checkout", install: "npm install @stripe/stripe-js @stripe/react-stripe-js", docs: "https://stripe.com/docs/js", weekly: "800k", tags: ["payments","stripe","checkout"], reactOnly: true, license: "MIT" },
      { name: "stripe", displayName: "Stripe Node SDK", domain: "payments", description: "Stripe server SDK: charges, subscriptions, webhooks, payouts", install: "npm install stripe", docs: "https://stripe.com/docs/api", weekly: "900k", tags: ["payments","stripe","server"], backendOnly: true, license: "MIT" },
      { name: "@paypal/react-paypal-js", displayName: "PayPal React", domain: "payments", description: "PayPal Buttons, hosted fields, and Pay Later messaging for React", install: "npm install @paypal/react-paypal-js", docs: "https://paypal.github.io/react-paypal-js", tags: ["payments","paypal"], reactOnly: true },
      { name: "razorpay", displayName: "Razorpay", domain: "payments", description: "Razorpay payment gateway SDK (popular in India/Asia)", install: "npm install razorpay", docs: "https://razorpay.com/docs", tags: ["payments","india"], backendOnly: true },
      { name: "@lemonsqueezy/lemonsqueezy.js", displayName: "Lemon Squeezy", domain: "payments", description: "All-in-one digital product payments: SaaS billing, licenses, affiliates", install: "npm install @lemonsqueezy/lemonsqueezy.js", docs: "https://docs.lemonsqueezy.com", tags: ["payments","saas","billing"] },
      { name: "paddle-js", displayName: "Paddle", domain: "payments", description: "Merchant of record — Paddle handles VAT, taxes, and compliance globally", install: "npm install @paddle/paddle-js", docs: "https://developer.paddle.com", tags: ["payments","tax","saas"] },
    ],
  },
  {
    id: "email",
    label: "Email & Messaging",
    description: "Send transactional emails, SMS, and push notifications",
    icon: "✉️",
    packages: [
      { name: "resend", displayName: "Resend", domain: "email", description: "Modern email API for developers — React Email templates, high deliverability", install: "npm install resend", docs: "https://resend.com/docs", weekly: "200k", tags: ["email","api","transactional"], backendOnly: true, license: "MIT" },
      { name: "@react-email/components", displayName: "React Email", domain: "email", description: "Build beautiful HTML email templates with React components", install: "npm install @react-email/components react-email", docs: "https://react.email", tags: ["email","react","template"], reactOnly: true, license: "MIT" },
      { name: "nodemailer", displayName: "Nodemailer", domain: "email", description: "Send emails from Node.js via SMTP, Gmail, Outlook, SES", install: "npm install nodemailer", docs: "https://nodemailer.com", weekly: "2M", tags: ["email","smtp","server"], backendOnly: true, license: "MIT" },
      { name: "@sendgrid/mail", displayName: "SendGrid", domain: "email", description: "SendGrid transactional email API — marketing + transactional", install: "npm install @sendgrid/mail", docs: "https://docs.sendgrid.com", weekly: "400k", tags: ["email","sendgrid"], backendOnly: true },
      { name: "twilio", displayName: "Twilio SMS", domain: "email", description: "SMS, WhatsApp, voice calls, and email via Twilio APIs", install: "npm install twilio", docs: "https://twilio.com/docs", tags: ["sms","whatsapp","voice"], backendOnly: true },
      { name: "pusher", displayName: "Pusher Server", domain: "email", description: "Real-time push notifications via Pusher Channels", install: "npm install pusher", docs: "https://pusher.com/docs", tags: ["realtime","push","notifications"], backendOnly: true },
    ],
  },
  {
    id: "auth",
    label: "Authentication",
    description: "User login, OAuth, JWT, sessions, and role-based access",
    icon: "🔐",
    packages: [
      { name: "next-auth", displayName: "NextAuth.js / Auth.js", domain: "auth", description: "Complete auth for Next.js: OAuth (Google, GitHub), credentials, sessions", install: "npm install next-auth", docs: "https://next-auth.js.org", weekly: "750k", tags: ["auth","oauth","nextjs"], license: "ISC" },
      { name: "@supabase/auth-helpers-nextjs", displayName: "Supabase Auth (Next.js)", domain: "auth", description: "Supabase auth helpers for Next.js: SSR, middleware, cookie management", install: "npm install @supabase/auth-helpers-nextjs", docs: "https://supabase.com/docs/guides/auth/auth-helpers/nextjs", tags: ["auth","supabase","nextjs"], reactOnly: true },
      { name: "jose", displayName: "Jose (JWT)", domain: "auth", description: "JWT sign/verify, JWK, JWE — standards-compliant, Edge-runtime safe", install: "npm install jose", docs: "https://github.com/panva/jose", weekly: "5M", tags: ["jwt","auth","crypto"], license: "MIT" },
      { name: "bcryptjs", displayName: "bcryptjs", domain: "auth", description: "Password hashing with bcrypt — pure JS, no native dependencies", install: "npm install bcryptjs", docs: "https://github.com/dcodeIO/bcrypt.js", weekly: "1.5M", tags: ["password","hash","auth"], backendOnly: true, license: "MIT" },
      { name: "passport", displayName: "Passport.js", domain: "auth", description: "Flexible authentication middleware for Express: 500+ OAuth strategies", install: "npm install passport passport-local passport-jwt", docs: "https://passportjs.org", tags: ["auth","oauth","express"], backendOnly: true },
      { name: "lucia", displayName: "Lucia Auth", domain: "auth", description: "Session-based auth library — framework agnostic, TypeScript first", install: "npm install lucia", docs: "https://lucia-auth.com", tags: ["auth","sessions","typescript"] },
    ],
  },
  {
    id: "ai-ml",
    label: "AI / ML / LLM",
    description: "Integrate LLMs, build AI pipelines, and run inference",
    icon: "🤖",
    packages: [
      { name: "openai", displayName: "OpenAI SDK", domain: "ai-ml", description: "Official OpenAI SDK: GPT-4o, DALL-E, Assistants, Embeddings, TTS, Whisper", install: "npm install openai", docs: "https://platform.openai.com/docs", weekly: "2M", tags: ["ai","llm","openai"], license: "MIT" },
      { name: "@anthropic-ai/sdk", displayName: "Anthropic Claude SDK", domain: "ai-ml", description: "Claude 3.5 Sonnet/Haiku API for text, vision, and tool use", install: "npm install @anthropic-ai/sdk", docs: "https://docs.anthropic.com", tags: ["ai","claude","llm"], license: "MIT" },
      { name: "@google/generative-ai", displayName: "Google Gemini SDK", domain: "ai-ml", description: "Gemini Flash/Pro API for text, images, video, and code", install: "npm install @google/generative-ai", docs: "https://ai.google.dev", tags: ["ai","gemini","google"], license: "Apache-2.0" },
      { name: "ai", displayName: "Vercel AI SDK", domain: "ai-ml", description: "Unified streaming AI SDK for React/Next.js: useChat, useCompletion, tool calls", install: "npm install ai", docs: "https://sdk.vercel.ai", weekly: "600k", tags: ["ai","streaming","react","nextjs"], reactOnly: true, license: "Apache-2.0" },
      { name: "langchain", displayName: "LangChain", domain: "ai-ml", description: "Build LLM-powered apps: chains, agents, RAG, vector stores", install: "npm install langchain @langchain/core @langchain/openai", docs: "https://js.langchain.com", weekly: "300k", tags: ["ai","rag","agents","llm"], license: "MIT" },
      { name: "ollama", displayName: "Ollama JS", domain: "ai-ml", description: "Run local LLMs via Ollama — zero cloud cost inference", install: "npm install ollama", docs: "https://ollama.ai", tags: ["ai","local","llm","inference"] },
      { name: "transformers", displayName: "Transformers.js", domain: "ai-ml", description: "Run Hugging Face models in the browser or Node.js via ONNX", install: "npm install @huggingface/transformers", docs: "https://huggingface.co/docs/transformers.js", tags: ["ai","ml","browser","onnx"] },
    ],
  },
  {
    id: "realtime",
    label: "Real-time / WebSocket",
    description: "Live updates, collaborative editing, presence, and push events",
    icon: "⚡",
    packages: [
      { name: "socket.io", displayName: "Socket.IO Server", domain: "realtime", description: "Bidirectional real-time events: rooms, namespaces, auto-reconnect", install: "npm install socket.io", docs: "https://socket.io/docs", weekly: "1.5M", tags: ["realtime","websocket","events"], backendOnly: true, license: "MIT" },
      { name: "socket.io-client", displayName: "Socket.IO Client", domain: "realtime", description: "Socket.IO browser client with auto-reconnect and event emitter", install: "npm install socket.io-client", docs: "https://socket.io/docs/v4/client-api", weekly: "1M", tags: ["realtime","websocket"], license: "MIT" },
      { name: "ws", displayName: "ws (WebSocket)", domain: "realtime", description: "Fast, minimal WebSocket server for Node.js", install: "npm install ws", docs: "https://github.com/websockets/ws", weekly: "50M", tags: ["websocket","server"], backendOnly: true, license: "MIT" },
      { name: "ably", displayName: "Ably", domain: "realtime", description: "Pub/sub, presence, history — enterprise realtime infrastructure", install: "npm install ably", docs: "https://ably.com/docs", tags: ["realtime","pubsub","presence"] },
      { name: "y-websocket", displayName: "Yjs + WebSocket", domain: "realtime", description: "CRDTs for collaborative editing — like Google Docs in your app", install: "npm install yjs y-websocket", docs: "https://yjs.dev", tags: ["crdt","collaborative","realtime"] },
      { name: "partykit", displayName: "PartyKit", domain: "realtime", description: "Deploy real-time multiplayer backends to edge — Cloudflare Durable Objects", install: "npm install partysocket", docs: "https://partykit.io", tags: ["realtime","multiplayer","edge"] },
    ],
  },
  {
    id: "data-charts",
    label: "Data & Charts",
    description: "Visualize data: charts, graphs, dashboards, and tables",
    icon: "📊",
    packages: [
      { name: "recharts", displayName: "Recharts", domain: "data-charts", description: "React charting library: line, bar, pie, radar — composable SVG", install: "npm install recharts", docs: "https://recharts.org", weekly: "2M", tags: ["charts","react","svg"], reactOnly: true, license: "MIT" },
      { name: "chart.js", displayName: "Chart.js", domain: "data-charts", description: "Canvas-based charts: versatile, responsive, animated", install: "npm install chart.js react-chartjs-2", docs: "https://chartjs.org", weekly: "3M", tags: ["charts","canvas","responsive"], license: "MIT" },
      { name: "d3", displayName: "D3.js", domain: "data-charts", description: "Data-driven document manipulation — most powerful visualization library", install: "npm install d3", docs: "https://d3js.org", weekly: "2M", tags: ["charts","svg","data"], license: "ISC" },
      { name: "@tanstack/react-table", displayName: "TanStack Table", domain: "data-charts", description: "Headless table engine: sorting, filtering, pagination, virtualization", install: "npm install @tanstack/react-table", docs: "https://tanstack.com/table", weekly: "1.5M", tags: ["table","data","react"], reactOnly: true, license: "MIT" },
      { name: "plotly.js", displayName: "Plotly", domain: "data-charts", description: "Scientific plots: 3D, heatmaps, candlesticks, geo maps", install: "npm install plotly.js react-plotly.js", docs: "https://plotly.com/javascript", tags: ["charts","scientific","3d"], license: "MIT" },
      { name: "@nivo/core", displayName: "Nivo", domain: "data-charts", description: "Rich React data visualization built on D3: treemaps, calendars, chords", install: "npm install @nivo/core @nivo/line @nivo/bar", docs: "https://nivo.rocks", tags: ["charts","react","d3"], reactOnly: true, license: "MIT" },
    ],
  },
  {
    id: "ui-components",
    label: "UI Component Libraries",
    description: "Pre-built accessible UI components for rapid development",
    icon: "🎨",
    packages: [
      { name: "@radix-ui/react-dialog", displayName: "Radix UI", domain: "ui-components", description: "Unstyled, accessible React components: Dialog, Select, Dropdown, Tooltip...", install: "npm install @radix-ui/react-dialog @radix-ui/react-select", docs: "https://radix-ui.com", weekly: "3M", tags: ["ui","accessible","headless"], reactOnly: true, license: "MIT" },
      { name: "shadcn-ui", displayName: "shadcn/ui", domain: "ui-components", description: "Copy-paste components built on Radix + Tailwind — fully customizable", install: "npx shadcn@latest init", docs: "https://ui.shadcn.com", tags: ["ui","tailwind","radix"], reactOnly: true, license: "MIT" },
      { name: "@headlessui/react", displayName: "Headless UI", domain: "ui-components", description: "Fully accessible unstyled components by Tailwind Labs", install: "npm install @headlessui/react", docs: "https://headlessui.com", weekly: "1.5M", tags: ["ui","accessible","headless"], reactOnly: true, license: "MIT" },
      { name: "@mantine/core", displayName: "Mantine", domain: "ui-components", description: "Full-featured React component library with 100+ components", install: "npm install @mantine/core @mantine/hooks", docs: "https://mantine.dev", weekly: "600k", tags: ["ui","react","components"], reactOnly: true, license: "MIT" },
      { name: "lucide-react", displayName: "Lucide Icons", domain: "ui-components", description: "Beautiful, consistent icon library — 1500+ icons as React components", install: "npm install lucide-react", docs: "https://lucide.dev", weekly: "2M", tags: ["icons","react","svg"], reactOnly: true, license: "ISC" },
      { name: "react-hot-toast", displayName: "React Hot Toast", domain: "ui-components", description: "Lightweight, beautiful toast notifications for React", install: "npm install react-hot-toast", docs: "https://react-hot-toast.com", weekly: "600k", tags: ["ui","toast","notifications"], reactOnly: true, license: "MIT" },
      { name: "react-hook-form", displayName: "React Hook Form", domain: "ui-components", description: "Performant, flexible form validation with React hooks and Zod", install: "npm install react-hook-form @hookform/resolvers zod", docs: "https://react-hook-form.com", weekly: "4M", tags: ["forms","validation","react"], reactOnly: true, license: "MIT" },
    ],
  },
  {
    id: "state-management",
    label: "State Management",
    description: "Manage global state, server state, and async data fetching",
    icon: "🗄️",
    packages: [
      { name: "@tanstack/react-query", displayName: "TanStack Query", domain: "state-management", description: "Async state management: caching, refetching, mutations, optimistic updates", install: "npm install @tanstack/react-query", docs: "https://tanstack.com/query", weekly: "4M", tags: ["state","react","async","cache"], reactOnly: true, license: "MIT" },
      { name: "zustand", displayName: "Zustand", domain: "state-management", description: "Minimal, fast global state with hooks — no boilerplate", install: "npm install zustand", docs: "https://zustand-demo.pmnd.rs", weekly: "4M", tags: ["state","hooks","minimal"], reactOnly: true, license: "MIT" },
      { name: "jotai", displayName: "Jotai", domain: "state-management", description: "Atomic state management for React — bottom-up approach", install: "npm install jotai", docs: "https://jotai.org", weekly: "800k", tags: ["state","atomic","react"], reactOnly: true, license: "MIT" },
      { name: "@reduxjs/toolkit", displayName: "Redux Toolkit", domain: "state-management", description: "Official Redux toolset: slices, RTK Query, Immer integration", install: "npm install @reduxjs/toolkit react-redux", docs: "https://redux-toolkit.js.org", weekly: "3M", tags: ["state","redux","enterprise"], reactOnly: true, license: "MIT" },
      { name: "swr", displayName: "SWR", domain: "state-management", description: "Stale-while-revalidate data fetching by Vercel — simple and fast", install: "npm install swr", docs: "https://swr.vercel.app", weekly: "1.5M", tags: ["state","fetching","cache"], license: "MIT" },
    ],
  },
  {
    id: "testing",
    label: "Testing & QA",
    description: "Unit tests, integration tests, E2E, mocking, and code coverage",
    icon: "🧪",
    packages: [
      { name: "vitest", displayName: "Vitest", domain: "testing", description: "Vite-native testing framework — fast unit and integration tests with watch mode", install: "npm install -D vitest", docs: "https://vitest.dev", weekly: "4M", tags: ["testing","vite","unit"], license: "MIT" },
      { name: "@testing-library/react", displayName: "Testing Library", domain: "testing", description: "Test React components the way users interact with them", install: "npm install -D @testing-library/react @testing-library/jest-dom", docs: "https://testing-library.com/react", weekly: "3M", tags: ["testing","react","components"], reactOnly: true, license: "MIT" },
      { name: "playwright", displayName: "Playwright", domain: "testing", description: "Cross-browser E2E testing: Chromium, Firefox, WebKit — auto-wait, codegen", install: "npm install -D @playwright/test && npx playwright install", docs: "https://playwright.dev", weekly: "2M", tags: ["e2e","browser","testing"], license: "Apache-2.0" },
      { name: "msw", displayName: "Mock Service Worker", domain: "testing", description: "API mocking at network level: works in browser and Node.js", install: "npm install -D msw", docs: "https://mswjs.io", weekly: "900k", tags: ["testing","mocking","api"], license: "MIT" },
      { name: "supertest", displayName: "Supertest", domain: "testing", description: "HTTP integration testing for Express/Fastify API routes", install: "npm install -D supertest", docs: "https://github.com/ladjs/supertest", weekly: "2M", tags: ["testing","api","http"], backendOnly: true, license: "MIT" },
    ],
  },
  {
    id: "file-storage",
    label: "Files & Storage",
    description: "Upload, process, convert, and store files: images, PDFs, video",
    icon: "📁",
    packages: [
      { name: "sharp", displayName: "Sharp", domain: "file-storage", description: "Fast Node.js image processing: resize, compress, convert, WebP, AVIF", install: "npm install sharp", docs: "https://sharp.pixelplumbing.com", weekly: "3M", tags: ["images","processing","server"], backendOnly: true, license: "Apache-2.0" },
      { name: "multer", displayName: "Multer", domain: "file-storage", description: "Express middleware for multipart/form-data file uploads", install: "npm install multer", docs: "https://github.com/expressjs/multer", weekly: "2M", tags: ["upload","express","files"], backendOnly: true, license: "MIT" },
      { name: "@pdf-lib/core", displayName: "pdf-lib", domain: "file-storage", description: "Create and modify PDF documents in Node.js and the browser", install: "npm install pdf-lib", docs: "https://pdf-lib.js.org", weekly: "400k", tags: ["pdf","documents"], license: "MIT" },
      { name: "@react-pdf/renderer", displayName: "React PDF", domain: "file-storage", description: "Create PDF files using React components", install: "npm install @react-pdf/renderer", docs: "https://react-pdf.org", weekly: "200k", tags: ["pdf","react","documents"], reactOnly: true, license: "MIT" },
      { name: "xlsx", displayName: "SheetJS (xlsx)", domain: "file-storage", description: "Read and write Excel, CSV, ODS spreadsheets", install: "npm install xlsx", docs: "https://sheetjs.com", weekly: "800k", tags: ["excel","csv","spreadsheet"], license: "Apache-2.0" },
      { name: "docx", displayName: "docx", domain: "file-storage", description: "Generate Microsoft Word .docx files with JavaScript", install: "npm install docx", docs: "https://docx.js.org", tags: ["word","documents","office"], license: "MIT" },
    ],
  },
  {
    id: "geospatial",
    label: "Maps & Geospatial",
    description: "Interactive maps, geolocation, routing, and spatial data",
    icon: "🗺️",
    packages: [
      { name: "mapbox-gl", displayName: "Mapbox GL JS", domain: "geospatial", description: "Interactive, customizable vector maps with GL rendering", install: "npm install mapbox-gl react-map-gl", docs: "https://docs.mapbox.com/mapbox-gl-js", weekly: "400k", tags: ["maps","vector","gl"], license: "BSD-3" },
      { name: "leaflet", displayName: "Leaflet", domain: "geospatial", description: "Lightweight, mobile-friendly interactive maps", install: "npm install leaflet react-leaflet @types/leaflet", docs: "https://leafletjs.com", weekly: "1M", tags: ["maps","mobile"], license: "BSD-2" },
      { name: "deck.gl", displayName: "deck.gl", domain: "geospatial", description: "WebGL-powered geospatial visualization layers for large datasets", install: "npm install deck.gl @deck.gl/react", docs: "https://deck.gl", tags: ["maps","webgl","visualization"], license: "MIT" },
      { name: "globe.gl", displayName: "Globe.gl", domain: "geospatial", description: "3D globe visualization using Three.js — arcs, labels, polygons", install: "npm install globe.gl", docs: "https://globe.gl", tags: ["globe","3d","visualization"], license: "MIT" },
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    description: "Build online stores: product catalog, cart, checkout, shipping",
    icon: "🛒",
    packages: [
      { name: "medusa-js", displayName: "MedusaJS", domain: "ecommerce", description: "Open-source Shopify alternative: products, orders, carts, payments, plugins", install: "npm install medusa-js @medusajs/medusa", docs: "https://docs.medusajs.com", tags: ["ecommerce","store","headless"], license: "MIT" },
      { name: "@commercelayer/sdk", displayName: "Commerce Layer", domain: "ecommerce", description: "Headless commerce API: products, orders, taxes, inventory, promotions", install: "npm install @commercelayer/sdk", docs: "https://docs.commercelayer.io", tags: ["ecommerce","headless","api"] },
      { name: "next-commerce", displayName: "Next Commerce", domain: "ecommerce", description: "Vercel's open-source commerce starter: Shopify, BigCommerce, Saleor", install: "npx create-next-app --example commerce", docs: "https://nextjs.org/commerce", tags: ["ecommerce","nextjs","shopify"] },
      { name: "snipcart", displayName: "Snipcart", domain: "ecommerce", description: "Add shopping cart to any HTML site with a JS snippet", install: "# Add script tag, no npm install needed", docs: "https://snipcart.com/documentation", tags: ["ecommerce","cart","javascript"] },
    ],
  },
  {
    id: "utilities",
    label: "Utilities & Tooling",
    description: "Essential utilities: validation, dates, IDs, HTTP, formatting",
    icon: "🔧",
    packages: [
      { name: "zod", displayName: "Zod", domain: "utilities", description: "TypeScript-first schema validation with static type inference", install: "npm install zod", docs: "https://zod.dev", weekly: "10M", tags: ["validation","typescript","schema"], license: "MIT" },
      { name: "date-fns", displayName: "date-fns", domain: "utilities", description: "Comprehensive date utility library — tree-shakeable, immutable", install: "npm install date-fns", docs: "https://date-fns.org", weekly: "8M", tags: ["dates","utilities"], license: "MIT" },
      { name: "nanoid", displayName: "nanoid", domain: "utilities", description: "Tiny, secure URL-friendly unique ID generator", install: "npm install nanoid", docs: "https://github.com/ai/nanoid", weekly: "20M", tags: ["id","uuid","utilities"], license: "MIT" },
      { name: "axios", displayName: "Axios", domain: "utilities", description: "Promise-based HTTP client for browser and Node.js with interceptors", install: "npm install axios", docs: "https://axios-http.com", weekly: "25M", tags: ["http","fetch","utilities"], license: "MIT" },
      { name: "immer", displayName: "Immer", domain: "utilities", description: "Immutable state management: mutate draft objects, get immutable result", install: "npm install immer", docs: "https://immerjs.github.io/immer", weekly: "8M", tags: ["immutable","state","utilities"], license: "MIT" },
      { name: "clsx", displayName: "clsx", domain: "utilities", description: "Tiny utility for conditional className strings", install: "npm install clsx", docs: "https://github.com/lukeed/clsx", weekly: "15M", tags: ["css","utilities","react"], license: "MIT" },
      { name: "lodash-es", displayName: "Lodash ES", domain: "utilities", description: "Utility library: arrays, objects, strings, async — tree-shakeable ESM", install: "npm install lodash-es @types/lodash-es", docs: "https://lodash.com/docs", weekly: "5M", tags: ["utilities","functional"], license: "MIT" },
    ],
  },
];

// ─── Query Functions ───────────────────────────────────────────────────────────

export function getLibraryDomains(): Array<{ id: string; label: string; description: string; icon: string; count: number }> {
  return LIBRARY_CATALOG.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    icon: d.icon,
    count: d.packages.length,
  }));
}

export function getLibrariesForDomain(domainId: string): LibraryDomain | undefined {
  return LIBRARY_CATALOG.find((d) => d.id === domainId);
}

export function searchLibraries(query: string): LibraryEntry[] {
  const q = query.toLowerCase();
  const results: LibraryEntry[] = [];
  for (const domain of LIBRARY_CATALOG) {
    for (const pkg of domain.packages) {
      if (
        pkg.name.toLowerCase().includes(q) ||
        pkg.displayName.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.tags.some((t) => t.includes(q)) ||
        domain.label.toLowerCase().includes(q)
      ) {
        results.push(pkg);
      }
    }
  }
  return results;
}

export function getAllPackages(): LibraryEntry[] {
  return LIBRARY_CATALOG.flatMap((d) => d.packages);
}

export function getPackageJson(domainIds: string[]): string {
  const selected = LIBRARY_CATALOG.filter((d) => domainIds.includes(d.id));
  const deps: Record<string, string> = {};
  for (const domain of selected) {
    for (const pkg of domain.packages) {
      if (!pkg.backendOnly) {
        deps[pkg.name] = "latest";
      }
    }
  }
  return JSON.stringify({ dependencies: deps }, null, 2);
}

export function getInstallCommands(domainIds: string[]): string[] {
  const selected = LIBRARY_CATALOG.filter((d) => domainIds.includes(d.id));
  return [...new Set(selected.flatMap((d) => d.packages.map((p) => p.install)))];
}

export function getCatalogStats(): { totalDomains: number; totalPackages: number; reactPackages: number; serverPackages: number } {
  const all = getAllPackages();
  return {
    totalDomains: LIBRARY_CATALOG.length,
    totalPackages: all.length,
    reactPackages: all.filter((p) => p.reactOnly).length,
    serverPackages: all.filter((p) => p.backendOnly).length,
  };
}
