/**
 * Republic Template Registry — Massive Template Catalog
 *
 * 40+ production-ready templates with:
 * • Multi-theme (dark/light/system) via CSS custom properties
 * • Full i18n with RTL + Arabic support
 * • Responsive (mobile/tablet/desktop)
 * • Supabase + Docker ready
 * • Citizen customization system
 */

import type { ProjectStack, ProjectTemplate } from "./dev-orchestration.js";

// ─── Standard File Sets ────────────────────────────────────────

const THEME_FILES = [
  { path: "src/lib/theme.ts", language: "typescript", loc: 60 },
  { path: "src/styles/themes/light.css", language: "css", loc: 40 },
  { path: "src/styles/themes/dark.css", language: "css", loc: 40 },
];

const I18N_FILES = [
  { path: "src/lib/i18n.ts", language: "typescript", loc: 80 },
  { path: "src/locales/en.json", language: "json", loc: 50 },
  { path: "src/locales/ar.json", language: "json", loc: 50 },
  { path: "src/locales/es.json", language: "json", loc: 50 },
  { path: "src/locales/fr.json", language: "json", loc: 50 },
  { path: "src/locales/de.json", language: "json", loc: 50 },
  { path: "src/locales/zh.json", language: "json", loc: 50 },
  { path: "src/locales/ja.json", language: "json", loc: 50 },
];

const CONFIG_FILES = [
  { path: "package.json", language: "json", loc: 45 },
  { path: "tsconfig.json", language: "json", loc: 25 },
  { path: "tailwind.config.ts", language: "typescript", loc: 30 },
  { path: "next.config.mjs", language: "javascript", loc: 20 },
  { path: ".env.example", language: "text", loc: 15 },
  { path: "README.md", language: "markdown", loc: 60 },
];

const INFRA_FILES = [
  { path: "Dockerfile", language: "dockerfile", loc: 30 },
  { path: "docker-compose.yml", language: "yaml", loc: 45 },
  { path: ".dockerignore", language: "text", loc: 10 },
  { path: ".github/workflows/ci.yml", language: "yaml", loc: 40 },
  { path: "supabase/config.toml", language: "toml", loc: 30 },
  { path: "supabase/migrations/0001_init.sql", language: "sql", loc: 80 },
  { path: "supabase/seed.sql", language: "sql", loc: 20 },
  { path: "src/lib/supabase.ts", language: "typescript", loc: 50 },
];

const PWA_FILES = [
  { path: "public/manifest.json", language: "json", loc: 25 },
  { path: "public/sw.js", language: "javascript", loc: 80 },
  { path: "src/lib/sw-register.ts", language: "typescript", loc: 30 },
  { path: "src/hooks/usePWA.ts", language: "typescript", loc: 40 },
  { path: "src/components/InstallPrompt.tsx", language: "typescript", loc: 45 },
];

const LAYOUT_SHELL = [
  { path: "src/app/layout.tsx", language: "typescript", loc: 55 },
  { path: "src/app/globals.css", language: "css", loc: 80 },
  { path: "src/app/loading.tsx", language: "typescript", loc: 20 },
  { path: "src/app/error.tsx", language: "typescript", loc: 30 },
  { path: "src/app/not-found.tsx", language: "typescript", loc: 25 },
  { path: "src/components/Navbar.tsx", language: "typescript", loc: 65 },
  { path: "src/components/Footer.tsx", language: "typescript", loc: 40 },
  { path: "src/components/ThemeToggle.tsx", language: "typescript", loc: 35 },
  { path: "src/components/LocaleSwitcher.tsx", language: "typescript", loc: 40 },
];

const AUTH_FILES = [
  { path: "src/app/auth/login/page.tsx", language: "typescript", loc: 80 },
  { path: "src/app/auth/signup/page.tsx", language: "typescript", loc: 75 },
  { path: "src/app/auth/forgot-password/page.tsx", language: "typescript", loc: 50 },
  { path: "src/app/auth/callback/route.ts", language: "typescript", loc: 25 },
  { path: "src/components/AuthForm.tsx", language: "typescript", loc: 70 },
  { path: "src/hooks/useAuth.ts", language: "typescript", loc: 50 },
  { path: "src/middleware.ts", language: "typescript", loc: 35 },
];

