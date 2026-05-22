/**
 * War Theater Data Layer
 *
 * Comprehensive military intelligence database:
 * - Military bases worldwide (~200 major installations)
 * - Carrier battle groups with known positions
 * - Strike event model for simulation & replay
 * - Geo-coordinate system for map visualization
 *
 * Data sources: OSINT, public military records, news triangulation.
 * Citizens can query this data for strategic analysis.
 */

// ─── Types ────────────────────────────────────────────────────────

export type BaseType =
  | "air"
  | "naval"
  | "army"
  | "missile"
  | "nuclear"
  | "joint"
  | "cyber"
  | "space";

export interface MilitaryBase {
  id: string;
  name: string;
  country: string; // operator country code
  hostCountry: string; // physical location country
  type: BaseType;
  lat: number;
  lng: number;
  status: "active" | "reserve" | "disputed" | "planned";
  capabilities: string[];
  personnel?: number;
}

export interface CarrierGroup {
  id: string;
  name: string;
  hullNumber: string; // CVN-78 etc.
  country: string;
  lat: number;
  lng: number;
  heading: number; // degrees
  speed: number; // knots
  lastUpdated: number;
  homePort: string;
  battleGroup: string[]; // escort ship names
  aircraftComplement: string[];
  status: "deployed" | "port" | "transit" | "exercise";
}

export type StrikeType =
  | "missile"
  | "airstrike"
  | "naval_bombardment"
  | "drone"
  | "cyber"
  | "special_ops"
  | "ballistic";

export interface StrikeEvent {
  id: string;
  type: StrikeType;
  originBaseId?: string;
  originCarrierId?: string;
  originCoords: [number, number]; // [lat, lng]
  targetCoords: [number, number];
  targetDescription: string;
  weapon?: string;
  platform?: string; // "F-35A", "B-2 Spirit", "Virginia-class SSN"
  timestamp: number;
  source: string;
  verified: boolean;
  country: string; // attacking country
  targetCountry: string;
  casualties?: { military: number; civilian: number };
  narrative?: string; // description for war correspondent
}

export interface TheaterConfig {
  center: [number, number];
  zoom: number;
  name: string;
  description: string;
  countries: string[];
}

// ─── Country Capitals (geo-coords for arsenal DB) ────────────────

export const COUNTRY_COORDS: Record<string, { lat: number; lng: number; capital: string }> = {
  US: { lat: 38.9072, lng: -77.0369, capital: "Washington D.C." },
  RU: { lat: 55.7558, lng: 37.6173, capital: "Moscow" },
  CN: { lat: 39.9042, lng: 116.4074, capital: "Beijing" },
  IN: { lat: 28.6139, lng: 77.209, capital: "New Delhi" },
  IR: { lat: 35.6892, lng: 51.389, capital: "Tehran" },
  IL: { lat: 31.7683, lng: 35.2137, capital: "Jerusalem" },
  UA: { lat: 50.4501, lng: 30.5234, capital: "Kyiv" },
  KP: { lat: 39.0392, lng: 125.7625, capital: "Pyongyang" },
  PK: { lat: 33.6844, lng: 73.0479, capital: "Islamabad" },
  TW: { lat: 25.033, lng: 121.5654, capital: "Taipei" },
  SA: { lat: 24.7136, lng: 46.6753, capital: "Riyadh" },
  TR: { lat: 39.9334, lng: 32.8597, capital: "Ankara" },
  SY: { lat: 33.5138, lng: 36.2765, capital: "Damascus" },
  MM: { lat: 19.7633, lng: 96.0785, capital: "Naypyidaw" },
  YE: { lat: 15.3694, lng: 44.191, capital: "Sana'a" },
  // Additional NATO & partners
  GB: { lat: 51.5074, lng: -0.1278, capital: "London" },
  FR: { lat: 48.8566, lng: 2.3522, capital: "Paris" },
  DE: { lat: 52.52, lng: 13.405, capital: "Berlin" },
  JP: { lat: 35.6762, lng: 139.6503, capital: "Tokyo" },
  KR: { lat: 37.5665, lng: 126.978, capital: "Seoul" },
  AU: { lat: -35.2809, lng: 149.13, capital: "Canberra" },
  IT: { lat: 41.9028, lng: 12.4964, capital: "Rome" },
  PL: { lat: 52.2297, lng: 21.0122, capital: "Warsaw" },
  NO: { lat: 59.9139, lng: 10.7522, capital: "Oslo" },
  GR: { lat: 37.9838, lng: 23.7275, capital: "Athens" },
  EG: { lat: 30.0444, lng: 31.2357, capital: "Cairo" },
  IQ: { lat: 33.3152, lng: 44.3661, capital: "Baghdad" },
  AF: { lat: 34.5553, lng: 69.2075, capital: "Kabul" },
  QA: { lat: 25.2854, lng: 51.531, capital: "Doha" },
  BH: { lat: 26.2285, lng: 50.586, capital: "Manama" },
  KW: { lat: 29.3759, lng: 47.9774, capital: "Kuwait City" },
  AE: { lat: 24.4539, lng: 54.3773, capital: "Abu Dhabi" },
  DJ: { lat: 11.5721, lng: 43.1456, capital: "Djibouti" },
};

// ─── Military Bases Database ─────────────────────────────────────

