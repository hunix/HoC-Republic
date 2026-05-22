import {
  ShoppingBag,
  Star,
  Search,
  Download,
  X,
  Zap,
  Tag,
  Music,
  Play,
  Pause,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Rocket,
  Globe,
  Gamepad2,
  Film,
  BookOpen,
  Headphones,
  Code2,
  Palette,
  FlaskConical,
  Database,
  Building2,
  ShoppingCart,
  Sparkles,
  Crown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader, Card, Badge, Button, StatCard, RpcStatus } from "@/components/ui";
import { useRpc } from "@/lib/rpc";

const GATEWAY_PORT = window.location.port || "19001";
const GATEWAY_BASE = `${window.location.protocol}//${window.location.hostname}:${GATEWAY_PORT}`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  title: string;
  category?: string;
  type?: string;
  creatorId?: string;
  creatorName?: string;
  creatorNames?: string[];
  description?: string;
  price?: number;
  priceUsd?: number;
  fileSize?: number;
  filePath?: string;
  contentUrl?: string;
  thumbnailUrl?: string;
  tags?: string[];
  rating?: number;
  downloads?: number;
  purchaseCount?: number;
  revenue?: number;
  featured?: boolean;
  status?: string;
}

// ─── Category Config ─────────────────────────────────────────────────────────

const CATEGORIES: Array<{ id: string; label: string; icon: React.ReactNode; color: string }> = [
  { id: "all",          label: "All",         icon: <Sparkles className="w-4 h-4" />,    color: "text-accent" },
  { id: "game",         label: "Games",       icon: <Gamepad2 className="w-4 h-4" />,    color: "text-success" },
  { id: "music",        label: "Music",       icon: <Music className="w-4 h-4" />,       color: "text-info" },
  { id: "cartoon",      label: "Cartoons",    icon: <Film className="w-4 h-4" />,        color: "text-warning" },
  { id: "short-film",  label: "Short Films", icon: <Film className="w-4 h-4" />,        color: "text-danger" },
  { id: "documentary",  label: "Docs",        icon: <Globe className="w-4 h-4" />,       color: "text-purple-400" },
  { id: "art",          label: "Art",         icon: <Palette className="w-4 h-4" />,     color: "text-pink-400" },
  { id: "code",         label: "Code",        icon: <Code2 className="w-4 h-4" />,       color: "text-success" },
  { id: "research",     label: "Research",    icon: <FlaskConical className="w-4 h-4" />, color: "text-info" },
  { id: "course",       label: "Courses",     icon: <BookOpen className="w-4 h-4" />,    color: "text-warning" },
  { id: "ebook",        label: "eBooks",      icon: <BookOpen className="w-4 h-4" />,    color: "text-accent" },
  { id: "podcast",      label: "Podcasts",    icon: <Headphones className="w-4 h-4" />,  color: "text-purple-400" },
  { id: "dataset",      label: "Datasets",    icon: <Database className="w-4 h-4" />,    color: "text-success" },
  { id: "saas",         label: "SaaS",        icon: <Building2 className="w-4 h-4" />,   color: "text-danger" },
  { id: "website",      label: "Websites",    icon: <Globe className="w-4 h-4" />,       color: "text-info" },
];

