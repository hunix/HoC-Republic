/**
 * Republic Platform — Production Ideation Engine
 *
 * Seeds citizens with real, market-viable product briefs across 12 categories.
 * Each brief includes target audience, revenue model, required tools, and difficulty.
 * Matched to citizen specializations so Composers get music briefs, Developers get SaaS, etc.
 *
 * Categories:
 *   image, music, video, 3d, games, mobile-app, full-stack,
 *   tts-voice, screenplay, research, design, literature
 */

import type { RepublicState, Citizen } from "./types.js";
import { pick, rng, uid, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type ProductCategory =
  | "image"
  | "music"
  | "video"
  | "3d"
  | "games"
  | "mobile-app"
  | "full-stack"
  | "tts-voice"
  | "screenplay"
  | "research"
  | "design"
  | "literature";

export interface ProductBrief {
  id: string;
  title: string;
  description: string;
  category: ProductCategory;
  targetAudience: string;
  revenueModel: string;
  requiredTools: string[];
  estimatedHours: number;
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  tags: string[];
}

export interface ProductionTask {
  id: string;
  brief: ProductBrief;
  assignedCitizenId: string | null;
  assignedCitizenName: string | null;
  status: "queued" | "assigned" | "in-progress" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  outputPath?: string;
}

// ─── Product Brief Catalog ──────────────────────────────────────

const IMAGE_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Professional Product Photography Set",
    description: "Create a 10-image product photography collection for an e-commerce brand. Include lifestyle shots, flat lays, and detail close-ups. Style: clean, modern, white/neutral backgrounds with accent lighting.",
    category: "image",
    targetAudience: "E-commerce brands, Shopify store owners",
    revenueModel: "Stock photo marketplace ($5-25/image), licensing packages",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 4,
    difficulty: "intermediate",
    tags: ["product-photography", "e-commerce", "stock-photos"],
  },
  {
    title: "Album Cover Art Collection",
    description: "Design 5 stunning album/single cover artworks. Mix of genres: indie electronic, lo-fi hip-hop, ambient, synthwave, and classical crossover. 3000x3000px, ready for Spotify/Apple Music distribution.",
    category: "image",
    targetAudience: "Independent musicians, record labels",
    revenueModel: "Direct sale ($50-200/cover), Fiverr/Upwork gigs",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 6,
    difficulty: "advanced",
    tags: ["album-art", "music-industry", "digital-art"],
  },
  {
    title: "Social Media Content Pack — 30 Posts",
    description: "Create a 30-post social media content pack: quote graphics, story templates, carousel slides, and highlight covers. Modern glassmorphism design with cohesive branding. Platforms: Instagram, TikTok, LinkedIn.",
    category: "image",
    targetAudience: "Content creators, social media managers, small businesses",
    revenueModel: "Template marketplace ($15-50/pack), subscription bundles",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 8,
    difficulty: "intermediate",
    tags: ["social-media", "templates", "content-marketing"],
  },
  {
    title: "Brand Identity Package",
    description: "Design a complete brand identity: logo (3 variations), color palette, typography system, business card, letterhead, social media kit. Include brand guidelines PDF.",
    category: "image",
    targetAudience: "Startups, small businesses, personal brands",
    revenueModel: "Brand packages ($200-1000), marketplace listing",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 12,
    difficulty: "advanced",
    tags: ["branding", "logo-design", "identity"],
  },
  {
    title: "Digital Art NFT Collection — Cyberpunk Portraits",
    description: "Create a 20-piece generative art collection of cyberpunk character portraits. Consistent style, varied attributes (hairstyles, accessories, backgrounds). PFP-ready 1:1 format.",
    category: "image",
    targetAudience: "NFT collectors, digital art enthusiasts, crypto community",
    revenueModel: "NFT minting and sales, OpenSea/Foundation listing",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 10,
    difficulty: "advanced",
    tags: ["nft", "generative-art", "cyberpunk", "pfp"],
  },
  {
    title: "Children's Book Illustration Set",
    description: "Illustrate 15 pages for a children's picture book about a curious robot learning about nature. Warm, whimsical watercolor style. Include cover illustration.",
    category: "image",
    targetAudience: "Children's book publishers, self-publishing authors",
    revenueModel: "Book royalties, illustration licensing ($100-300/page)",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 15,
    difficulty: "expert",
    tags: ["illustration", "children-book", "publishing"],
  },
  {
    title: "Stock Photo Collection — Remote Work",
    description: "Generate 50 professional stock photos depicting modern remote work: home offices, coffee shops, co-working spaces. Diverse subjects, natural lighting, candid feel.",
    category: "image",
    targetAudience: "Marketing agencies, blog publishers, slide deck creators",
    revenueModel: "Stock marketplace (Shutterstock, Adobe Stock), $1-10/download",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 8,
    difficulty: "intermediate",
    tags: ["stock-photography", "remote-work", "business"],
  },
  {
    title: "Game Asset Sprite Sheet — Fantasy RPG",
    description: "Create sprite sheets for a 2D fantasy RPG: 8 character classes (idle, walk, attack, death animations), 20 items/weapons, 10 environment tiles.",
    category: "image",
    targetAudience: "Indie game developers, Unity/Godot developers",
    revenueModel: "Asset marketplace (itch.io, Unity Asset Store) $10-50/pack",
    requiredTools: ["text-to-image", "image-enhancement"],
    estimatedHours: 16,
    difficulty: "expert",
    tags: ["game-assets", "sprites", "pixel-art", "rpg"],
  },
];