export const MILITARY_BASES: MilitaryBase[] = [
  // ════════════════ UNITED STATES ════════════════
  // ── Continental US ──
  {
    id: "us-pentagon",
    name: "The Pentagon",
    country: "US",
    hostCountry: "US",
    type: "joint",
    lat: 38.8719,
    lng: -77.0563,
    status: "active",
    capabilities: ["HQ", "C4ISR", "Strategic Command"],
    personnel: 26000,
  },
  {
    id: "us-norfolk",
    name: "Naval Station Norfolk",
    country: "US",
    hostCountry: "US",
    type: "naval",
    lat: 36.9461,
    lng: -76.3033,
    status: "active",
    capabilities: ["carrier-port", "destroyer", "amphibious"],
    personnel: 75000,
  },
  {
    id: "us-sandiego",
    name: "Naval Base San Diego",
    country: "US",
    hostCountry: "US",
    type: "naval",
    lat: 32.6839,
    lng: -117.1286,
    status: "active",
    capabilities: ["carrier-port", "submarine", "cruiser"],
    personnel: 35000,
  },
  {
    id: "us-pearl",
    name: "Joint Base Pearl Harbor-Hickam",
    country: "US",
    hostCountry: "US",
    type: "joint",
    lat: 21.3469,
    lng: -157.9741,
    status: "active",
    capabilities: ["carrier-port", "submarine", "F-22", "Pacific-HQ"],
    personnel: 50000,
  },
  {
    id: "us-nellis",
    name: "Nellis AFB",
    country: "US",
    hostCountry: "US",
    type: "air",
    lat: 36.236,
    lng: -115.034,
    status: "active",
    capabilities: ["F-35A", "F-22", "Red Flag", "Aggressor"],
    personnel: 12000,
  },
  {
    id: "us-edwards",
    name: "Edwards AFB",
    country: "US",
    hostCountry: "US",
    type: "air",
    lat: 34.9054,
    lng: -117.884,
    status: "active",
    capabilities: ["B-21", "X-planes", "test-range"],
    personnel: 10000,
  },
  {
    id: "us-whiteman",
    name: "Whiteman AFB",
    country: "US",
    hostCountry: "US",
    type: "air",
    lat: 38.7263,
    lng: -93.5595,
    status: "active",
    capabilities: ["B-2 Spirit", "stealth-bomber", "nuclear-capable"],
    personnel: 4000,
  },
  {
    id: "us-minot",
    name: "Minot AFB",
    country: "US",
    hostCountry: "US",
    type: "nuclear",
    lat: 48.4159,
    lng: -101.358,
    status: "active",
    capabilities: ["B-52H", "Minuteman III", "ICBM", "nuclear-triad"],
    personnel: 5500,
  },
  {
    id: "us-cheyenne",
    name: "Cheyenne Mountain Complex",
    country: "US",
    hostCountry: "US",
    type: "missile",
    lat: 38.7445,
    lng: -104.8467,
    status: "active",
    capabilities: ["NORAD", "space-surveillance", "missile-warning"],
    personnel: 1800,
  },
  {
    id: "us-kings-bay",
    name: "Naval Submarine Base Kings Bay",
    country: "US",
    hostCountry: "US",
    type: "nuclear",
    lat: 30.7967,
    lng: -81.5153,
    status: "active",
    capabilities: ["Ohio-class SSBN", "Trident II", "nuclear-deterrent"],
    personnel: 10000,
  },
  {
    id: "us-bangor",
    name: "Naval Base Kitsap-Bangor",
    country: "US",
    hostCountry: "US",
    type: "nuclear",
    lat: 47.7249,
    lng: -122.7186,
    status: "active",
    capabilities: ["Ohio-class SSBN", "Trident II"],
    personnel: 14000,
  },
  {
    id: "us-bragg",
    name: "Fort Liberty (Bragg)",
    country: "US",
    hostCountry: "US",
    type: "army",
    lat: 35.1395,
    lng: -79.0061,
    status: "active",
    capabilities: ["airborne", "special-ops", "XVIII Airborne Corps"],
    personnel: 57000,
  },
  {
    id: "us-hood",
    name: "Fort Cavazos (Hood)",
    country: "US",
    hostCountry: "US",
    type: "army",
    lat: 31.1169,
    lng: -97.7756,
    status: "active",
    capabilities: ["1st Cavalry", "III Corps", "armor"],
    personnel: 45000,
  },
  {
    id: "us-vandenberg",
    name: "Vandenberg SFB",
    country: "US",
    hostCountry: "US",
    type: "space",
    lat: 34.742,
    lng: -120.5724,
    status: "active",
    capabilities: ["ICBM-test", "satellite-launch", "Space Force"],
    personnel: 3500,
  },
  {
    id: "us-schriever",
    name: "Schriever SFB",
    country: "US",
    hostCountry: "US",
    type: "space",
    lat: 38.8059,
    lng: -104.5265,
    status: "active",
    capabilities: ["GPS-ops", "satellite-control", "Space Force"],
    personnel: 8000,
  },
  {
    id: "us-meade",
    name: "Fort Meade / NSA",
    country: "US",
    hostCountry: "US",
    type: "cyber",
    lat: 39.1086,
    lng: -76.7712,
    status: "active",
    capabilities: ["NSA-HQ", "CYBERCOM", "SIGINT", "cyber-warfare"],
    personnel: 40000,
  },

  // ── US Overseas Bases ──
  {
    id: "us-ramstein",
    name: "Ramstein Air Base",
    country: "US",
    hostCountry: "DE",
    type: "air",
    lat: 49.4369,
    lng: 7.6003,
    status: "active",
    capabilities: ["C-17", "KC-135", "NATO-airlift", "USAFE-HQ"],
    personnel: 9200,
  },
  {
    id: "us-landstuhl",
    name: "Landstuhl Regional Medical",
    country: "US",
    hostCountry: "DE",
    type: "army",
    lat: 49.4361,
    lng: 7.5669,
    status: "active",
    capabilities: ["medical", "trauma-center"],
    personnel: 3200,
  },
  {
    id: "us-aviano",
    name: "Aviano Air Base",
    country: "US",
    hostCountry: "IT",
    type: "air",
    lat: 46.0319,
    lng: 12.5964,
    status: "active",
    capabilities: ["F-16", "F-35", "NATO-south"],
    personnel: 5000,
  },
  {
    id: "us-sigonella",
    name: "NAS Sigonella",
    country: "US",
    hostCountry: "IT",
    type: "naval",
    lat: 37.4017,
    lng: 14.9222,
    status: "active",
    capabilities: ["P-8A Poseidon", "MQ-4C Triton", "ISR"],
    personnel: 4000,
  },
  {
    id: "us-rota",
    name: "Naval Station Rota",
    country: "US",
    hostCountry: "ES",
    type: "naval",
    lat: 36.6417,
    lng: -6.3494,
    status: "active",
    capabilities: ["Aegis-BMD", "destroyer", "NATO-shield"],
    personnel: 4000,
  },
  {
    id: "us-incirlik",
    name: "Incirlik Air Base",
    country: "US",
    hostCountry: "TR",
    type: "air",
    lat: 37.0019,
    lng: 35.4258,
    status: "active",
    capabilities: ["F-15E", "KC-135", "nuclear-storage"],
    personnel: 5000,
  },
  {
    id: "us-souda",
    name: "NSA Souda Bay",
    country: "US",
    hostCountry: "GR",
    type: "naval",
    lat: 35.49,
    lng: 24.0725,
    status: "active",
    capabilities: ["destroyer-port", "ammunition", "ISR"],
    personnel: 1500,
  },
  {
    id: "us-al-udeid",
    name: "Al Udeid Air Base",
    country: "US",
    hostCountry: "QA",
    type: "air",
    lat: 25.1174,
    lng: 51.315,
    status: "active",
    capabilities: ["B-52", "KC-10", "CENTCOM-forward", "C2"],
    personnel: 11000,
  },
  {
    id: "us-al-dhafra",
    name: "Al Dhafra Air Base",
    country: "US",
    hostCountry: "AE",
    type: "air",
    lat: 24.2483,
    lng: 54.5478,
    status: "active",
    capabilities: ["F-35", "F-22", "RQ-4", "refueling"],
    personnel: 5000,
  },
  {
    id: "us-bahrain",
    name: "NSA Bahrain / 5th Fleet HQ",
    country: "US",
    hostCountry: "BH",
    type: "naval",
    lat: 26.205,
    lng: 50.6072,
    status: "active",
    capabilities: ["5th-Fleet-HQ", "patrol", "mine-countermeasures"],
    personnel: 7000,
  },
  {
    id: "us-arifjan",
    name: "Camp Arifjan",
    country: "US",
    hostCountry: "KW",
    type: "army",
    lat: 29.11,
    lng: 48.11,
    status: "active",
    capabilities: ["ARCENT-HQ", "logistics", "pre-positioned-stocks"],
    personnel: 15000,
  },
  {
    id: "us-djibouti",
    name: "Camp Lemonnier",
    country: "US",
    hostCountry: "DJ",
    type: "joint",
    lat: 11.5469,
    lng: 43.1497,
    status: "active",
    capabilities: ["AFRICOM-forward", "MQ-9", "SOF", "anti-piracy"],
    personnel: 4000,
  },
  {
    id: "us-diego-garcia",
    name: "Naval Support Facility Diego Garcia",
    country: "US",
    hostCountry: "GB",
    type: "joint",
    lat: -7.3195,
    lng: 72.4229,
    status: "active",
    capabilities: ["B-2", "B-52", "submarine-base", "SIGINT"],
    personnel: 3000,
  },
  {
    id: "us-yokota",
    name: "Yokota Air Base",
    country: "US",
    hostCountry: "JP",
    type: "air",
    lat: 35.7486,
    lng: 139.3486,
    status: "active",
    capabilities: ["C-130J", "CV-22", "USFJ-HQ", "5th-AF-HQ"],
    personnel: 14000,
  },
  {
    id: "us-yokosuka",
    name: "CFAY Yokosuka",
    country: "US",
    hostCountry: "JP",
    type: "naval",
    lat: 35.2836,
    lng: 139.6547,
    status: "active",
    capabilities: ["7th-Fleet-HQ", "carrier-port", "Aegis-BMD"],
    personnel: 24000,
  },
  {
    id: "us-misawa",
    name: "Misawa Air Base",
    country: "US",
    hostCountry: "JP",
    type: "air",
    lat: 40.7033,
    lng: 141.3681,
    status: "active",
    capabilities: ["F-16", "SIGINT", "Echelon"],
    personnel: 5200,
  },
  {
    id: "us-kadena",
    name: "Kadena Air Base",
    country: "US",
    hostCountry: "JP",
    type: "air",
    lat: 26.3516,
    lng: 127.7692,
    status: "active",
    capabilities: ["F-15C/D", "KC-135", "E-3 AWACS", "Pacific-power-projection"],
    personnel: 18000,
  },
  {
    id: "us-iwakuni",
    name: "MCAS Iwakuni",
    country: "US",
    hostCountry: "JP",
    type: "air",
    lat: 34.1461,
    lng: 132.2364,
    status: "active",
    capabilities: ["F-35B", "F/A-18", "EA-18G"],
    personnel: 15000,
  },
  {
    id: "us-humphreys",
    name: "Camp Humphreys",
    country: "US",
    hostCountry: "KR",
    type: "army",
    lat: 36.9608,
    lng: 127.03,
    status: "active",
    capabilities: ["USFK-HQ", "8th-Army", "Apache", "Patriot"],
    personnel: 36000,
  },
  {
    id: "us-osan",
    name: "Osan Air Base",
    country: "US",
    hostCountry: "KR",
    type: "air",
    lat: 37.0906,
    lng: 127.0303,
    status: "active",
    capabilities: ["A-10", "F-16", "U-2", "THAAD"],
    personnel: 8000,
  },
  {
    id: "us-kunsan",
    name: "Kunsan Air Base",
    country: "US",
    hostCountry: "KR",
    type: "air",
    lat: 35.9036,
    lng: 126.6158,
    status: "active",
    capabilities: ["F-16", "Wolf Pack"],
    personnel: 2800,
  },
  {
    id: "us-guam",
    name: "Andersen AFB / Naval Base Guam",
    country: "US",
    hostCountry: "US",
    type: "joint",
    lat: 13.584,
    lng: 144.9247,
    status: "active",
    capabilities: ["B-1B", "B-52", "SSBN-support", "THAAD", "bomber-forward"],
    personnel: 6000,
  },
  {
    id: "us-thule",
    name: "Pituffik Space Base (Thule)",
    country: "US",
    hostCountry: "DK",
    type: "space",
    lat: 76.531,
    lng: -68.703,
    status: "active",
    capabilities: ["BMEWS", "satellite-tracking", "Arctic-surveillance"],
    personnel: 600,
  },
  {
    id: "us-keflavik",
    name: "Naval Air Station Keflavik",
    country: "US",
    hostCountry: "IS",
    type: "naval",
    lat: 63.985,
    lng: -22.606,
    status: "reserve",
    capabilities: ["P-8A", "GIUK-gap", "anti-submarine"],
    personnel: 400,
  },

  // ════════════════ RUSSIA ════════════════
  {
    id: "ru-hmeimim",
    name: "Hmeimim Air Base",
    country: "RU",
    hostCountry: "SY",
    type: "air",
    lat: 35.4011,
    lng: 35.9486,
    status: "active",
    capabilities: ["Su-35S", "Su-34", "S-400", "forward-deployed"],
    personnel: 4000,
  },
  {
    id: "ru-tartus",
    name: "Naval Facility Tartus",
    country: "RU",
    hostCountry: "SY",
    type: "naval",
    lat: 34.8894,
    lng: 35.8867,
    status: "active",
    capabilities: ["Mediterranean-fleet", "supply-depot"],
    personnel: 1700,
  },
  {
    id: "ru-kaliningrad",
    name: "Kaliningrad Naval Base",
    country: "RU",
    hostCountry: "RU",
    type: "naval",
    lat: 54.7104,
    lng: 20.4522,
    status: "active",
    capabilities: ["Baltic-Fleet-HQ", "Iskander-M", "S-400", "A2/AD"],
    personnel: 12000,
  },
  {
    id: "ru-sevastopol",
    name: "Sevastopol Naval Base",
    country: "RU",
    hostCountry: "UA",
    type: "naval",
    lat: 44.6166,
    lng: 33.5254,
    status: "disputed",
    capabilities: ["Black-Sea-Fleet-HQ", "submarine", "missile-corvette"],
    personnel: 25000,
  },
  {
    id: "ru-vladivostok",
    name: "Vladivostok Naval Base",
    country: "RU",
    hostCountry: "RU",
    type: "naval",
    lat: 43.1332,
    lng: 131.9113,
    status: "active",
    capabilities: ["Pacific-Fleet-HQ", "submarine", "destroyer"],
    personnel: 25000,
  },
  {
    id: "ru-petropavlovsk",
    name: "Rybachiy Nuclear Submarine Base",
    country: "RU",
    hostCountry: "RU",
    type: "nuclear",
    lat: 52.9212,
    lng: 158.5045,
    status: "active",
    capabilities: ["Borei-class SSBN", "Bulava SLBM", "nuclear-deterrent"],
    personnel: 8000,
  },
  {
    id: "ru-engels",
    name: "Engels-2 Air Base",
    country: "RU",
    hostCountry: "RU",
    type: "nuclear",
    lat: 51.48,
    lng: 46.2,
    status: "active",
    capabilities: ["Tu-160", "Tu-95MS", "Kh-101", "nuclear-bomber"],
    personnel: 3500,
  },
  {
    id: "ru-plesetsk",
    name: "Plesetsk Cosmodrome",
    country: "RU",
    hostCountry: "RU",
    type: "missile",
    lat: 62.9279,
    lng: 40.5779,
    status: "active",
    capabilities: ["ICBM-test", "satellite-launch", "RS-28 Sarmat"],
    personnel: 5000,
  },
  {
    id: "ru-murmansk",
    name: "Severomorsk Naval Base",
    country: "RU",
    hostCountry: "RU",
    type: "naval",
    lat: 69.0731,
    lng: 33.4189,
    status: "active",
    capabilities: ["Northern-Fleet-HQ", "Admiral-Kuznetsov", "Yasen-class"],
    personnel: 30000,
  },
  {
    id: "ru-gadzhievo",
    name: "Gadzhievo Submarine Base",
    country: "RU",
    hostCountry: "RU",
    type: "nuclear",
    lat: 69.2517,
    lng: 33.3167,
    status: "active",
    capabilities: ["Delta-IV-class", "Borei-class", "SLBM"],
    personnel: 6000,
  },

  // ════════════════ CHINA ════════════════
  {
    id: "cn-djibouti",
    name: "PLA Support Base Djibouti",
    country: "CN",
    hostCountry: "DJ",
    type: "joint",
    lat: 11.5936,
    lng: 43.1456,
    status: "active",
    capabilities: ["logistics", "marine-garrison", "helicopter"],
    personnel: 2000,
  },
  {
    id: "cn-yulin",
    name: "Yulin Naval Base (Hainan)",
    country: "CN",
    hostCountry: "CN",
    type: "naval",
    lat: 18.2269,
    lng: 109.565,
    status: "active",
    capabilities: ["Type-094 SSBN", "JL-3 SLBM", "underground-pens", "carrier-berth"],
    personnel: 15000,
  },
  {
    id: "cn-fiery-cross",
    name: "Fiery Cross Reef",
    country: "CN",
    hostCountry: "CN",
    type: "joint",
    lat: 9.5492,
    lng: 112.8933,
    status: "disputed",
    capabilities: ["airstrip", "radar", "SAM", "anti-ship-missile"],
    personnel: 200,
  },
  {
    id: "cn-subi-reef",
    name: "Subi Reef",
    country: "CN",
    hostCountry: "CN",
    type: "air",
    lat: 10.9228,
    lng: 114.0844,
    status: "disputed",
    capabilities: ["airstrip", "hangar", "radar", "CIWS"],
    personnel: 200,
  },
  {
    id: "cn-mischief-reef",
    name: "Mischief Reef",
    country: "CN",
    hostCountry: "CN",
    type: "joint",
    lat: 9.9,
    lng: 115.5333,
    status: "disputed",
    capabilities: ["airstrip", "underground-storage", "radar"],
    personnel: 200,
  },
  {
    id: "cn-qingdao",
    name: "Qingdao Naval Base",
    country: "CN",
    hostCountry: "CN",
    type: "naval",
    lat: 36.0671,
    lng: 120.3826,
    status: "active",
    capabilities: ["North-Sea-Fleet-HQ", "carrier-berth", "destroyer"],
    personnel: 20000,
  },
  {
    id: "cn-zhanjiang",
    name: "Zhanjiang Naval Base",
    country: "CN",
    hostCountry: "CN",
    type: "naval",
    lat: 21.1953,
    lng: 110.4035,
    status: "active",
    capabilities: ["South-Sea-Fleet-HQ", "amphibious", "Type-075 LHD"],
    personnel: 20000,
  },
  {
    id: "cn-jianshui",
    name: "Jianshui Air Base",
    country: "CN",
    hostCountry: "CN",
    type: "air",
    lat: 23.6153,
    lng: 102.8283,
    status: "active",
    capabilities: ["J-20", "J-16", "stealth-fighter"],
    personnel: 3000,
  },
  {
    id: "cn-korla",
    name: "Korla Missile Test Complex",
    country: "CN",
    hostCountry: "CN",
    type: "missile",
    lat: 41.7456,
    lng: 86.1628,
    status: "active",
    capabilities: ["ASAT-test", "BMD-test", "hypersonic"],
    personnel: 2000,
  },

  // ════════════════ RUSSIA-UKRAINE THEATER ════════════════
  {
    id: "ru-crimea-belbek",
    name: "Belbek Air Base",
    country: "RU",
    hostCountry: "UA",
    type: "air",
    lat: 44.6861,
    lng: 33.5794,
    status: "disputed",
    capabilities: ["Su-27", "Su-30SM", "Black-Sea-air-defense"],
    personnel: 1500,
  },
  {
    id: "ru-novorossiysk",
    name: "Novorossiysk Naval Base",
    country: "RU",
    hostCountry: "RU",
    type: "naval",
    lat: 44.7231,
    lng: 37.7686,
    status: "active",
    capabilities: ["Black-Sea-Fleet", "submarine", "Kilo-class"],
    personnel: 8000,
  },

  // ════════════════ NATO ALLIES ════════════════
  // UK
  {
    id: "gb-faslane",
    name: "HMNB Clyde (Faslane)",
    country: "GB",
    hostCountry: "GB",
    type: "nuclear",
    lat: 56.068,
    lng: -4.8202,
    status: "active",
    capabilities: ["Vanguard-class SSBN", "Trident II", "UK-nuclear-deterrent"],
    personnel: 6800,
  },
  {
    id: "gb-lakenheath",
    name: "RAF Lakenheath",
    country: "US",
    hostCountry: "GB",
    type: "air",
    lat: 52.4093,
    lng: 0.5616,
    status: "active",
    capabilities: ["F-35A", "F-15E", "nuclear-storage"],
    personnel: 5000,
  },
  {
    id: "gb-akrotiri",
    name: "RAF Akrotiri",
    country: "GB",
    hostCountry: "CY",
    type: "air",
    lat: 34.5881,
    lng: 32.9873,
    status: "active",
    capabilities: ["Typhoon", "ISR", "Middle-East-staging"],
    personnel: 3500,
  },
  // France
  {
    id: "fr-toulon",
    name: "Toulon Naval Base",
    country: "FR",
    hostCountry: "FR",
    type: "naval",
    lat: 43.1152,
    lng: 5.9254,
    status: "active",
    capabilities: ["Charles-de-Gaulle-CVN", "Barracuda-SSN", "Mediterranean-HQ"],
    personnel: 23000,
  },
  {
    id: "fr-istres",
    name: "BA 125 Istres",
    country: "FR",
    hostCountry: "FR",
    type: "nuclear",
    lat: 43.5239,
    lng: 4.9239,
    status: "active",
    capabilities: ["Rafale-B", "ASMP-A", "nuclear-strike"],
    personnel: 3000,
  },
  {
    id: "fr-ile-longue",
    name: "Île Longue Submarine Base",
    country: "FR",
    hostCountry: "FR",
    type: "nuclear",
    lat: 48.3089,
    lng: -4.5103,
    status: "active",
    capabilities: ["Triomphant-class SSBN", "M51 SLBM", "nuclear-deterrent"],
    personnel: 3500,
  },
  {
    id: "fr-djibouti",
    name: "French Forces Djibouti",
    country: "FR",
    hostCountry: "DJ",
    type: "joint",
    lat: 11.55,
    lng: 43.1333,
    status: "active",
    capabilities: ["Mirage-2000", "marine-garrison", "training"],
    personnel: 1450,
  },
  // Germany
  {
    id: "de-buechel",
    name: "Büchel Air Base",
    country: "DE",
    hostCountry: "DE",
    type: "air",
    lat: 50.1739,
    lng: 7.0631,
    status: "active",
    capabilities: ["Tornado", "B61-nuclear-sharing", "NATO-nuclear"],
    personnel: 1000,
  },
  // Poland
  {
    id: "pl-redzikowo",
    name: "Aegis Ashore Redzikowo",
    country: "US",
    hostCountry: "PL",
    type: "missile",
    lat: 54.4722,
    lng: 17.1242,
    status: "active",
    capabilities: ["Aegis-BMD", "SM-3", "missile-defense"],
    personnel: 300,
  },
  // Norway
  {
    id: "no-bodo",
    name: "Bodø Main Air Station",
    country: "NO",
    hostCountry: "NO",
    type: "air",
    lat: 67.2692,
    lng: 14.3653,
    status: "active",
    capabilities: ["F-35A", "P-8A", "Arctic-defense"],
    personnel: 2000,
  },
  // Japan (JSDF)
  {
    id: "jp-sasebo",
    name: "JMSDF Sasebo",
    country: "JP",
    hostCountry: "JP",
    type: "naval",
    lat: 33.1572,
    lng: 129.7108,
    status: "active",
    capabilities: ["Izumo-class-CVL", "Aegis-destroyer", "mine-warfare"],
    personnel: 10000,
  },
  // South Korea
  {
    id: "kr-pyeongtaek",
    name: "ROK Navy Pyeongtaek",
    country: "KR",
    hostCountry: "KR",
    type: "naval",
    lat: 36.9919,
    lng: 126.8317,
    status: "active",
    capabilities: ["Sejong-class", "Aegis", "KDX-III"],
    personnel: 5000,
  },
  // Australia
  {
    id: "au-pine-gap",
    name: "Pine Gap",
    country: "AU",
    hostCountry: "AU",
    type: "space",
    lat: -23.799,
    lng: 133.735,
    status: "active",
    capabilities: ["SIGINT", "satellite-ground-station", "Five-Eyes"],
    personnel: 1000,
  },
  {
    id: "au-darwin",
    name: "RAAF Base Darwin",
    country: "AU",
    hostCountry: "AU",
    type: "air",
    lat: -12.4147,
    lng: 130.8748,
    status: "active",
    capabilities: ["F-35A", "USMC-rotation", "northern-watch"],
    personnel: 3500,
  },

  // ════════════════ IRAN ════════════════
  {
    id: "ir-isfahan",
    name: "Isfahan Nuclear Technology Center",
    country: "IR",
    hostCountry: "IR",
    type: "nuclear",
    lat: 32.6546,
    lng: 51.6596,
    status: "active",
    capabilities: ["uranium-conversion", "research-reactor"],
    personnel: 5000,
  },
  {
    id: "ir-natanz",
    name: "Natanz Enrichment Facility",
    country: "IR",
    hostCountry: "IR",
    type: "nuclear",
    lat: 33.7236,
    lng: 51.7236,
    status: "active",
    capabilities: ["uranium-enrichment", "underground-centrifuges"],
    personnel: 3000,
  },
  {
    id: "ir-bushehr",
    name: "Bushehr Nuclear Power Plant",
    country: "IR",
    hostCountry: "IR",
    type: "nuclear",
    lat: 28.8311,
    lng: 50.8789,
    status: "active",
    capabilities: ["nuclear-power", "VVER-1000"],
    personnel: 2000,
  },
  {
    id: "ir-bandar-abbas",
    name: "Bandar Abbas Naval Base",
    country: "IR",
    hostCountry: "IR",
    type: "naval",
    lat: 27.1494,
    lng: 56.25,
    status: "active",
    capabilities: ["IRGCN-HQ", "fast-attack-craft", "anti-ship-missile", "Strait-of-Hormuz"],
    personnel: 15000,
  },
  {
    id: "ir-tabriz",
    name: "Tabriz Air Base",
    country: "IR",
    hostCountry: "IR",
    type: "air",
    lat: 38.1339,
    lng: 46.235,
    status: "active",
    capabilities: ["F-14", "MiG-29", "Kowsar", "air-defense"],
    personnel: 5000,
  },
  {
    id: "ir-parchin",
    name: "Parchin Military Complex",
    country: "IR",
    hostCountry: "IR",
    type: "missile",
    lat: 35.5322,
    lng: 51.7858,
    status: "active",
    capabilities: ["missile-development", "warhead-research", "Shahab-3"],
    personnel: 8000,
  },
  {
    id: "ir-imam-ali",
    name: "Imam Ali Missile Base",
    country: "IR",
    hostCountry: "IR",
    type: "missile",
    lat: 34.85,
    lng: 45.3667,
    status: "active",
    capabilities: ["Sejjil-2", "Khorramshahr", "MRBM", "underground-silos"],
    personnel: 3000,
  },

  // ════════════════ ISRAEL ════════════════
  {
    id: "il-dimona",
    name: "Negev Nuclear Research Center",
    country: "IL",
    hostCountry: "IL",
    type: "nuclear",
    lat: 31.0011,
    lng: 35.1447,
    status: "active",
    capabilities: ["plutonium-production", "nuclear-weapons-program"],
    personnel: 2700,
  },
  {
    id: "il-nevatim",
    name: "Nevatim Air Base",
    country: "IL",
    hostCountry: "IL",
    type: "air",
    lat: 31.2086,
    lng: 34.8217,
    status: "active",
    capabilities: ["F-35I Adir", "F-15I Ra'am", "precision-strike"],
    personnel: 5000,
  },
  {
    id: "il-ramat-david",
    name: "Ramat David Air Base",
    country: "IL",
    hostCountry: "IL",
    type: "air",
    lat: 32.6653,
    lng: 35.1806,
    status: "active",
    capabilities: ["F-16I Sufa", "Apache", "northern-defense"],
    personnel: 3000,
  },
  {
    id: "il-haifa",
    name: "Haifa Naval Base",
    country: "IL",
    hostCountry: "IL",
    type: "naval",
    lat: 32.8181,
    lng: 34.9764,
    status: "active",
    capabilities: ["Dolphin-class submarine", "Sa'ar-6 corvette", "Iron-Dome-naval"],
    personnel: 5000,
  },
  {
    id: "il-palmachim",
    name: "Palmachim Air Base",
    country: "IL",
    hostCountry: "IL",
    type: "missile",
    lat: 31.8978,
    lng: 34.6906,
    status: "active",
    capabilities: ["Arrow-3 BMD", "Iron-Dome", "Jericho-III ICBM", "Shavit-launch"],
    personnel: 3000,
  },

  // ════════════════ NORTH KOREA ════════════════
  {
    id: "kp-yongbyon",
    name: "Yongbyon Nuclear Complex",
    country: "KP",
    hostCountry: "KP",
    type: "nuclear",
    lat: 39.7958,
    lng: 125.7553,
    status: "active",
    capabilities: ["plutonium-reactor", "uranium-enrichment", "nuclear-weapons"],
    personnel: 5000,
  },
  {
    id: "kp-sohae",
    name: "Sohae Satellite Launch Station",
    country: "KP",
    hostCountry: "KP",
    type: "missile",
    lat: 39.6603,
    lng: 124.705,
    status: "active",
    capabilities: ["ICBM-test", "satellite-launch", "Hwasong-17"],
    personnel: 2000,
  },
  {
    id: "kp-sinpo",
    name: "Sinpo South Shipyard",
    country: "KP",
    hostCountry: "KP",
    type: "naval",
    lat: 39.875,
    lng: 128.175,
    status: "active",
    capabilities: ["SLBM-submarine", "Gorae-class", "Pukguksong"],
    personnel: 3000,
  },
  {
    id: "kp-wonsan",
    name: "Wonsan Air Base / Kalma",
    country: "KP",
    hostCountry: "KP",
    type: "air",
    lat: 39.1667,
    lng: 127.4833,
    status: "active",
    capabilities: ["MiG-29", "Su-25", "forward-deployed"],
    personnel: 3000,
  },

  // ════════════════ INDIA ════════════════
  {
    id: "in-visakhapatnam",
    name: "INS Visakhapatnam (Eastern Naval Command)",
    country: "IN",
    hostCountry: "IN",
    type: "naval",
    lat: 17.7231,
    lng: 83.3186,
    status: "active",
    capabilities: ["Vikrant-carrier", "Arihant-SSBN", "Eastern-Naval-HQ"],
    personnel: 30000,
  },
  {
    id: "in-agra",
    name: "Agra Air Force Station",
    country: "IN",
    hostCountry: "IN",
    type: "air",
    lat: 27.1551,
    lng: 77.9608,
    status: "active",
    capabilities: ["Su-30MKI", "strategic-airlift", "C-17"],
    personnel: 5000,
  },
  {
    id: "in-wheeler",
    name: "Wheeler Island (Abdul Kalam Island)",
    country: "IN",
    hostCountry: "IN",
    type: "missile",
    lat: 20.75,
    lng: 87.0833,
    status: "active",
    capabilities: ["Agni-V ICBM", "BrahMos", "missile-test"],
    personnel: 1000,
  },

  // ════════════════ PAKISTAN ════════════════
  {
    id: "pk-kamra",
    name: "Kamra Air Base",
    country: "PK",
    hostCountry: "PK",
    type: "air",
    lat: 33.869,
    lng: 72.401,
    status: "active",
    capabilities: ["JF-17", "F-16", "Mirage-III", "PAC-HQ"],
    personnel: 8000,
  },
  {
    id: "pk-kahuta",
    name: "Kahuta Research Laboratories",
    country: "PK",
    hostCountry: "PK",
    type: "nuclear",
    lat: 33.596,
    lng: 73.386,
    status: "active",
    capabilities: ["uranium-enrichment", "nuclear-weapons", "centrifuge"],
    personnel: 3000,
  },

  // ════════════════ SAUDI ARABIA ════════════════
  {
    id: "sa-prince-sultan",
    name: "Prince Sultan Air Base",
    country: "SA",
    hostCountry: "SA",
    type: "air",
    lat: 24.0625,
    lng: 47.5847,
    status: "active",
    capabilities: ["F-15SA", "Patriot-PAC-3", "USAF-rotation"],
    personnel: 5000,
  },
  {
    id: "sa-king-khalid",
    name: "King Khalid Military City",
    country: "SA",
    hostCountry: "SA",
    type: "army",
    lat: 27.9061,
    lng: 45.5339,
    status: "active",
    capabilities: ["brigade-garrison", "Northern-border-defense"],
    personnel: 50000,
  },

  // ════════════════ TURKEY ════════════════
  {
    id: "tr-diyarbakir",
    name: "Diyarbakır Air Base",
    country: "TR",
    hostCountry: "TR",
    type: "air",
    lat: 37.8939,
    lng: 40.2086,
    status: "active",
    capabilities: ["F-16", "drone-operations", "counter-PKK"],
    personnel: 5000,
  },

  // ════════════════ EGYPT ════════════════
  {
    id: "eg-berenice",
    name: "Berenice Military Base",
    country: "EG",
    hostCountry: "EG",
    type: "joint",
    lat: 23.957,
    lng: 35.462,
    status: "active",
    capabilities: ["Red-Sea-control", "naval-air", "Rafale"],
    personnel: 5000,
  },
];

