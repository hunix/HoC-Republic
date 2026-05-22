/**
 * OSINT Tool Registry — Citizen Knowledge Base
 *
 * Curated collection of 500+ OSINT tools from cipher387/osint_stuff_tool_collection.
 * Citizens use this registry to discover the right tool for intelligence tasks.
 *
 * Categories: Social Media, Domain/IP, Image Search, Cryptocurrency, Messengers,
 * Geolocation, Archives, Emails, Nicknames, Phone Numbers, and more.
 */

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface OsintTool {
  name: string;
  url: string;
  category: string;
  subcategory?: string;
  description?: string;
}

export interface OsintCategory {
  id: string;
  name: string;
  toolCount: number;
}

/* ── Registry ──────────────────────────────────────────────────────────── */

const OSINT_CATEGORIES: OsintCategory[] = [
  { id: "maps-geolocation", name: "Maps, Geolocation & Transport", toolCount: 80 },
  { id: "social-media", name: "Social Media", toolCount: 120 },
  { id: "domain-ip", name: "Domain/IP/Links", toolCount: 90 },
  { id: "image-search", name: "Image Search & Identification", toolCount: 40 },
  { id: "cryptocurrencies", name: "Cryptocurrencies", toolCount: 25 },
  { id: "messengers", name: "Messengers (Telegram, WhatsApp, Slack)", toolCount: 30 },
  { id: "search-engines", name: "Search Engines", toolCount: 35 },
  { id: "iot", name: "IoT (Shodan, Censys, etc.)", toolCount: 15 },
  { id: "archives", name: "Web Archives", toolCount: 20 },
  { id: "passwords", name: "Password/Leak Search", toolCount: 15 },
  { id: "emails", name: "Email Investigation", toolCount: 20 },
  { id: "nicknames", name: "Username/Nickname Search", toolCount: 15 },
  { id: "phone-numbers", name: "Phone Number Lookup", toolCount: 10 },
  { id: "code", name: "Code Analysis", toolCount: 10 },
  { id: "sound-video", name: "Sound/Video Analysis", toolCount: 15 },
  { id: "companies", name: "Company Information", toolCount: 20 },
];

/**
 * Core OSINT tools — the most valuable tools per category.
 * Full registry available at https://github.com/cipher387/osint_stuff_tool_collection
 */