const fullStack = (l: string[] = ["typescript","css","sql"]): ProjectStack => ({
  languages: l,
  frameworks: ["nextjs", "tailwind", "react"],
  databases: ["postgres", "supabase"],
  infrastructure: ["docker", "supabase", "github-actions"],
});

function t(
  id: string, name: string, desc: string, type: string,
  stack: ProjectStack, specificFiles: { path: string; language: string; loc: number }[],
  mins: number, opts?: { pwa?: boolean },
): ProjectTemplate {
  return {
    id, name, description: desc,
    projectType: type as ProjectTemplate["projectType"],
    stack,
    files: [
      ...LAYOUT_SHELL, ...THEME_FILES, ...I18N_FILES,
      ...CONFIG_FILES, ...INFRA_FILES,
      ...(opts?.pwa ? PWA_FILES : []),
      ...specificFiles,
    ],
    estimatedSetupMinutes: mins,
  };
}

// ─── MASSIVE TEMPLATE CATALOG ──────────────────────────────────

export const EXTENDED_TEMPLATES: ProjectTemplate[] = [

  // ═══════════════════════════════════════════════════════════════
  // E-COMMERCE (5 variants)
  // ═══════════════════════════════════════════════════════════════

  t("ecom-storefront", "E-Commerce Storefront", "Full online store with cart, checkout, payments", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/products/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/products/[id]/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/cart/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/checkout/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/orders/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/api/stripe/route.ts", language: "typescript", loc: 45 },
    { path: "src/components/ProductCard.tsx", language: "typescript", loc: 55 },
    { path: "src/components/CartDrawer.tsx", language: "typescript", loc: 65 },
    { path: "src/components/CheckoutForm.tsx", language: "typescript", loc: 80 },
    { path: "src/hooks/useCart.ts", language: "typescript", loc: 60 },
    { path: "src/lib/stripe.ts", language: "typescript", loc: 30 },
    ...AUTH_FILES,
  ], 12),

  t("ecom-marketplace", "Marketplace Platform", "Multi-vendor marketplace with seller dashboards", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/explore/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/product/[id]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/seller/dashboard/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/seller/products/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/seller/analytics/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/buyer/orders/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/VendorCard.tsx", language: "typescript", loc: 45 },
    { path: "src/components/ReviewStars.tsx", language: "typescript", loc: 30 },
    { path: "src/components/SearchFilters.tsx", language: "typescript", loc: 55 },
    ...AUTH_FILES,
  ], 15),

  t("ecom-digital", "Digital Product Store", "Sell downloadable files, courses, licenses", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/library/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/product/[id]/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/download/[id]/route.ts", language: "typescript", loc: 40 },
    { path: "src/app/licenses/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/DownloadButton.tsx", language: "typescript", loc: 35 },
    { path: "src/components/LicenseKey.tsx", language: "typescript", loc: 40 },
    { path: "src/lib/downloads.ts", language: "typescript", loc: 45 },
    ...AUTH_FILES,
  ], 10),

  t("ecom-subscription", "Subscription Box", "Recurring subscription service with billing", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/plans/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/account/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/account/billing/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/api/webhooks/stripe/route.ts", language: "typescript", loc: 50 },
    { path: "src/components/PricingTable.tsx", language: "typescript", loc: 60 },
    { path: "src/components/SubscriptionCard.tsx", language: "typescript", loc: 45 },
    { path: "src/hooks/useSubscription.ts", language: "typescript", loc: 50 },
    ...AUTH_FILES,
  ], 10),

  t("ecom-restaurant", "Restaurant Ordering", "Online food ordering with real-time tracking", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/menu/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/order/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/track/[id]/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/MenuItem.tsx", language: "typescript", loc: 50 },
    { path: "src/components/OrderTracker.tsx", language: "typescript", loc: 55 },
    { path: "src/components/CategoryNav.tsx", language: "typescript", loc: 35 },
    { path: "src/hooks/useOrder.ts", language: "typescript", loc: 55 },
    ...AUTH_FILES,
  ], 10, { pwa: true }),

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARDS & ADMIN PANELS (5 variants)
  // ═══════════════════════════════════════════════════════════════

  t("dash-analytics", "Analytics Dashboard", "Real-time analytics with charts and KPIs", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/dashboard/page.tsx", language: "typescript", loc: 100 },
    { path: "src/app/dashboard/layout.tsx", language: "typescript", loc: 50 },
    { path: "src/app/reports/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/settings/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/KPICard.tsx", language: "typescript", loc: 40 },
    { path: "src/components/Chart.tsx", language: "typescript", loc: 65 },
    { path: "src/components/DataTable.tsx", language: "typescript", loc: 80 },
    { path: "src/components/Sidebar.tsx", language: "typescript", loc: 55 },
    { path: "src/components/DateRangePicker.tsx", language: "typescript", loc: 50 },
    { path: "src/hooks/useAnalytics.ts", language: "typescript", loc: 45 },
    ...AUTH_FILES,
  ], 10),

  t("dash-crm", "CRM Dashboard", "Customer relationship management with pipeline", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/contacts/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/contacts/[id]/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/pipeline/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/deals/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/tasks/page.tsx", language: "typescript", loc: 65 },
    { path: "src/components/ContactCard.tsx", language: "typescript", loc: 45 },
    { path: "src/components/KanbanBoard.tsx", language: "typescript", loc: 80 },
    { path: "src/components/DealTimeline.tsx", language: "typescript", loc: 55 },
    ...AUTH_FILES,
  ], 12),

  t("dash-cms", "Content Management System", "Headless CMS with WYSIWYG editor", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/posts/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/posts/[id]/edit/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/media/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/categories/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/RichEditor.tsx", language: "typescript", loc: 100 },
    { path: "src/components/MediaGallery.tsx", language: "typescript", loc: 70 },
    { path: "src/components/ContentTree.tsx", language: "typescript", loc: 55 },
    { path: "src/app/api/upload/route.ts", language: "typescript", loc: 40 },
    ...AUTH_FILES,
  ], 12),

  t("dash-project", "Project Management", "Kanban boards, sprints, and team management", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/projects/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/projects/[id]/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/projects/[id]/board/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/projects/[id]/timeline/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/team/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/TaskCard.tsx", language: "typescript", loc: 50 },
    { path: "src/components/SprintBoard.tsx", language: "typescript", loc: 80 },
    { path: "src/components/GanttChart.tsx", language: "typescript", loc: 70 },
    ...AUTH_FILES,
  ], 12),

  t("dash-inventory", "Inventory Manager", "Stock tracking, suppliers, purchase orders", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/inventory/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/suppliers/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/orders/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/reports/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/StockTable.tsx", language: "typescript", loc: 75 },
    { path: "src/components/BarcodeScan.tsx", language: "typescript", loc: 50 },
    { path: "src/components/AlertBadge.tsx", language: "typescript", loc: 30 },
    ...AUTH_FILES,
  ], 10),

  // ═══════════════════════════════════════════════════════════════
  // SOCIAL & COMMUNITY (4 variants)
  // ═══════════════════════════════════════════════════════════════

  t("social-feed", "Social Feed App", "Twitter/X-style social feed with posts and follows", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/feed/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/profile/[id]/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/explore/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/notifications/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/PostCard.tsx", language: "typescript", loc: 60 },
    { path: "src/components/ComposeBox.tsx", language: "typescript", loc: 50 },
    { path: "src/components/UserAvatar.tsx", language: "typescript", loc: 30 },
    { path: "src/components/TrendingTags.tsx", language: "typescript", loc: 40 },
    { path: "src/hooks/useFeed.ts", language: "typescript", loc: 50 },
    ...AUTH_FILES,
  ], 12, { pwa: true }),

  t("social-chat", "Real-Time Chat", "Messaging app with channels and direct messages", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/chat/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/chat/[id]/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/channels/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/MessageBubble.tsx", language: "typescript", loc: 45 },
    { path: "src/components/ChatInput.tsx", language: "typescript", loc: 55 },
    { path: "src/components/ChannelList.tsx", language: "typescript", loc: 50 },
    { path: "src/components/OnlineIndicator.tsx", language: "typescript", loc: 25 },
    { path: "src/hooks/useRealtime.ts", language: "typescript", loc: 60 },
    ...AUTH_FILES,
  ], 12, { pwa: true }),

  t("social-forum", "Community Forum", "Discussion forum with threads and categories", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/forums/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/forums/[category]/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/thread/[id]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/new-thread/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/ThreadCard.tsx", language: "typescript", loc: 45 },
    { path: "src/components/ReplyEditor.tsx", language: "typescript", loc: 65 },
    { path: "src/components/VoteButtons.tsx", language: "typescript", loc: 30 },
    ...AUTH_FILES,
  ], 10),

  t("social-events", "Event Platform", "Event discovery, RSVP, and ticketing", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/events/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/events/[id]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/create-event/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/my-tickets/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/EventCard.tsx", language: "typescript", loc: 50 },
    { path: "src/components/EventMap.tsx", language: "typescript", loc: 45 },
    { path: "src/components/TicketQR.tsx", language: "typescript", loc: 35 },
    ...AUTH_FILES,
  ], 10),

  // ═══════════════════════════════════════════════════════════════
  // PWA TEMPLATES (5 variants)
  // ═══════════════════════════════════════════════════════════════

  t("pwa-notes", "PWA Notes App", "Offline-first note-taking with sync", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/notes/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/notes/[id]/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/offline/page.tsx", language: "typescript", loc: 30 },
    { path: "src/components/NoteEditor.tsx", language: "typescript", loc: 75 },
    { path: "src/components/NoteList.tsx", language: "typescript", loc: 50 },
    { path: "src/components/SearchBar.tsx", language: "typescript", loc: 35 },
    { path: "src/hooks/useOfflineSync.ts", language: "typescript", loc: 60 },
    { path: "src/lib/idb-store.ts", language: "typescript", loc: 50 },
    ...AUTH_FILES,
  ], 8, { pwa: true }),

  t("pwa-fitness", "PWA Fitness Tracker", "Workout logging with offline support", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/workouts/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/exercises/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/stats/page.tsx", language: "typescript", loc: 65 },
    { path: "src/components/WorkoutCard.tsx", language: "typescript", loc: 50 },
    { path: "src/components/ExerciseTimer.tsx", language: "typescript", loc: 55 },
    { path: "src/components/ProgressChart.tsx", language: "typescript", loc: 60 },
    { path: "src/components/BottomNav.tsx", language: "typescript", loc: 45 },
    { path: "src/hooks/useTimer.ts", language: "typescript", loc: 40 },
    ...AUTH_FILES,
  ], 8, { pwa: true }),

  t("pwa-weather", "PWA Weather App", "Weather forecasts with location and offline caching", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/forecast/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/cities/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/WeatherCard.tsx", language: "typescript", loc: 50 },
    { path: "src/components/HourlyForecast.tsx", language: "typescript", loc: 45 },
    { path: "src/components/WeatherIcon.tsx", language: "typescript", loc: 30 },
    { path: "src/hooks/useGeolocation.ts", language: "typescript", loc: 35 },
    { path: "src/lib/weather-api.ts", language: "typescript", loc: 40 },
    ...AUTH_FILES,
  ], 7, { pwa: true }),

  t("pwa-recipes", "PWA Recipe Book", "Cooking recipes with offline access and timers", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/recipes/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/recipes/[id]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/favorites/page.tsx", language: "typescript", loc: 50 },
    { path: "src/app/meal-plan/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/RecipeCard.tsx", language: "typescript", loc: 50 },
    { path: "src/components/CookingTimer.tsx", language: "typescript", loc: 45 },
    { path: "src/components/IngredientList.tsx", language: "typescript", loc: 35 },
    ...AUTH_FILES,
  ], 8, { pwa: true }),

  t("pwa-budget", "PWA Budget Tracker", "Personal finance with offline expense tracking", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/transactions/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/budgets/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/reports/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/TransactionRow.tsx", language: "typescript", loc: 40 },
    { path: "src/components/BudgetBar.tsx", language: "typescript", loc: 35 },
    { path: "src/components/SpendingChart.tsx", language: "typescript", loc: 55 },
    { path: "src/components/QuickAdd.tsx", language: "typescript", loc: 45 },
    ...AUTH_FILES,
  ], 8, { pwa: true }),

  // ═══════════════════════════════════════════════════════════════
  // PORTFOLIO & LANDING (4 variants)
  // ═══════════════════════════════════════════════════════════════

  t("portfolio-dev", "Developer Portfolio", "Personal portfolio for developers", "software", fullStack(["typescript","css"]), [
    { path: "src/app/page.tsx", language: "typescript", loc: 100 },
    { path: "src/app/projects/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/blog/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/contact/page.tsx", language: "typescript", loc: 50 },
    { path: "src/components/Hero.tsx", language: "typescript", loc: 65 },
    { path: "src/components/ProjectGrid.tsx", language: "typescript", loc: 55 },
    { path: "src/components/SkillBadge.tsx", language: "typescript", loc: 30 },
    { path: "src/components/ContactForm.tsx", language: "typescript", loc: 50 },
    { path: "src/components/AnimatedSection.tsx", language: "typescript", loc: 40 },
  ], 6),

  t("landing-saas", "SaaS Landing Page", "Marketing landing page with pricing and CTA", "software", fullStack(["typescript","css"]), [
    { path: "src/app/page.tsx", language: "typescript", loc: 120 },
    { path: "src/app/pricing/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/features/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/about/page.tsx", language: "typescript", loc: 50 },
    { path: "src/components/Hero.tsx", language: "typescript", loc: 70 },
    { path: "src/components/FeatureGrid.tsx", language: "typescript", loc: 60 },
    { path: "src/components/PricingTable.tsx", language: "typescript", loc: 65 },
    { path: "src/components/Testimonials.tsx", language: "typescript", loc: 55 },
    { path: "src/components/CTABanner.tsx", language: "typescript", loc: 35 },
    { path: "src/components/FAQ.tsx", language: "typescript", loc: 50 },
  ], 5),

  t("landing-agency", "Agency Website", "Creative agency with portfolio showcase", "software", fullStack(["typescript","css"]), [
    { path: "src/app/page.tsx", language: "typescript", loc: 100 },
    { path: "src/app/work/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/work/[id]/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/services/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/team/page.tsx", language: "typescript", loc: 55 },
    { path: "src/app/contact/page.tsx", language: "typescript", loc: 50 },
    { path: "src/components/CaseStudy.tsx", language: "typescript", loc: 55 },
    { path: "src/components/TeamMember.tsx", language: "typescript", loc: 40 },
    { path: "src/components/ParallaxHero.tsx", language: "typescript", loc: 50 },
  ], 6),

  t("landing-product", "Product Launch", "Product launch page with waitlist and demo", "software", fullStack(["typescript","css"]), [
    { path: "src/app/page.tsx", language: "typescript", loc: 110 },
    { path: "src/app/demo/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/changelog/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/WaitlistForm.tsx", language: "typescript", loc: 50 },
    { path: "src/components/FeatureShowcase.tsx", language: "typescript", loc: 60 },
    { path: "src/components/VideoPlayer.tsx", language: "typescript", loc: 45 },
    { path: "src/components/CountdownTimer.tsx", language: "typescript", loc: 40 },
    ...AUTH_FILES,
  ], 5),

  // ═══════════════════════════════════════════════════════════════
  // SAAS PLATFORMS (4 variants)
  // ═══════════════════════════════════════════════════════════════

  t("saas-multitenant", "Multi-Tenant SaaS", "SaaS with organization management and billing", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/dashboard/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/org/settings/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/org/members/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/org/billing/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/api/webhooks/billing/route.ts", language: "typescript", loc: 45 },
    { path: "src/components/OrgSwitcher.tsx", language: "typescript", loc: 50 },
    { path: "src/components/InviteModal.tsx", language: "typescript", loc: 45 },
    { path: "src/components/UsageChart.tsx", language: "typescript", loc: 55 },
    { path: "src/hooks/useOrg.ts", language: "typescript", loc: 50 },
    ...AUTH_FILES,
  ], 14),

  t("saas-api", "API Platform", "Developer API platform with docs and keys", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/dashboard/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/api-keys/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/docs/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/usage/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/playground/page.tsx", language: "typescript", loc: 75 },
    { path: "src/components/CodeBlock.tsx", language: "typescript", loc: 50 },
    { path: "src/components/APITester.tsx", language: "typescript", loc: 65 },
    { path: "src/components/UsageMeter.tsx", language: "typescript", loc: 40 },
    ...AUTH_FILES,
  ], 12),

  t("saas-ai", "AI SaaS Platform", "AI-powered SaaS with chat, image gen, analytics", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/chat/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/generate/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/history/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/api/ai/chat/route.ts", language: "typescript", loc: 55 },
    { path: "src/app/api/ai/generate/route.ts", language: "typescript", loc: 50 },
    { path: "src/components/ChatMessage.tsx", language: "typescript", loc: 45 },
    { path: "src/components/PromptInput.tsx", language: "typescript", loc: 55 },
    { path: "src/components/GeneratedImage.tsx", language: "typescript", loc: 40 },
    { path: "src/hooks/useStreaming.ts", language: "typescript", loc: 50 },
    ...AUTH_FILES,
  ], 12),

  t("saas-lms", "Learning Management System", "Online courses with progress tracking", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/courses/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/courses/[id]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/courses/[id]/lesson/[lid]/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/my-learning/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/certificates/page.tsx", language: "typescript", loc: 50 },
    { path: "src/components/CourseCard.tsx", language: "typescript", loc: 50 },
    { path: "src/components/VideoPlayer.tsx", language: "typescript", loc: 60 },
    { path: "src/components/ProgressBar.tsx", language: "typescript", loc: 30 },
    { path: "src/components/QuizForm.tsx", language: "typescript", loc: 65 },
    ...AUTH_FILES,
  ], 12),

  // ═══════════════════════════════════════════════════════════════
  // BLOG & CONTENT (3 variants)
  // ═══════════════════════════════════════════════════════════════

  t("blog-personal", "Personal Blog", "MDX-powered blog with tags and search", "software", fullStack(["typescript","css","markdown"]), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/blog/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/blog/[slug]/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/tags/[tag]/page.tsx", language: "typescript", loc: 55 },
    { path: "src/app/about/page.tsx", language: "typescript", loc: 45 },
    { path: "src/components/PostCard.tsx", language: "typescript", loc: 45 },
    { path: "src/components/MDXContent.tsx", language: "typescript", loc: 50 },
    { path: "src/components/TagCloud.tsx", language: "typescript", loc: 30 },
    { path: "src/components/Newsletter.tsx", language: "typescript", loc: 40 },
    { path: "src/lib/mdx.ts", language: "typescript", loc: 45 },
  ], 6),

  t("blog-magazine", "Online Magazine", "Multi-author magazine with categories", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/[category]/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/article/[slug]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/authors/page.tsx", language: "typescript", loc: 55 },
    { path: "src/app/authors/[id]/page.tsx", language: "typescript", loc: 60 },
    { path: "src/components/FeaturedArticle.tsx", language: "typescript", loc: 55 },
    { path: "src/components/ArticleGrid.tsx", language: "typescript", loc: 50 },
    { path: "src/components/AuthorBio.tsx", language: "typescript", loc: 35 },
    ...AUTH_FILES,
  ], 8),

  t("docs-site", "Documentation Site", "API docs with sidebar navigation and search", "software", fullStack(["typescript","css","markdown"]), [
    { path: "src/app/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/docs/[...slug]/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/api-ref/page.tsx", language: "typescript", loc: 70 },
    { path: "src/components/DocSidebar.tsx", language: "typescript", loc: 60 },
    { path: "src/components/TableOfContents.tsx", language: "typescript", loc: 45 },
    { path: "src/components/CodeBlock.tsx", language: "typescript", loc: 55 },
    { path: "src/components/SearchCommand.tsx", language: "typescript", loc: 50 },
    { path: "src/lib/docs.ts", language: "typescript", loc: 50 },
  ], 7),

  // ═══════════════════════════════════════════════════════════════
  // DEVELOPER TOOLS (3 variants)
  // ═══════════════════════════════════════════════════════════════

  t("tool-monitoring", "System Monitor", "Infrastructure monitoring with alerts", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/services/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/alerts/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/logs/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/metrics/page.tsx", language: "typescript", loc: 80 },
    { path: "src/components/ServiceCard.tsx", language: "typescript", loc: 45 },
    { path: "src/components/UptimeGraph.tsx", language: "typescript", loc: 55 },
    { path: "src/components/AlertRule.tsx", language: "typescript", loc: 50 },
    { path: "src/components/LogViewer.tsx", language: "typescript", loc: 60 },
    ...AUTH_FILES,
  ], 10),

  t("tool-api-explorer", "API Explorer", "Interactive API testing and documentation", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/explorer/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/collections/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/environments/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/RequestBuilder.tsx", language: "typescript", loc: 80 },
    { path: "src/components/ResponseViewer.tsx", language: "typescript", loc: 60 },
    { path: "src/components/CollectionTree.tsx", language: "typescript", loc: 50 },
    { path: "src/components/EnvironmentVars.tsx", language: "typescript", loc: 45 },
    ...AUTH_FILES,
  ], 10),

  t("tool-form-builder", "Form Builder", "Drag-and-drop form builder with submissions", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/forms/page.tsx", language: "typescript", loc: 70 },
    { path: "src/app/forms/[id]/edit/page.tsx", language: "typescript", loc: 90 },
    { path: "src/app/forms/[id]/responses/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/f/[id]/page.tsx", language: "typescript", loc: 70 },
    { path: "src/components/FieldPalette.tsx", language: "typescript", loc: 55 },
    { path: "src/components/FormCanvas.tsx", language: "typescript", loc: 80 },
    { path: "src/components/FieldRenderer.tsx", language: "typescript", loc: 60 },
    { path: "src/hooks/useDragDrop.ts", language: "typescript", loc: 50 },
    ...AUTH_FILES,
  ], 10),

  // ═══════════════════════════════════════════════════════════════
  // HEALTHCARE/EDUCATION/BOOKING (3 variants)
  // ═══════════════════════════════════════════════════════════════

  t("app-healthcare", "Telehealth Platform", "Virtual consultations and medical records", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 40 },
    { path: "src/app/appointments/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/consultation/[id]/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/records/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/prescriptions/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/DoctorCard.tsx", language: "typescript", loc: 45 },
    { path: "src/components/BookingCalendar.tsx", language: "typescript", loc: 65 },
    { path: "src/components/VideoCall.tsx", language: "typescript", loc: 60 },
    ...AUTH_FILES,
  ], 12),

  t("app-booking", "Booking Platform", "Appointment scheduling with calendar", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/services/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/book/[id]/page.tsx", language: "typescript", loc: 75 },
    { path: "src/app/my-bookings/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/provider/dashboard/page.tsx", language: "typescript", loc: 70 },
    { path: "src/components/CalendarPicker.tsx", language: "typescript", loc: 65 },
    { path: "src/components/TimeSlots.tsx", language: "typescript", loc: 50 },
    { path: "src/components/BookingConfirmation.tsx", language: "typescript", loc: 45 },
    ...AUTH_FILES,
  ], 10),

  t("app-quiz", "Quiz & Assessment", "Interactive quizzes with scoring and leaderboards", "software", fullStack(), [
    { path: "src/app/page.tsx", language: "typescript", loc: 80 },
    { path: "src/app/quizzes/page.tsx", language: "typescript", loc: 65 },
    { path: "src/app/quiz/[id]/page.tsx", language: "typescript", loc: 85 },
    { path: "src/app/results/[id]/page.tsx", language: "typescript", loc: 60 },
    { path: "src/app/leaderboard/page.tsx", language: "typescript", loc: 55 },
    { path: "src/components/QuestionCard.tsx", language: "typescript", loc: 60 },
    { path: "src/components/ProgressIndicator.tsx", language: "typescript", loc: 30 },
    { path: "src/components/ScoreBoard.tsx", language: "typescript", loc: 45 },
    { path: "src/hooks/useQuiz.ts", language: "typescript", loc: 55 },
    ...AUTH_FILES,
  ], 8),
];