// ─── Carrier Battle Groups ───────────────────────────────────────

export const CARRIER_GROUPS: CarrierGroup[] = [
  // US Navy
  {
    id: "cvn-78",
    name: "USS Gerald R. Ford",
    hullNumber: "CVN-78",
    country: "US",
    lat: 36.8,
    lng: 14.5,
    heading: 90,
    speed: 15,
    lastUpdated: Date.now(),
    homePort: "Norfolk, VA",
    status: "deployed",
    battleGroup: [
      "USS Normandy (CG-60)",
      "USS Ramage (DDG-61)",
      "USS McFaul (DDG-74)",
      "USS Thomas Hudner (DDG-116)",
    ],
    aircraftComplement: [
      "F/A-18E/F Super Hornet",
      "EA-18G Growler",
      "E-2D Advanced Hawkeye",
      "MH-60R/S Seahawk",
      "CMV-22B Osprey",
    ],
  },
  {
    id: "cvn-72",
    name: "USS Abraham Lincoln",
    hullNumber: "CVN-72",
    country: "US",
    lat: 25.5,
    lng: 57.0,
    heading: 270,
    speed: 12,
    lastUpdated: Date.now(),
    homePort: "San Diego, CA",
    status: "deployed",
    battleGroup: ["USS Spruance (DDG-111)", "USS Dewey (DDG-105)", "USS Mobile Bay (CG-53)"],
    aircraftComplement: ["F-35C Lightning II", "F/A-18E/F Super Hornet", "EA-18G Growler"],
  },
  {
    id: "cvn-76",
    name: "USS Ronald Reagan",
    hullNumber: "CVN-76",
    country: "US",
    lat: 33.5,
    lng: 135.0,
    heading: 180,
    speed: 0,
    lastUpdated: Date.now(),
    homePort: "Yokosuka, Japan",
    status: "port",
    battleGroup: ["USS Shiloh (CG-67)", "USS Barry (DDG-52)", "USS Milius (DDG-69)"],
    aircraftComplement: ["F/A-18E/F Super Hornet", "EA-18G Growler", "E-2D Advanced Hawkeye"],
  },
  {
    id: "cvn-71",
    name: "USS Theodore Roosevelt",
    hullNumber: "CVN-71",
    country: "US",
    lat: 7.0,
    lng: 117.0,
    heading: 45,
    speed: 18,
    lastUpdated: Date.now(),
    homePort: "San Diego, CA",
    status: "deployed",
    battleGroup: ["USS Bunker Hill (CG-52)", "USS Russell (DDG-59)", "USS Pinckney (DDG-91)"],
    aircraftComplement: ["F/A-18E/F Super Hornet", "CMV-22B Osprey"],
  },
  {
    id: "cvn-74",
    name: "USS John C. Stennis",
    hullNumber: "CVN-74",
    country: "US",
    lat: 36.9,
    lng: -76.3,
    heading: 0,
    speed: 0,
    lastUpdated: Date.now(),
    homePort: "Norfolk, VA",
    status: "port",
    battleGroup: ["USS Monterey (CG-61)", "USS Stout (DDG-55)"],
    aircraftComplement: ["F/A-18E/F Super Hornet"],
  },
  // France
  {
    id: "r91",
    name: "Charles de Gaulle",
    hullNumber: "R91",
    country: "FR",
    lat: 33.0,
    lng: 32.0,
    heading: 120,
    speed: 14,
    lastUpdated: Date.now(),
    homePort: "Toulon, France",
    status: "deployed",
    battleGroup: ["FS Forbin (D620)", "FS Chevalier Paul (D621)", "FS Provence (D652)"],
    aircraftComplement: ["Rafale M", "E-2C Hawkeye", "NH90 Caïman"],
  },
  // UK
  {
    id: "r08",
    name: "HMS Queen Elizabeth",
    hullNumber: "R08",
    country: "GB",
    lat: 50.8,
    lng: -1.1,
    heading: 0,
    speed: 0,
    lastUpdated: Date.now(),
    homePort: "Portsmouth, UK",
    status: "port",
    battleGroup: ["HMS Defender (D36)", "HMS Diamond (D34)", "HMS Northumberland (F238)"],
    aircraftComplement: ["F-35B Lightning II", "AW-101 Merlin"],
  },
  // China
  {
    id: "cv-18",
    name: "Fujian (Type 003)",
    hullNumber: "CV-18",
    country: "CN",
    lat: 31.3,
    lng: 122.0,
    heading: 90,
    speed: 0,
    lastUpdated: Date.now(),
    homePort: "Shanghai, China",
    status: "port",
    battleGroup: ["Type 055 Renhai-class", "Type 052D Luyang III-class"],
    aircraftComplement: ["J-35", "J-15T", "KJ-600 AEW"],
  },
  {
    id: "cv-17",
    name: "Shandong (Type 002)",
    hullNumber: "CV-17",
    country: "CN",
    lat: 18.3,
    lng: 109.5,
    heading: 180,
    speed: 10,
    lastUpdated: Date.now(),
    homePort: "Sanya, Hainan, China",
    status: "deployed",
    battleGroup: ["Type 055 Lhasa", "Type 052D Taiyuan"],
    aircraftComplement: ["J-15", "Z-20", "Z-9"],
  },
  // India
  {
    id: "r11",
    name: "INS Vikrant",
    hullNumber: "R11",
    country: "IN",
    lat: 17.7,
    lng: 83.3,
    heading: 0,
    speed: 0,
    lastUpdated: Date.now(),
    homePort: "Visakhapatnam, India",
    status: "port",
    battleGroup: ["INS Kolkata (D63)", "INS Chennai (D65)"],
    aircraftComplement: ["MiG-29K", "Ka-31 AEW", "MH-60R Seahawk"],
  },
  // Russia
  {
    id: "ru-kuznetsov",
    name: "Admiral Kuznetsov",
    hullNumber: "063",
    country: "RU",
    lat: 69.1,
    lng: 33.4,
    heading: 0,
    speed: 0,
    lastUpdated: Date.now(),
    homePort: "Severomorsk, Russia",
    status: "port",
    battleGroup: ["Pyotr Velikiy (099)", "Marshal Ustinov (055)"],
    aircraftComplement: ["Su-33", "MiG-29K", "Ka-52K"],
  },
];