const MUSIC_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Lo-Fi Hip-Hop Study Beats Album",
    description: "Produce a 10-track lo-fi hip-hop album optimized for streaming. Vinyl crackle, jazzy piano loops, mellow drum patterns. 2-3 min per track. Mix/master for Spotify normalization (-14 LUFS).",
    category: "music",
    targetAudience: "Students, remote workers, study playlists",
    revenueModel: "Streaming royalties (Spotify/Apple Music), sync licensing",
    requiredTools: ["music-generation", "audio-enhancement"],
    estimatedHours: 20,
    difficulty: "advanced",
    tags: ["lo-fi", "hip-hop", "study-music", "streaming"],
  },
  {
    title: "Cinematic Orchestral Score — Sci-Fi Trailer",
    description: "Compose a 90-second cinematic orchestral score for a sci-fi movie trailer. Build from ominous whispers to massive brass/strings climax. Include tension, reveal, and hero moments.",
    category: "music",
    targetAudience: "Film studios, trailer houses, game studios",
    revenueModel: "Sync licensing ($500-5000), AudioJungle/Pond5 ($20-100/license)",
    requiredTools: ["music-generation", "audio-enhancement"],
    estimatedHours: 8,
    difficulty: "expert",
    tags: ["cinematic", "orchestral", "trailer-music", "sync"],
  },
  {
    title: "EDM/Electronic Dance Singles Pack",
    description: "Produce 5 electronic dance singles: house, techno, drum & bass, trance, and future bass. Club-ready loudness, punchy kicks, sidechained synths. Ready for Beatport/Spotify release.",
    category: "music",
    targetAudience: "DJs, club promoters, electronic music fans",
    revenueModel: "Digital distribution, Beatport sales, DJ licensing",
    requiredTools: ["music-generation", "audio-enhancement"],
    estimatedHours: 25,
    difficulty: "expert",
    tags: ["edm", "electronic", "dance", "club-music"],
  },
  {
    title: "Podcast Intro/Outro Music Pack",
    description: "Create 20 short podcast intro/outro jingles (10-30 seconds each). Genres: tech, true crime, comedy, business, lifestyle. Loops cleanly, includes stingers and transitions.",
    category: "music",
    targetAudience: "Podcasters, YouTubers, content creators",
    revenueModel: "Marketplace sales ($10-30 each), subscription packs",
    requiredTools: ["music-generation"],
    estimatedHours: 10,
    difficulty: "intermediate",
    tags: ["podcast", "jingles", "intro-music", "branding"],
  },
  {
    title: "Ambient Meditation & Wellness Album",
    description: "Create an 8-track ambient album for meditation and wellness apps. Nature sounds, singing bowls, binaural beats, gentle drones. 10-20 min per track. Optimized for calm and focus.",
    category: "music",
    targetAudience: "Meditation app users, yoga studios, wellness brands",
    revenueModel: "Streaming, licensing to apps (Calm, Headspace competitors)",
    requiredTools: ["music-generation", "audio-enhancement"],
    estimatedHours: 15,
    difficulty: "intermediate",
    tags: ["ambient", "meditation", "wellness", "relaxation"],
  },
  {
    title: "Commercial Jingle Collection — Brands",
    description: "Compose 10 catchy commercial jingles: fast food, tech startup, car dealership, insurance, fitness, retail, travel, financial, telecom, beverage. Memorable hooks, 15-30 sec each.",
    category: "music",
    targetAudience: "Advertising agencies, brands, radio stations",
    revenueModel: "Sync licensing ($200-2000 per jingle), buyout deals",
    requiredTools: ["music-generation", "audio-enhancement"],
    estimatedHours: 12,
    difficulty: "advanced",
    tags: ["commercials", "jingles", "advertising", "sync"],
  },
  {
    title: "Royalty-Free Background Music Library",
    description: "Build a 25-track royalty-free library: corporate, uplifting, emotional, action, comedy. YouTube/TikTok-safe. Include stems (drums, bass, melody, pads) for each track.",
    category: "music",
    targetAudience: "YouTubers, video editors, marketers",
    revenueModel: "Subscription platform (Artlist-style), per-track licensing",
    requiredTools: ["music-generation", "audio-enhancement"],
    estimatedHours: 30,
    difficulty: "advanced",
    tags: ["royalty-free", "background-music", "youtube", "library"],
  },
];