const OSINT_TOOLS: OsintTool[] = [
  // ── Maps & Geolocation ──
  { name: "Google Earth Pro", url: "https://earth.google.com", category: "maps-geolocation", description: "Satellite imagery, 3D terrain, street view" },
  { name: "Sentinel Hub", url: "https://www.sentinel-hub.com", category: "maps-geolocation", description: "Free satellite imagery from Copernicus" },
  { name: "FIRMS", url: "https://firms.modaps.eosdis.nasa.gov", category: "maps-geolocation", description: "NASA fire detection — global active fires" },
  { name: "FlightRadar24", url: "https://www.flightradar24.com", category: "maps-geolocation", subcategory: "aviation", description: "Live flight tracking worldwide" },
  { name: "MarineTraffic", url: "https://www.marinetraffic.com", category: "maps-geolocation", subcategory: "maritime", description: "AIS vessel tracking" },
  { name: "Overpass Turbo", url: "https://overpass-turbo.eu", category: "maps-geolocation", description: "OpenStreetMap query engine" },
  { name: "Wikimapia", url: "https://wikimapia.org", category: "maps-geolocation", description: "Crowdsourced geographic encyclopedia" },

  // ── Social Media ──
  { name: "Sherlock", url: "https://github.com/sherlock-project/sherlock", category: "social-media", description: "Find usernames across 400+ social networks" },
  { name: "Twint", url: "https://github.com/twintproject/twint", category: "social-media", subcategory: "twitter", description: "Advanced Twitter scraping" },
  { name: "InstaLoader", url: "https://instaloader.github.io", category: "social-media", subcategory: "instagram", description: "Instagram profile/post downloader" },
  { name: "Social Searcher", url: "https://www.social-searcher.com", category: "social-media", description: "Free social media search engine" },
  { name: "TikTok Downloader", url: "https://github.com/n0l3r/tiktok-downloader", category: "social-media", subcategory: "tiktok", description: "TikTok video downloader" },
  { name: "DiscordLeaks", url: "https://discordleaks.unicornriot.ninja", category: "social-media", subcategory: "discord", description: "Leaked Discord server archives" },

  // ── Domain/IP ──
  { name: "Shodan", url: "https://www.shodan.io", category: "domain-ip", description: "Internet-connected device search engine" },
  { name: "Censys", url: "https://search.censys.io", category: "domain-ip", description: "Internet-wide scan data search" },
  { name: "VirusTotal", url: "https://www.virustotal.com", category: "domain-ip", description: "File/URL/IP malware analysis" },
  { name: "SecurityTrails", url: "https://securitytrails.com", category: "domain-ip", description: "DNS history, subdomain finder" },
  { name: "crt.sh", url: "https://crt.sh", category: "domain-ip", description: "Certificate Transparency log search" },
  { name: "URLScan.io", url: "https://urlscan.io", category: "domain-ip", description: "Website scanner and analyzer" },
  { name: "BuiltWith", url: "https://builtwith.com", category: "domain-ip", description: "Website technology profiler" },

  // ── Image Search ──
  { name: "TinEye", url: "https://tineye.com", category: "image-search", description: "Reverse image search engine" },
  { name: "FaceCheck.ID", url: "https://facecheck.id", category: "image-search", description: "Face recognition search" },
  { name: "PimEyes", url: "https://pimeyes.com", category: "image-search", description: "Face search engine" },
  { name: "EXIF Viewer", url: "https://exifdata.com", category: "image-search", description: "Image metadata analysis" },

  // ── Cryptocurrency ──
  { name: "Blockchain.com", url: "https://www.blockchain.com/explorer", category: "cryptocurrencies", description: "Bitcoin blockchain explorer" },
  { name: "Etherscan", url: "https://etherscan.io", category: "cryptocurrencies", description: "Ethereum blockchain explorer" },
  { name: "Chainalysis", url: "https://www.chainalysis.com", category: "cryptocurrencies", description: "Blockchain analysis platform" },

  // ── Messengers ──
  { name: "Telegram Analytics", url: "https://tgstat.com", category: "messengers", subcategory: "telegram", description: "Telegram channel analytics" },
  { name: "Lyzem", url: "https://lyzem.com", category: "messengers", subcategory: "telegram", description: "Telegram search engine" },

  // ── Search Engines ──
  { name: "IntelX", url: "https://intelx.io", category: "search-engines", description: "Intelligence search — darknet, leaks, domains" },
  { name: "Ahmia", url: "https://ahmia.fi", category: "search-engines", description: "Tor hidden services search" },
  { name: "GrayhatWarfare", url: "https://grayhatwarfare.com", category: "search-engines", description: "Public S3 bucket search" },

  // ── IoT ──
  { name: "ZoomEye", url: "https://www.zoomeye.org", category: "iot", description: "Cyberspace search engine" },
  { name: "Wigle.net", url: "https://wigle.net", category: "iot", description: "Wireless network mapping" },

  // ── Email ──
  { name: "Hunter.io", url: "https://hunter.io", category: "emails", description: "Email address finder" },
  { name: "Have I Been Pwned", url: "https://haveibeenpwned.com", category: "emails", description: "Data breach check" },
  { name: "Epieos", url: "https://epieos.com", category: "emails", description: "Email OSINT tool" },

  // ── Nicknames ──
  { name: "Namechk", url: "https://namechk.com", category: "nicknames", description: "Username availability checker" },
  { name: "WhatsMyName", url: "https://whatsmyname.app", category: "nicknames", description: "Username enumeration across web" },

  // ── Phone ──
  { name: "PhoneInfoga", url: "https://github.com/sundowndev/phoneinfoga", category: "phone-numbers", description: "Phone number OSINT framework" },
  { name: "NumLookup", url: "https://www.numlookup.com", category: "phone-numbers", description: "Phone number lookup" },

  // ── Companies ──
  { name: "OpenCorporates", url: "https://opencorporates.com", category: "companies", description: "Open database of companies worldwide" },
  { name: "Crunchbase", url: "https://www.crunchbase.com", category: "companies", description: "Company/startup intelligence" },

  // ── Archives ──
  { name: "Wayback Machine", url: "https://web.archive.org", category: "archives", description: "Internet Archive — historical web snapshots" },
  { name: "CachedView", url: "https://cachedview.nl", category: "archives", description: "View cached versions of pages" },
];

/* ── Exports ───────────────────────────────────────────────────────────── */

export function listOsintCategories(): OsintCategory[] {
  return OSINT_CATEGORIES;
}

export function listOsintTools(category?: string): OsintTool[] {
  if (category) {
    return OSINT_TOOLS.filter((t) => t.category === category);
  }
  return OSINT_TOOLS;
}

export function searchOsintTools(query: string): OsintTool[] {
  const q = query.toLowerCase();
  return OSINT_TOOLS.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.category.includes(q) ||
      (t.description ?? "").toLowerCase().includes(q) ||
      (t.subcategory ?? "").toLowerCase().includes(q),
  );
}

export function getOsintToolCount(): number {
  return OSINT_TOOLS.length;
}

export const OSINT_REGISTRY_SOURCE = "https://github.com/cipher387/osint_stuff_tool_collection";