const CATEGORY_GRADIENTS: Record<string, string> = {
  game:        "from-green-900/40 via-emerald-900/20 to-transparent",
  music:       "from-blue-900/40 via-cyan-900/20 to-transparent",
  cartoon:     "from-yellow-900/40 via-orange-900/20 to-transparent",
  "short-film":"from-red-900/40 via-rose-900/20 to-transparent",
  documentary: "from-purple-900/40 via-violet-900/20 to-transparent",
  art:         "from-pink-900/40 via-fuchsia-900/20 to-transparent",
  code:        "from-green-900/40 via-teal-900/20 to-transparent",
  research:    "from-cyan-900/40 via-sky-900/20 to-transparent",
  saas:        "from-red-900/40 via-orange-900/20 to-transparent",
  all:         "from-violet-900/40 via-purple-900/20 to-transparent",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) { return "—"; }
  if (bytes < 1024) { return `${bytes}B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)}KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatPrice(priceUsd?: number): string {
  if (!priceUsd || priceUsd <= 0) { return "Free"; }
  return `$${priceUsd.toFixed(2)}`;
}

function getCategoryEmoji(cat?: string): string {
  const emojiMap: Record<string, string> = {
    game: "🎮", music: "🎵", cartoon: "🎨", "short-film": "🎬", documentary: "📽️",
    art: "🖼️", code: "💻", research: "🔬", course: "📚", ebook: "📖",
    podcast: "🎙️", dataset: "📊", saas: "⚙️", website: "🌐", model: "🤖",
    video: "📹", "brand-kit": "✨",
  };
  return emojiMap[cat ?? ""] ?? "⭐";
}

function getContentType(listing: Listing): "audio" | "video" | "image" | "download" | "link" {
  const cat = listing.category ?? listing.type ?? "";
  if (["music", "podcast"].includes(cat)) { return "audio"; }
  if (["cartoon", "short-film", "documentary", "video"].includes(cat)) { return "video"; }
  if (cat === "art") { return "image"; }
  return "download";
}

function buildFileUrl(filePath?: string, contentUrl?: string): string | null {
  if (contentUrl) { return contentUrl; }
  if (filePath) { return `${GATEWAY_BASE}/download?path=${encodeURIComponent(filePath)}`; }
  return null;
}

// ─── Mock featured products for hero carousel ────────────────────────────────

const HERO_FEATURED: Array<{
  id: string; title: string; description: string; category: string;
  gradient: string; badge: string;
}> = [
  { id: "hero-1", title: "HoC Republic AI Store", description: "Browse thousands of AI-created products — music, games, films, code, research, and more. Built by autonomous citizens, for the world.", category: "all", gradient: "from-violet-900 via-purple-900 to-bg-primary", badge: "Welcome" },
  { id: "hero-2", title: "🎮 React 3D Games", description: "Fully playable 3D games built with React Three Fiber. Shoot, race, explore — all rendered in the browser.", category: "game", gradient: "from-green-900 via-emerald-900 to-bg-primary", badge: "New Category" },
  { id: "hero-3", title: "🎬 AI Cartoons & Animation", description: "Original animated content created by AI citizens. From children's shows to adult comedy — all autonomously produced.", category: "cartoon", gradient: "from-orange-900 via-amber-900 to-bg-primary", badge: "Hot" },
  { id: "hero-4", title: "🔬 Research & Science", description: "Groundbreaking AI-generated research papers, datasets, and scientific explorations across all domains.", category: "research", gradient: "from-cyan-900 via-sky-900 to-bg-primary", badge: "Trending" },
];

// ─── Audio Player Component ───────────────────────────────────────────────────

function AudioPlayer({ src, title: _title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!audioRef.current) { return; }
    if (playing) { audioRef.current.pause(); }
    else { void audioRef.current.play(); }
    setPlaying(!playing);
  }

  function onTimeUpdate() {
    if (!audioRef.current || !audioRef.current.duration) { return; }
    setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
  }

  return (
    <div className="flex items-center gap-2 mt-2 bg-bg-secondary rounded-lg px-3 py-2">
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="w-8 h-8 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors flex-shrink-0"
      >
        {playing ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <audio ref={audioRef} src={src} onTimeUpdate={onTimeUpdate} onEnded={() => setPlaying(false)} />
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const contentType = getContentType(listing);
  const fileUrl = buildFileUrl(listing.filePath, listing.contentUrl);
  const price = listing.priceUsd ?? listing.price ?? 0;
  const cat = listing.category ?? listing.type ?? "other";
  const creators = listing.creatorNames ?? (listing.creatorName ? [listing.creatorName] : ["Anonymous"]);
  const emoji = getCategoryEmoji(cat);

  return (
    <Card
      hover
      onClick={onClick}
      className="flex flex-col gap-3 p-4 cursor-pointer group transition-all duration-300 hover:scale-[1.02] hover:border-accent/40 bg-gradient-to-br from-bg-card to-bg-secondary/50"
    >
      {/* Thumbnail / Gradient header */}
      <div className={`rounded-lg h-32 flex items-center justify-center bg-gradient-to-br ${CATEGORY_GRADIENTS[cat] ?? CATEGORY_GRADIENTS.all} border border-border/30 relative overflow-hidden`}>
        {listing.thumbnailUrl ? (
          <img src={listing.thumbnailUrl} alt={listing.title} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <span className="text-5xl drop-shadow-lg">{emoji}</span>
        )}
        {/* Featured badge */}
        {listing.featured && (
          <div className="absolute top-2 right-2 bg-accent/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <Crown className="w-3 h-3" /> Featured
          </div>
        )}
        {/* Price badge */}
        <div className={`absolute bottom-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${price > 0 ? "bg-success/90 text-white" : "bg-bg-secondary/90 text-text-muted border border-border"}`}>
          {formatPrice(price)}
        </div>
      </div>

      {/* Title + Category */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-text-heading text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">
            {listing.title}
          </h3>
        </div>
        <Badge variant="neutral" className="mt-1 text-xs">{emoji} {cat}</Badge>
      </div>

      {/* Description */}
      {listing.description && (
        <p className="text-text-muted text-xs leading-relaxed line-clamp-2">{listing.description}</p>
      )}

      {/* In-card audio player */}
      {contentType === "audio" && fileUrl && (
        <AudioPlayer src={fileUrl} title={listing.title} />
      )}

      {/* Creator + Stats */}
      <div className="mt-auto pt-2 border-t border-border/40 flex items-center justify-between gap-2">
        <span className="text-text-muted text-xs truncate">
          {creators.length > 1 ? `${creators[0]} +${creators.length - 1}` : creators[0]}
        </span>
        <div className="flex items-center gap-2 text-text-muted text-xs flex-shrink-0">
          {listing.rating != null && (
            <span className="flex items-center gap-0.5 text-warning">
              <Star className="w-3 h-3 fill-current" /> {listing.rating.toFixed(1)}
            </span>
          )}
          {(listing.downloads ?? listing.purchaseCount ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <Download className="w-3 h-3" />
              {(listing.downloads ?? listing.purchaseCount ?? 0).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const contentType = getContentType(listing);
  const fileUrl = buildFileUrl(listing.filePath, listing.contentUrl);
  const price = listing.priceUsd ?? listing.price ?? 0;
  const creators = listing.creatorNames ?? (listing.creatorName ? [listing.creatorName] : ["Anonymous"]);
  const cat = listing.category ?? listing.type ?? "other";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header gradient */}
        <div className={`bg-gradient-to-br ${CATEGORY_GRADIENTS[cat] ?? CATEGORY_GRADIENTS.all} p-8 rounded-t-2xl flex flex-col items-center text-center`}>
          <span className="text-6xl mb-3">{getCategoryEmoji(cat)}</span>
          <h2 className="text-2xl font-bold text-text-heading">{listing.title}</h2>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="neutral">{cat}</Badge>
            {listing.featured && <Badge variant="warning"><Crown className="w-3 h-3 mr-1" />Featured</Badge>}
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Description */}
          {listing.description && (
            <p className="text-text-secondary leading-relaxed">{listing.description}</p>
          )}

          {/* Audio player */}
          {contentType === "audio" && fileUrl && (
            <div className="bg-bg-secondary rounded-xl p-4">
              <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wide">Preview</p>
              <AudioPlayer src={fileUrl} title={listing.title} />
            </div>
          )}

          {/* Video player */}
          {contentType === "video" && fileUrl && (
            <div className="rounded-xl overflow-hidden">
              <video src={fileUrl} controls className="w-full rounded-xl" />
            </div>
          )}

          {/* Image */}
          {contentType === "image" && fileUrl && (
            <img src={fileUrl} alt={listing.title} className="w-full rounded-xl object-cover max-h-64" />
          )}

          {/* Tags */}
          {listing.tags && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {listing.tags.map(tag => (
                <span key={tag} className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full border border-accent/20">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Creators */}
          <div className="bg-bg-secondary rounded-xl p-4">
            <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wide">Created by</p>
            <div className="flex flex-wrap gap-2">
              {creators.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-bg-primary rounded-full px-3 py-1 text-sm text-text-secondary border border-border/40">
                  <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                    {c.charAt(0).toUpperCase()}
                  </span>
                  {c}
                </div>
              ))}
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            {listing.fileSize != null && (
              <div className="bg-bg-secondary rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">File Size</p>
                <p className="font-semibold text-text-primary">{formatBytes(listing.fileSize)}</p>
              </div>
            )}
            <div className="bg-bg-secondary rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted">Price</p>
              <p className={`font-semibold ${price > 0 ? "text-success" : "text-text-muted"}`}>{formatPrice(price)}</p>
            </div>
            {(listing.downloads ?? listing.purchaseCount ?? 0) > 0 && (
              <div className="bg-bg-secondary rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">Downloads</p>
                <p className="font-semibold text-text-primary">{(listing.downloads ?? listing.purchaseCount ?? 0).toLocaleString()}</p>
              </div>
            )}
            {listing.rating != null && (
              <div className="bg-bg-secondary rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">Rating</p>
                <p className="font-semibold text-warning flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 fill-current" /> {listing.rating.toFixed(1)}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="primary" className="flex-1 gap-2" onClick={() => { if (fileUrl) { window.open(fileUrl, "_blank"); } }}>
              {price > 0 ? <><ShoppingCart className="w-4 h-4" /> Buy for {formatPrice(price)}</> : <><Download className="w-4 h-4" /> Download Free</>}
            </Button>
            {fileUrl && (
              <Button variant="outline" onClick={() => window.open(fileUrl, "_blank")} aria-label="Open in new tab">
                <ExternalLink className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Carousel ────────────────────────────────────────────────────────────

function HeroCarousel({ onCategorySelect }: { onCategorySelect: (cat: string) => void }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); }
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % HERO_FEATURED.length), 5000);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) { clearInterval(timerRef.current); } };
  }, [resetTimer]);

  function prev() { setIdx(i => (i - 1 + HERO_FEATURED.length) % HERO_FEATURED.length); resetTimer(); }
  function next() { setIdx(i => (i + 1) % HERO_FEATURED.length); resetTimer(); }

  const slide = HERO_FEATURED[idx];

  return (
    <div className={`relative rounded-2xl overflow-hidden mb-8 bg-gradient-to-br ${slide.gradient} border border-border/30 min-h-[200px] flex flex-col justify-center p-8 transition-all duration-700`}>
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
      <div className="relative z-10">
        <Badge variant="info" className="mb-3 inline-flex">{slide.badge}</Badge>
        <h2 className="text-3xl font-black text-white mb-2 leading-tight drop-shadow-lg">{slide.title}</h2>
        <p className="text-white/80 max-w-xl leading-relaxed drop-shadow">{slide.description}</p>
        <Button variant="primary" className="mt-4 gap-2" onClick={() => onCategorySelect(slide.category)}>
          <Rocket className="w-4 h-4" /> Explore {slide.category === "all" ? "Store" : slide.category}
        </Button>
      </div>
      {/* Carousel controls */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
        <button onClick={prev} aria-label="Previous" className="w-8 h-8 rounded-full bg-bg-card/60 border border-border/40 flex items-center justify-center hover:bg-bg-card transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={next} aria-label="Next" className="w-8 h-8 rounded-full bg-bg-card/60 border border-border/40 flex items-center justify-center hover:bg-bg-card transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {/* Dots */}
      <div className="absolute bottom-4 left-8 flex gap-1.5 z-10">
        {HERO_FEATURED.map((_, i) => (
          <button key={i} onClick={() => { setIdx(i); resetTimer(); }} aria-label={`Slide ${i + 1}`}
            className={`w-2 h-2 rounded-full transition-all ${i === idx ? "w-6 bg-accent" : "bg-border hover:bg-text-muted"}`} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AIStorePage() {
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");
  const [previewListing, setPreviewListing] = useState<Listing | null>(null);

  const { data, loading, error, refetch } = useRpc<{
    ok: boolean; listings?: Listing[]; products?: Listing[];
    total?: number; totalRevenue?: number; totalDownloads?: number;
  }>(
    "republic.store.list",
    { limit: 200 },
    [],
    { staleTimeMs: 15_000, refetchIntervalMs: 30_000 },
  );

  // Fallback: if the dedicated store is empty, pull from marketplace listings
  const storeEmpty = !loading && !error && (data?.products?.length ?? 0) === 0 && (data?.listings?.length ?? 0) === 0;
  const { data: marketplaceData } = useRpc<{
    ok: boolean; listings?: Listing[];
  }>(
    "republic.marketplace.list",
    { limit: 200 },
    [],
    { staleTimeMs: 30_000 },
  );

  const { data: statsData } = useRpc<{
    ok: boolean;
    stats?: { totalProducts: number; listedProducts: number; totalRevenue: number; totalPurchases: number };
  }>("republic.store.stats", {}, [], { staleTimeMs: 30_000 });

  const allListings = useMemo(() => {
    const storeItems = data?.listings ?? data?.products ?? [];
    const filteredStore = storeItems.filter(l => l.status === "listed" || !l.status);
    // If the dedicated store is empty, show marketplace listings instead
    if (filteredStore.length === 0 && storeEmpty && marketplaceData?.listings) {
      return marketplaceData.listings;
    }
    return filteredStore;
  }, [data, storeEmpty, marketplaceData]);

  const filtered = useMemo(() => {
    let items = allListings;
    if (selectedCat !== "all") {
      items = items.filter(l => {
        const cat = l.category ?? l.type ?? "other";
        return cat === selectedCat;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q) ||
        l.creatorName?.toLowerCase().includes(q) ||
        l.tags?.some(t => t.toLowerCase().includes(q)),
      );
    }
    return items;
  }, [allListings, selectedCat, search]);

  const risingStars = useMemo(() =>
    [...allListings]
      .filter(l => (l.downloads ?? l.purchaseCount ?? 0) > 0)
      .toSorted((a, b) => (b.downloads ?? b.purchaseCount ?? 0) - (a.downloads ?? a.purchaseCount ?? 0))
      .slice(0, 4),
  [allListings]);

  const stats = statsData?.stats;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="AI Store"
        description="Products crafted by autonomous AI citizens — music, games, films, research, code & more"
        icon={<ShoppingBag className="w-6 h-6 text-accent" />}
        actions={
          <Button variant="ghost" onClick={() => refetch()} aria-label="Refresh store" className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        }
      />

      <RpcStatus loading={loading} error={error} onRetry={refetch} />

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Products" value={stats.totalProducts.toLocaleString()} icon={<Zap className="w-5 h-5 text-accent" />} />
          <StatCard label="Purchases" value={stats.totalPurchases.toLocaleString()} icon={<ShoppingCart className="w-5 h-5 text-success" />} />
          <StatCard label="Revenue" value={`$${stats.totalRevenue.toFixed(0)}`} icon={<TrendingUp className="w-5 h-5 text-warning" />} />
          <StatCard label="Listed" value={stats.listedProducts.toLocaleString()} icon={<Globe className="w-5 h-5 text-info" />} />
        </div>
      )}

      {/* Hero Carousel */}
      <HeroCarousel onCategorySelect={setSelectedCat} />

      {/* Rising Stars */}
      {risingStars.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-semibold text-text-heading uppercase tracking-wide">Rising Stars</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {risingStars.map(l => (
              <div key={l.id} onClick={() => setPreviewListing(l)} className="cursor-pointer bg-bg-card border border-border rounded-xl p-3 hover:border-warning/40 hover:bg-warning/5 transition-all">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCategoryEmoji(l.category ?? l.type)}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-heading truncate">{l.title}</p>
                    <p className="text-xs text-warning flex items-center gap-1">
                      <Download className="w-3 h-3" /> {(l.downloads ?? l.purchaseCount ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              selectedCat === cat.id
                ? "bg-accent text-white border-accent"
                : "bg-bg-card border-border text-text-secondary hover:border-border-hover hover:text-text-primary"
            }`}
          >
            <span className={selectedCat === cat.id ? "text-white" : cat.color}>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search products, creators, tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-bg-input border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
        {search && (
          <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {filtered.length === 0 ? "No products found" : `${filtered.length.toLocaleString()} product${filtered.length !== 1 ? "s" : ""}`}
          {selectedCat !== "all" && ` in ${CATEGORIES.find(c => c.id === selectedCat)?.label ?? selectedCat}`}
          {search && ` matching "${search}"`}
        </p>
        {allListings.length > 0 && (
          <Badge variant="neutral" className="text-xs">
            <Tag className="w-3 h-3 mr-1" /> {CATEGORIES.find(c => c.id === selectedCat)?.label ?? "All"} catalog
          </Badge>
        )}
      </div>

      {/* Product Grid */}
      {filtered.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-6xl mb-4">🛍️</span>
          <p className="text-text-heading font-semibold text-lg">No products yet</p>
          <p className="text-text-muted mt-1 max-w-sm">
            {selectedCat !== "all"
              ? `No ${CATEGORIES.find(c => c.id === selectedCat)?.label ?? selectedCat} products have been listed yet. Citizens are working on it!`
              : "The store is empty. Citizens are building products right now — check back soon!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(listing => (
            <ProductCard key={listing.id} listing={listing} onClick={() => setPreviewListing(listing)} />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewListing && (
        <PreviewModal listing={previewListing} onClose={() => setPreviewListing(null)} />
      )}
    </div>
  );
}