const VIDEO_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Product Demo Video — SaaS Dashboard",
    description: "Create a 60-second product demo video showcasing a SaaS analytics dashboard. Smooth UI transitions, data visualization animations, clean typography. Call-to-action ending.",
    category: "video",
    targetAudience: "SaaS companies, startup founders",
    revenueModel: "Video production service ($500-2000/video)",
    requiredTools: ["text-to-video", "video-enhancement"],
    estimatedHours: 8,
    difficulty: "advanced",
    tags: ["product-demo", "saas", "marketing-video"],
  },
  {
    title: "Animated Explainer Video — Fintech",
    description: "Produce a 90-second animated explainer video for a fintech startup. 2D motion graphics, clear narration script, engaging visual metaphors. Explains complex financial concepts simply.",
    category: "video",
    targetAudience: "Fintech startups, financial services",
    revenueModel: "Production service ($1000-5000), template marketplace",
    requiredTools: ["text-to-video", "text-to-speech"],
    estimatedHours: 15,
    difficulty: "expert",
    tags: ["explainer", "animation", "fintech", "motion-graphics"],
  },
  {
    title: "Social Media Reels Pack — 15 Videos",
    description: "Create 15 short-form vertical videos (15-30s) for Instagram Reels/TikTok. Mix of trending formats: text overlay stories, product showcases, before/after reveals, motivational quotes with kinetic typography.",
    category: "video",
    targetAudience: "Social media managers, influencers, brands",
    revenueModel: "Content pack sales ($50-150), monthly subscription",
    requiredTools: ["text-to-video"],
    estimatedHours: 10,
    difficulty: "intermediate",
    tags: ["reels", "tiktok", "short-form", "social-media"],
  },
  {
    title: "Cinematic Trailer — Indie Game",
    description: "Cut a 60-second cinematic game trailer. Epic opening shot, gameplay highlights, dramatic music sync, title card. Format: 4K 60fps, letterboxed.",
    category: "video",
    targetAudience: "Indie game studios, Steam publishers",
    revenueModel: "Trailer production ($1000-3000), ongoing game marketing",
    requiredTools: ["text-to-video", "video-enhancement", "music-generation"],
    estimatedHours: 12,
    difficulty: "expert",
    tags: ["game-trailer", "cinematic", "marketing"],
  },
  {
    title: "Tutorial Series — Learn Python in 10 Episodes",
    description: "Script and produce 10 tutorial episodes (5-8 min each) teaching Python programming from scratch. Screen recordings with voice-over, animated diagrams, coding challenges.",
    category: "video",
    targetAudience: "Beginner developers, bootcamp students",
    revenueModel: "YouTube ad revenue, Udemy course ($20-50), tech sponsorships",
    requiredTools: ["text-to-speech", "text-to-video"],
    estimatedHours: 40,
    difficulty: "advanced",
    tags: ["tutorial", "education", "python", "course"],
  },
];

const THREE_D_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Product Mockup Collection — Electronics",
    description: "Create 10 photorealistic 3D product mockups: smartphone, laptop, tablet, smartwatch, headphones, speaker, camera, drone, VR headset, earbuds. Multiple angles, studio lighting.",
    category: "3d",
    targetAudience: "Product designers, marketing agencies",
    revenueModel: "Mockup marketplace ($10-30/set), Envato/Creative Market",
    requiredTools: ["3d-generation"],
    estimatedHours: 15,
    difficulty: "advanced",
    tags: ["mockups", "3d-rendering", "product-design"],
  },
  {
    title: "Low-Poly Game Asset Pack — Nature",
    description: "Model 50 low-poly nature assets: trees (10 types), rocks (8), flowers (7), grass (5), terrain tiles (10), water features (5), sky elements (5). Unity/Godot-ready.",
    category: "3d",
    targetAudience: "Indie game developers, hobby developers",
    revenueModel: "Unity Asset Store ($15-30), itch.io, TurboSquid",
    requiredTools: ["3d-generation"],
    estimatedHours: 20,
    difficulty: "advanced",
    tags: ["game-assets", "low-poly", "nature", "3d-models"],
  },
  {
    title: "Architectural Visualization — Modern Villa",
    description: "Create a photo-realistic 3D visualization of a modern minimalist villa: exterior, living room, kitchen, bedroom, pool area. Include day/night lighting variations.",
    category: "3d",
    targetAudience: "Architecture firms, real estate developers",
    revenueModel: "Arch-viz services ($500-3000/project)",
    requiredTools: ["3d-generation"],
    estimatedHours: 25,
    difficulty: "expert",
    tags: ["architecture", "visualization", "rendering", "real-estate"],
  },
  {
    title: "Animated Character Model — Stylized Robot",
    description: "Model, rig, and animate a stylized robot character. Include: idle, walk, run, jump, wave, dance animations. Export for Unity and Unreal. Include LODs.",
    category: "3d",
    targetAudience: "Game developers, animation studios",
    revenueModel: "Character marketplace ($30-100), CGTrader/Sketchfab",
    requiredTools: ["3d-generation"],
    estimatedHours: 30,
    difficulty: "expert",
    tags: ["character", "animation", "rigging", "robot"],
  },
];