// ─── Predefined Theaters ────────────────────────────────────────

export const THEATERS: TheaterConfig[] = [
  {
    center: [33.0, 44.0],
    zoom: 5,
    name: "Middle East",
    description: "Persian Gulf, Levant, Arabian Peninsula",
    countries: ["IR", "IQ", "SA", "IL", "SY", "YE", "QA", "BH", "KW", "AE"],
  },
  {
    center: [48.0, 37.0],
    zoom: 5,
    name: "Ukraine Theater",
    description: "Eastern Europe & Black Sea",
    countries: ["UA", "RU", "PL"],
  },
  {
    center: [20.0, 115.0],
    zoom: 4,
    name: "Indo-Pacific",
    description: "South China Sea, Taiwan Strait, Korean Peninsula",
    countries: ["CN", "TW", "KR", "KP", "JP", "PH"],
  },
  {
    center: [65.0, 25.0],
    zoom: 4,
    name: "Arctic & North Atlantic",
    description: "GIUK Gap, Barents Sea, Arctic routes",
    countries: ["NO", "RU", "IS", "GB"],
  },
  {
    center: [11.0, 43.0],
    zoom: 6,
    name: "Horn of Africa",
    description: "Djibouti, Red Sea, Gulf of Aden",
    countries: ["DJ", "YE", "EG"],
  },
  {
    center: [30.0, 70.0],
    zoom: 5,
    name: "South Asia",
    description: "India-Pakistan border, Indian Ocean",
    countries: ["IN", "PK", "AF"],
  },
];