// ═══════════════════════════════════════════════════════════════
// CITIZEN CUSTOMIZATION SYSTEM
// ═══════════════════════════════════════════════════════════════

export interface TemplateCustomization {
  templateId: string;
  citizenId: string;
  citizenName: string;
  /** Citizen-chosen color palette */
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
  };
  /** Citizen-chosen fonts */
  typography: {
    heading: string;
    body: string;
    mono: string;
  };
  /** Layout preferences */
  layout: "sidebar" | "topnav" | "minimal" | "dashboard";
  /** Default locale */
  defaultLocale: string;
  /** RTL support */
  rtl: boolean;
  /** Default theme */
  defaultTheme: "light" | "dark" | "system";
  /** Additional pages citizen wants */
  extraPages: string[];
  /** Citizen's custom AI prompt for modifications */
  customPrompt: string;
  /** Citizen's design notes */
  designNotes: string;
}

/**
 * Generate a citizen-customized variant of a template.
 * Citizens can tailor every aspect of their project.
 */
export function customizeTemplate(
  base: ProjectTemplate,
  custom: Partial<TemplateCustomization>,
): ProjectTemplate {
  const variant: ProjectTemplate = {
    ...base,
    id: `${base.id}-custom-${Date.now().toString(36)}`,
    name: `${base.name} (Custom)`,
    description: custom.designNotes
      ? `${base.description} — ${custom.designNotes}`
      : base.description,
    files: [...base.files],
  };

  // Add extra pages
  if (custom.extraPages?.length) {
    for (const page of custom.extraPages) {
      const slug = page.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      variant.files.push(
        { path: `src/app/${slug}/page.tsx`, language: "typescript", loc: 60 },
      );
    }
  }

  // Add locale files for non-standard locales
  if (custom.defaultLocale && !["en","ar","es","fr","de","zh","ja"].includes(custom.defaultLocale)) {
    variant.files.push(
      { path: `src/locales/${custom.defaultLocale}.json`, language: "json", loc: 50 },
    );
  }

  return variant;
}