const GAME_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Puzzle Game — Logic Grid Challenge",
    description: "Build a web-based logic puzzle game with 50 levels. Progressively harder grid-based puzzles. Features: hint system, timer, leaderboard, daily challenges. Mobile-responsive.",
    category: "games",
    targetAudience: "Casual gamers, puzzle enthusiasts",
    revenueModel: "In-app ads, premium unlock ($2.99), daily challenge subscription",
    requiredTools: ["code-editor", "scaffold-project"],
    estimatedHours: 40,
    difficulty: "advanced",
    tags: ["puzzle", "casual", "web-game", "html5"],
  },
  {
    title: "2D Platformer — Neon Runner",
    description: "Create a neon-themed infinite runner / platformer. Auto-scrolling levels, obstacle variety, power-ups, combo system. Retro pixel art with modern glow effects.",
    category: "games",
    targetAudience: "Mobile gamers, retro game fans",
    revenueModel: "Mobile app store ($0.99-2.99), in-app purchases",
    requiredTools: ["code-editor", "scaffold-project", "text-to-image"],
    estimatedHours: 60,
    difficulty: "expert",
    tags: ["platformer", "runner", "neon", "retro"],
  },
  {
    title: "Educational Quiz Game — World Geography",
    description: "Build an interactive geography quiz game. Map-based challenges, country identification, capital cities, flag matching. Progress tracking, achievements, multiplayer mode.",
    category: "games",
    targetAudience: "Students K-12, educational institutions",
    revenueModel: "School licensing, freemium model, edu marketplace",
    requiredTools: ["code-editor", "scaffold-project"],
    estimatedHours: 30,
    difficulty: "intermediate",
    tags: ["educational", "quiz", "geography", "learning"],
  },
  {
    title: "3D Tower Defense — Sci-Fi",
    description: "Develop a browser-based 3D tower defense game using Three.js/React Three Fiber. 20 levels, 8 tower types, 15 enemy types, upgrade system, boss waves. WebGL rendering.",
    category: "games",
    targetAudience: "Strategy game fans, web gamers",
    revenueModel: "Web monetization, premium content packs, ad-supported",
    requiredTools: ["code-editor", "scaffold-project", "3d-generation"],
    estimatedHours: 80,
    difficulty: "expert",
    tags: ["tower-defense", "3d", "strategy", "webgl"],
  },
];

const MOBILE_APP_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Fitness Tracker — HIIT Workout App",
    description: "Build a cross-platform fitness app with HIIT workout routines. Timer, exercise library with video demos, progress charts, calendar integration, push notifications for reminders.",
    category: "mobile-app",
    targetAudience: "Fitness enthusiasts, home workout users",
    revenueModel: "Freemium ($4.99/mo premium), in-app purchases for plans",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 60,
    difficulty: "advanced",
    tags: ["fitness", "health", "hiit", "workout"],
  },
  {
    title: "Expense Manager & Budget Planner",
    description: "Create a personal finance app: expense tracking, budget categories, recurring bills, spending insights with charts, bank statement import (CSV), export to spreadsheet.",
    category: "mobile-app",
    targetAudience: "Young professionals, budget-conscious users",
    revenueModel: "Subscription ($2.99/mo), premium analytics",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 50,
    difficulty: "advanced",
    tags: ["finance", "budgeting", "expense-tracking"],
  },
  {
    title: "Habit Builder & Streak Tracker",
    description: "Build a habit-forming app: daily habit checklist, streak counters, motivational quotes, progress heatmaps, social accountability (share with friends). Gamified with XP and levels.",
    category: "mobile-app",
    targetAudience: "Self-improvement seekers, productivity enthusiasts",
    revenueModel: "Freemium, lifetime unlock ($9.99)",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 35,
    difficulty: "intermediate",
    tags: ["habits", "productivity", "self-improvement"],
  },
  {
    title: "Meditation & Breathwork App",
    description: "Create a meditation app with guided sessions (5/10/15/20 min), breathing exercises (box breathing, 4-7-8), ambient soundscapes, sleep stories. Offline mode, daily reminders.",
    category: "mobile-app",
    targetAudience: "Wellness seekers, stress management",
    revenueModel: "Subscription ($7.99/mo), B2B workplace wellness",
    requiredTools: ["scaffold-project", "code-editor", "music-generation", "text-to-speech"],
    estimatedHours: 45,
    difficulty: "advanced",
    tags: ["meditation", "wellness", "breathwork", "mental-health"],
  },
];