// ─── Strike Events (Active / Historical) ─────────────────────────

const strikeEvents: StrikeEvent[] = [];
let strikeIdCounter = 0;

/**
 * Record a strike event (from OSINT detection or simulation).
 */
export function recordStrikeEvent(event: Omit<StrikeEvent, "id">): StrikeEvent {
  const strike: StrikeEvent = {
    ...event,
    id: `strike-${++strikeIdCounter}`,
  };
  strikeEvents.unshift(strike);
  if (strikeEvents.length > 500) {
    strikeEvents.length = 500;
  }
  return strike;
}

/**
 * Create a simulated strike event for visualization.
 */
export function simulateStrike(params: {
  type: StrikeType;
  originBaseId?: string;
  originCarrierId?: string;
  targetCoords: [number, number];
  targetDescription: string;
  weapon?: string;
  platform?: string;
  country: string;
  targetCountry: string;
}): StrikeEvent {
  // Resolve origin coordinates
  let originCoords: [number, number] = [0, 0];

  if (params.originBaseId) {
    const base = MILITARY_BASES.find((b) => b.id === params.originBaseId);
    if (base) {
      originCoords = [base.lat, base.lng];
    }
  } else if (params.originCarrierId) {
    const carrier = CARRIER_GROUPS.find((c) => c.id === params.originCarrierId);
    if (carrier) {
      originCoords = [carrier.lat, carrier.lng];
    }
  }

  return recordStrikeEvent({
    ...params,
    originCoords,
    timestamp: Date.now(),
    source: "simulation",
    verified: false,
    narrative: `[SIMULATED] ${params.platform ?? params.weapon ?? params.type} strike from ${params.country} → ${params.targetDescription} (${params.targetCountry})`,
  });
}