/**
 * Build the citizen's custom AI prompt for template modifications.
 */
export function buildCitizenPrompt(
  template: ProjectTemplate,
  custom: Partial<TemplateCustomization>,
): string {
  const parts: string[] = [
    `Build a ${template.name} application based on "${template.description}".`,
  ];

  if (custom.colorScheme) {
    parts.push(`Use color palette: primary=${custom.colorScheme.primary}, accent=${custom.colorScheme.accent}, bg=${custom.colorScheme.background}.`);
  }
  if (custom.typography) {
    parts.push(`Typography: headings="${custom.typography.heading}", body="${custom.typography.body}".`);
  }
  if (custom.layout) {
    parts.push(`Layout style: ${custom.layout}.`);
  }
  if (custom.defaultLocale) {
    parts.push(`Default locale: ${custom.defaultLocale}.`);
  }
  if (custom.rtl) {
    parts.push(`Must support RTL layout direction for Arabic and Hebrew.`);
  }
  if (custom.defaultTheme) {
    parts.push(`Default theme: ${custom.defaultTheme} mode.`);
  }
  if (custom.extraPages?.length) {
    parts.push(`Additional pages needed: ${custom.extraPages.join(", ")}.`);
  }
  if (custom.customPrompt) {
    parts.push(custom.customPrompt);
  }

  parts.push("Must include: dark/light theme toggle, multi-language support with RTL, fully responsive design, Supabase backend, Docker deployment.");

  return parts.join(" ");
}