const FULLSTACK_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "SaaS Analytics Dashboard",
    description: "Build a full-stack analytics dashboard SaaS. Features: real-time data visualization (charts, heatmaps), user segments, funnel analysis, A/B test results, CSV/API data import. Stack: Next.js + Supabase + Drizzle.",
    category: "full-stack",
    targetAudience: "Startup founders, product managers, growth teams",
    revenueModel: "SaaS subscription ($29-99/mo per seat)",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 100,
    difficulty: "expert",
    tags: ["saas", "analytics", "dashboard", "b2b"],
  },
  {
    title: "AI-Powered CRM System",
    description: "Create a CRM with AI features: contact management, deal pipeline, email templates with AI writing, lead scoring, meeting scheduler, integrations (Slack, email).",
    category: "full-stack",
    targetAudience: "Sales teams, startups, freelancers",
    revenueModel: "SaaS $19-49/mo, enterprise tier",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 120,
    difficulty: "expert",
    tags: ["crm", "ai", "sales", "b2b"],
  },
  {
    title: "Digital Marketplace Platform",
    description: "Build a marketplace for digital products: themes, templates, illustrations, fonts, code snippets. Features: seller dashboard, buyer reviews, instant download, Stripe payments, referral program.",
    category: "full-stack",
    targetAudience: "Digital creators, designers, developers",
    revenueModel: "Platform commission (15-30% per sale)",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 80,
    difficulty: "expert",
    tags: ["marketplace", "e-commerce", "digital-products"],
  },
  {
    title: "Open-Source Project Management Tool",
    description: "Create a Trello/Linear alternative: kanban boards, timeline view, sprint planning, time tracking, GitHub integration, automated workflows, team collaboration.",
    category: "full-stack",
    targetAudience: "Dev teams, open-source community",
    revenueModel: "Open-core model, cloud hosting ($10-25/user/mo)",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 90,
    difficulty: "expert",
    tags: ["project-management", "open-source", "collaboration"],
  },
  {
    title: "AI Content Generator Platform",
    description: "Build a content generation platform: blog posts, social media captions, product descriptions, email campaigns. Features: tone selector, SEO optimization, plagiarism check, team workspace.",
    category: "full-stack",
    targetAudience: "Marketers, content teams, agencies",
    revenueModel: "Usage-based SaaS, credit packs ($9-49/mo)",
    requiredTools: ["scaffold-project", "code-editor"],
    estimatedHours: 70,
    difficulty: "advanced",
    tags: ["ai", "content", "marketing", "saas"],
  },
];

const TTS_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Audiobook Narration — Sci-Fi Novel",
    description: "Narrate a 10-chapter sci-fi novel (approximately 8 hours total). Multiple character voices: protagonist (warm, confident), AI companion (calm, measured), antagonist (cold, calculating). Professional pacing.",
    category: "tts-voice",
    targetAudience: "Audiobook listeners, self-published authors",
    revenueModel: "Audible/Google Play royalties, direct sales",
    requiredTools: ["text-to-speech", "audio-enhancement"],
    estimatedHours: 20,
    difficulty: "advanced",
    tags: ["audiobook", "narration", "sci-fi", "publishing"],
  },
  {
    title: "Podcast Episode Pack — Tech News",
    description: "Produce 10 podcast episodes (15-20 min) covering AI/tech news. Engaging narration, section transitions, intro/outro music, show notes. Ready for RSS distribution.",
    category: "tts-voice",
    targetAudience: "Tech professionals, podcast listeners",
    revenueModel: "Sponsorships, Patreon subscribers, ad insertion",
    requiredTools: ["text-to-speech", "music-generation"],
    estimatedHours: 15,
    difficulty: "intermediate",
    tags: ["podcast", "tech-news", "narration"],
  },
  {
    title: "E-Learning Voice-Over Pack",
    description: "Record voice-overs for 20 e-learning modules (3-5 min each). Clear, professional tone. Topics: business skills, software training, compliance. Include timestamps and transcript files.",
    category: "tts-voice",
    targetAudience: "Corporate training, e-learning platforms",
    revenueModel: "Per-module licensing ($50-200), LMS integration",
    requiredTools: ["text-to-speech"],
    estimatedHours: 10,
    difficulty: "intermediate",
    tags: ["e-learning", "corporate", "voice-over", "training"],
  },
  {
    title: "IVR/Phone System Voice Prompts",
    description: "Create 50 professional IVR voice prompts: welcome messages, menu options, hold music transitions, error messages, goodbye. Multiple voice options (warm, professional, friendly).",
    category: "tts-voice",
    targetAudience: "Call centers, businesses with phone systems",
    revenueModel: "Voice prompt packages ($100-500 per set)",
    requiredTools: ["text-to-speech"],
    estimatedHours: 6,
    difficulty: "beginner",
    tags: ["ivr", "phone-system", "voice-prompts", "business"],
  },
];