// ─── Public API ──────────────────────────────────────────────────

/** Get all military bases, optionally filtered */
export function getBases(params?: {
  country?: string;
  hostCountry?: string;
  type?: BaseType;
  limit?: number;
}): MilitaryBase[] {
  let bases = [...MILITARY_BASES];
  if (params?.country) {
    bases = bases.filter((b) => b.country === params.country!.toUpperCase());
  }
  if (params?.hostCountry) {
    bases = bases.filter((b) => b.hostCountry === params.hostCountry!.toUpperCase());
  }
  if (params?.type) {
    bases = bases.filter((b) => b.type === params.type);
  }
  return bases.slice(0, params?.limit ?? 500);
}

/** Get all carrier battle groups */
export function getCarriers(params?: {
  country?: string;
  status?: CarrierGroup["status"];
}): CarrierGroup[] {
  let carriers = [...CARRIER_GROUPS];
  if (params?.country) {
    carriers = carriers.filter((c) => c.country === params.country!.toUpperCase());
  }
  if (params?.status) {
    carriers = carriers.filter((c) => c.status === params.status);
  }
  return carriers;
}

/** Get strike events */
export function getStrikes(params?: {
  country?: string;
  targetCountry?: string;
  type?: StrikeType;
  since?: number;
  limit?: number;
}): StrikeEvent[] {
  let events = [...strikeEvents];
  if (params?.country) {
    events = events.filter((e) => e.country === params.country!.toUpperCase());
  }
  if (params?.targetCountry) {
    events = events.filter((e) => e.targetCountry === params.targetCountry!.toUpperCase());
  }
  if (params?.type) {
    events = events.filter((e) => e.type === params.type);
  }
  if (params?.since) {
    events = events.filter((e) => e.timestamp >= params.since!);
  }
  return events.slice(0, params?.limit ?? 100);
}