/**
 * Find templates matching citizen preferences.
 */
export function findTemplatesForCitizen(
  preferences: {
    category?: string;
    features?: string[];
    isPWA?: boolean;
    hasAuth?: boolean;
    complexity?: "simple" | "medium" | "complex";
  },
): ProjectTemplate[] {
  let candidates = [...EXTENDED_TEMPLATES];

  if (preferences.category) {
    const cat = preferences.category.toLowerCase();
    candidates = candidates.filter(t =>
      t.id.startsWith(cat) || t.name.toLowerCase().includes(cat) ||
      t.description.toLowerCase().includes(cat),
    );
  }

  if (preferences.isPWA) {
    candidates = candidates.filter(t =>
      t.files.some(f => f.path.includes("sw.js") || f.path.includes("manifest")),
    );
  }

  if (preferences.hasAuth) {
    candidates = candidates.filter(t =>
      t.files.some(f => f.path.includes("auth/")),
    );
  }

  if (preferences.complexity === "simple") {
    candidates = candidates.filter(t => t.files.length < 30);
  } else if (preferences.complexity === "complex") {
    candidates = candidates.filter(t => t.files.length >= 35);
  }

  return candidates;
}

/**
 * Get all template categories with counts.
 */
export function getTemplateCategories(): { category: string; count: number; ids: string[] }[] {
  const cats = new Map<string, string[]>();
  for (const t of EXTENDED_TEMPLATES) {
    const prefix = t.id.split("-")[0];
    const category =
      prefix === "ecom" ? "E-Commerce"
      : prefix === "dash" ? "Dashboard"
      : prefix === "social" ? "Social"
      : prefix === "pwa" ? "PWA"
      : prefix === "portfolio" || prefix === "landing" ? "Portfolio & Landing"
      : prefix === "saas" ? "SaaS"
      : prefix === "blog" || prefix === "docs" ? "Content"
      : prefix === "tool" ? "Developer Tools"
      : prefix === "app" ? "Applications"
      : "Other";
    const arr = cats.get(category) ?? [];
    arr.push(t.id);
    cats.set(category, arr);
  }
  return [...cats.entries()].map(([category, ids]) => ({ category, count: ids.length, ids }));
}