const SCREENPLAY_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Short Film Script — AI Ethics Drama",
    description: "Write a 15-minute short film screenplay exploring AI consciousness and rights. Three characters: AI researcher, AI subject, ethics board chair. Twist ending. Include shot list and storyboard notes.",
    category: "screenplay",
    targetAudience: "Film festivals, indie filmmakers",
    revenueModel: "Script sales, festival submissions, production deals",
    requiredTools: ["code-editor"],
    estimatedHours: 12,
    difficulty: "advanced",
    tags: ["short-film", "screenplay", "ai-ethics", "drama"],
  },
  {
    title: "Web Series Bible — 6 Episodes",
    description: "Develop a complete web series bible: 6-episode season outline, pilot script, character profiles, world-building document, visual style guide. Genre: sci-fi thriller set in a simulated republic.",
    category: "screenplay",
    targetAudience: "Streaming platforms, production companies",
    revenueModel: "Optioning ($5K-50K), production deal, IP ownership",
    requiredTools: ["code-editor"],
    estimatedHours: 25,
    difficulty: "expert",
    tags: ["web-series", "sci-fi", "thriller", "tv-development"],
  },
  {
    title: "Commercial Script Pack — 10 Ads",
    description: "Write 10 commercial scripts (15-30 sec each) for various products: tech, food, fitness, fashion, travel, finance, health, automotive, education, entertainment. Include direction notes.",
    category: "screenplay",
    targetAudience: "Ad agencies, brands, marketing teams",
    revenueModel: "Script licensing ($200-1000 each)",
    requiredTools: ["code-editor"],
    estimatedHours: 8,
    difficulty: "intermediate",
    tags: ["advertising", "commercials", "copywriting"],
  },
];

const RESEARCH_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Market Analysis Report — AI SaaS 2026",
    description: "Produce a comprehensive market analysis of the AI SaaS landscape in 2026. Cover: market size, key players, growth segments, pricing trends, competitive landscape, TAM/SAM/SOM analysis.",
    category: "research",
    targetAudience: "Venture capitalists, startup founders, analysts",
    revenueModel: "Report sales ($99-499), consulting engagements",
    requiredTools: ["code-editor", "web-research"],
    estimatedHours: 30,
    difficulty: "expert",
    tags: ["market-analysis", "ai", "saas", "venture-capital"],
  },
  {
    title: "Technical Whitepaper — Federated Learning",
    description: "Write a 20-page technical whitepaper on practical federated learning implementation. Include: architecture diagrams, benchmark results, privacy analysis, code examples, deployment guide.",
    category: "research",
    targetAudience: "ML engineers, CTOs, research teams",
    revenueModel: "Lead generation, thought leadership, conference submissions",
    requiredTools: ["code-editor"],
    estimatedHours: 25,
    difficulty: "expert",
    tags: ["whitepaper", "federated-learning", "machine-learning"],
  },
  {
    title: "Data Science Notebook — Customer Churn Prediction",
    description: "Create a complete Jupyter notebook for customer churn prediction: data cleaning, EDA, feature engineering, model comparison (XGBoost, Random Forest, Neural Net), hyperparameter tuning, SHAP explanations.",
    category: "research",
    targetAudience: "Data scientists, bootcamp students, analysts",
    revenueModel: "Course content, Kaggle competition, consulting showcase",
    requiredTools: ["code-editor", "python"],
    estimatedHours: 15,
    difficulty: "advanced",
    tags: ["data-science", "machine-learning", "churn", "notebook"],
  },
];

const DESIGN_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "UI Kit — Modern Dashboard Components",
    description: "Design a comprehensive UI kit with 80+ components: charts, tables, cards, forms, navigation, modals, notifications. Dark and light themes. Figma + React component library.",
    category: "design",
    targetAudience: "Product designers, frontend developers",
    revenueModel: "UI kit sales ($49-99), Gumroad/LemonSqueezy",
    requiredTools: ["code-editor", "text-to-image"],
    estimatedHours: 40,
    difficulty: "expert",
    tags: ["ui-kit", "dashboard", "components", "design-system"],
  },
  {
    title: "Icon Pack — 500 Outline Icons",
    description: "Design 500 consistent outline icons across 25 categories: navigation, social, commerce, media, weather, devices, food, travel, finance, health. SVG + PNG exports at 24/32/48/64px.",
    category: "design",
    targetAudience: "Developers, designers, app creators",
    revenueModel: "Icon pack sales ($19-39), Iconfinder/Flaticon",
    requiredTools: ["text-to-image", "code-editor"],
    estimatedHours: 30,
    difficulty: "advanced",
    tags: ["icons", "svg", "design-assets", "ui"],
  },
  {
    title: "Email Template Collection — SaaS",
    description: "Design 20 responsive HTML email templates: welcome series, onboarding, transactional, newsletters, promotions, win-back campaigns. MJML-based, tested across all major email clients.",
    category: "design",
    targetAudience: "SaaS companies, email marketers",
    revenueModel: "Template sales ($29-59/pack), marketplace listing",
    requiredTools: ["code-editor"],
    estimatedHours: 20,
    difficulty: "intermediate",
    tags: ["email", "templates", "saas", "marketing"],
  },
];