/** Get theater configurations */
export function getTheaters(): TheaterConfig[] {
  return [...THEATERS];
}

/** Get base type color for map legend */
export function getBaseTypeColor(type: BaseType): string {
  const colors: Record<BaseType, string> = {
    air: "#EF4444", // red
    naval: "#3B82F6", // blue
    army: "#22C55E", // green
    missile: "#6B7280", // gray
    nuclear: "#000000", // black
    joint: "#F59E0B", // amber
    cyber: "#8B5CF6", // purple
    space: "#06B6D4", // cyan
  };
  return colors[type];
}

/** Get base type icon for map */
export function getBaseTypeIcon(type: BaseType): string {
  const icons: Record<BaseType, string> = {
    air: "✈️",
    naval: "⚓",
    army: "🏗️",
    missile: "🚀",
    nuclear: "☢️",
    joint: "⭐",
    cyber: "🖥️",
    space: "🛰️",
  };
  return icons[type];
}

/** Summary statistics */
export function getTheaterStats() {
  const byCountry = new Map<string, number>();
  const byType = new Map<BaseType, number>();
  for (const base of MILITARY_BASES) {
    byCountry.set(base.country, (byCountry.get(base.country) ?? 0) + 1);
    byType.set(base.type, (byType.get(base.type) ?? 0) + 1);
  }

  return {
    totalBases: MILITARY_BASES.length,
    totalCarriers: CARRIER_GROUPS.length,
    totalStrikes: strikeEvents.length,
    basesByCountry: Object.fromEntries(byCountry),
    basesByType: Object.fromEntries(byType),
    theaters: THEATERS.length,
    deployedCarriers: CARRIER_GROUPS.filter((c) => c.status === "deployed").length,
  };
}