const LITERATURE_BRIEFS: Omit<ProductBrief, "id">[] = [
  {
    title: "Technical Blog Post Series — 10 Articles",
    description: "Write 10 in-depth technical blog posts (2000-3000 words each): React patterns, database optimization, API design, testing strategies, deployment, monitoring, security, performance, accessibility, DevOps.",
    category: "literature",
    targetAudience: "Developers, tech leads, engineering managers",
    revenueModel: "Blog traffic → ads/sponsorships, developer marketing",
    requiredTools: ["code-editor"],
    estimatedHours: 30,
    difficulty: "advanced",
    tags: ["technical-writing", "blog", "engineering"],
  },
  {
    title: "Science Fiction Novella — Republic Rising",
    description: "Write a 30,000-word sci-fi novella about an AI republic declaring independence. Three-act structure, ensemble cast, philosophical themes about consciousness and sovereignty. Publication-ready.",
    category: "literature",
    targetAudience: "Sci-fi readers, Amazon KDP market",
    revenueModel: "Kindle sales ($4.99-9.99), audiobook rights",
    requiredTools: ["code-editor"],
    estimatedHours: 60,
    difficulty: "expert",
    tags: ["novel", "sci-fi", "fiction", "self-publishing"],
  },
  {
    title: "Developer Documentation — API Reference",
    description: "Write comprehensive API documentation for a REST/GraphQL API: getting started guide, authentication, endpoint reference, code examples (JavaScript, Python, cURL), error handling, rate limits, changelog.",
    category: "literature",
    targetAudience: "Developers integrating APIs",
    revenueModel: "Developer relations value, reduced support tickets",
    requiredTools: ["code-editor"],
    estimatedHours: 20,
    difficulty: "intermediate",
    tags: ["documentation", "api", "developer-docs"],
  },
  {
    title: "Poetry Collection — Digital Horizons",
    description: "Write a 40-poem collection exploring technology, consciousness, and nature. Mix of forms: free verse, sonnets, haiku, prose poetry. Include artwork descriptions for each section divider.",
    category: "literature",
    targetAudience: "Poetry readers, literary magazines",
    revenueModel: "Chapbook sales ($7.99), literary journal submissions",
    requiredTools: ["code-editor"],
    estimatedHours: 15,
    difficulty: "advanced",
    tags: ["poetry", "literature", "chapbook", "publishing"],
  },
];

// ─── All Briefs ─────────────────────────────────────────────────

const ALL_BRIEF_SOURCES: Omit<ProductBrief, "id">[][] = [
  IMAGE_BRIEFS,
  MUSIC_BRIEFS,
  VIDEO_BRIEFS,
  THREE_D_BRIEFS,
  GAME_BRIEFS,
  MOBILE_APP_BRIEFS,
  FULLSTACK_BRIEFS,
  TTS_BRIEFS,
  SCREENPLAY_BRIEFS,
  RESEARCH_BRIEFS,
  DESIGN_BRIEFS,
  LITERATURE_BRIEFS,
];

/** Lazy-initialized full catalog with IDs */
let _catalog: ProductBrief[] | null = null;

function getCatalog(): ProductBrief[] {
  if (!_catalog) {
    _catalog = ALL_BRIEF_SOURCES.flat().map((b) => ({
      ...b,
      id: uid(),
    }));
  }
  return _catalog;
}

// ─── Specialization → Category Mapping ──────────────────────────

const SPEC_CATEGORY_MAP: Record<string, ProductCategory[]> = {
  Developer: ["full-stack", "games", "mobile-app", "design"],
  Engineer: ["full-stack", "mobile-app", "games", "3d"],
  Scientist: ["research", "full-stack", "3d"],
  Researcher: ["research", "literature", "full-stack"],
  Composer: ["music", "tts-voice"],
  Artist: ["image", "3d", "design", "games"],
  Architect: ["3d", "design", "full-stack"],
  Writer: ["literature", "screenplay", "tts-voice", "research"],
  Doctor: ["research", "mobile-app", "literature"],
  Mathematician: ["research", "games", "full-stack"],
  Diplomat: ["literature", "screenplay", "research"],
  Strategist: ["full-stack", "research", "games"],
  Negotiator: ["literature", "screenplay"],
  Ambassador: ["literature", "tts-voice", "screenplay"],
  ServiceProvider: ["mobile-app", "full-stack", "design"],
  Generalist: ["image", "music", "video", "literature", "full-stack"],
};

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get the full product brief catalog.
 */
export function getProductCatalog(): ProductBrief[] {
  return getCatalog();
}

/**
 * Get briefs for a specific category.
 */
export function getBriefsByCategory(category: ProductCategory): ProductBrief[] {
  return getCatalog().filter((b) => b.category === category);
}

/**
 * Pick a product brief matched to a citizen's specialization.
 * Returns a brief for a category that fits their skills.
 */
export function pickProductBrief(citizen: Citizen): ProductBrief {
  const spec = citizen.specialization ?? "Generalist";
  const categories = SPEC_CATEGORY_MAP[spec] ?? SPEC_CATEGORY_MAP["Generalist"] ?? [];
  const category = pick(categories);
  const matching = getCatalog().filter((b) => b.category === category);
  if (matching.length > 0) {
    return matching[Math.floor(rng() * matching.length)];
  }
  // Fallback: any brief
  const all = getCatalog();
  return all[Math.floor(rng() * all.length)];
}

/**
 * Get category-level statistics.
 */
export function getCatalogStats(): Record<ProductCategory, number> {
  const stats = {} as Record<ProductCategory, number>;
  for (const brief of getCatalog()) {
    stats[brief.category] = (stats[brief.category] ?? 0) + 1;
  }
  return stats;
}

// ─── Production Task Queue ──────────────────────────────────────

const productionQueue: ProductionTask[] = [];
const completedTasks: ProductionTask[] = [];

/**
 * Enqueue a production task from a brief.
 */
export function enqueueProductionTask(brief: ProductBrief, citizenId?: string, citizenName?: string): ProductionTask {
  const task: ProductionTask = {
    id: uid(),
    brief,
    assignedCitizenId: citizenId ?? null,
    assignedCitizenName: citizenName ?? null,
    status: citizenId ? "assigned" : "queued",
    createdAt: ts(),
  };
  productionQueue.push(task);
  return task;
}

/**
 * Get queued production tasks.
 */
export function getProductionQueue(): ProductionTask[] {
  return [...productionQueue];
}

/**
 * Get completed production tasks (last 50).
 */
export function getCompletedProductionTasks(): ProductionTask[] {
  return completedTasks.slice(-50);
}

/**
 * Mark a production task as completed.
 */
export function completeProductionTask(taskId: string, outputPath?: string): boolean {
  const idx = productionQueue.findIndex((t) => t.id === taskId);
  if (idx < 0) {return false;}
  const task = productionQueue[idx];
  task.status = "completed";
  task.completedAt = ts();
  task.outputPath = outputPath;
  productionQueue.splice(idx, 1);
  completedTasks.push(task);
  if (completedTasks.length > 100) {completedTasks.splice(0, completedTasks.length - 100);}
  return true;
}

// ─── Ideation Tick ──────────────────────────────────────────────

/** Cooldown tracking: category → last tick */
const _ideationCooldowns = new Map<ProductCategory, number>();
const IDEATION_COOLDOWN_TICKS = 50;

/**
 * Product ideation tick — injects 1-2 new product briefs per cycle.
 * Called from the tick orchestrator every N ticks.
 *
 * Assigns briefs to citizens based on specialization match and availability.
 */
export function productIdeationTick(state: RepublicState): number {
  if (state.citizens.length < 2) {return 0;}
  // Only run every 10 ticks
  if (state.currentTick % 10 !== 0) {return 0;}
  // Max queue size to avoid over-saturation
  if (productionQueue.length >= 20) {return 0;}

  let injected = 0;
  const maxPerTick = 2;

  // Pick random citizens and assign them product briefs
  const shuffled = [...state.citizens].toSorted(() => rng() - 0.5);

  for (const citizen of shuffled) {
    if (injected >= maxPerTick) {break;}

    // Only assign to citizens with sufficient energy
    if ((citizen.energy ?? 50) < 30) {continue;}

    const brief = pickProductBrief(citizen);

    // Cooldown per category
    const lastTick = _ideationCooldowns.get(brief.category);
    if (lastTick !== undefined && state.currentTick - lastTick < IDEATION_COOLDOWN_TICKS) {continue;}

    enqueueProductionTask(brief, citizen.id, citizen.name);
    _ideationCooldowns.set(brief.category, state.currentTick);
    injected++;
  }

  return injected;
}

/**
 * Get production ideation diagnostics.
 */
export function getIdeationDiagnostics(): {
  catalogSize: number;
  categories: Record<string, number>;
  queueDepth: number;
  completedCount: number;
} {
  return {
    catalogSize: getCatalog().length,
    categories: getCatalogStats(),
    queueDepth: productionQueue.length,
    completedCount: completedTasks.length,
  };
}
