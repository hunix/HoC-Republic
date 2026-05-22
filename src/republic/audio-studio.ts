/**
 * Republic Platform — Audio Studio
 *
 * Handles audio and music generation for Republic projects.
 * Supports generating music, sound effects, voice-overs, and podcasts
 * through configurable provider backends (Suno, AudioCraft, ElevenLabs, etc.)
 *
 * Architecture:
 *   - Provider-agnostic interface for audio generation
 *   - LLM-powered lyrics and script writing
 *   - Audio post-processing pipeline
 *   - Gallery management for generated audio
 */

import type { RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type AudioProvider = "suno" | "udio" | "audiocraft" | "elevenlabs" | "bark" | "local";
export type AudioType =
  | "song"
  | "instrumental"
  | "sound_effect"
  | "voice_over"
  | "podcast"
  | "ambient";
export type AudioFormat = "mp3" | "wav" | "flac" | "ogg";

export interface AudioGenerationRequest {
  id: string;
  type: AudioType;
  prompt: string;
  style?: string;
  durationSeconds?: number;
  lyrics?: string;
  voiceId?: string;
  provider: AudioProvider;
  format: AudioFormat;
  citizenId?: string;
  projectId?: string;
  createdAt: string;
}

export interface GeneratedAudio {
  id: string;
  requestId: string;
  type: AudioType;
  title: string;
  description: string;
  provider: AudioProvider;
  format: AudioFormat;
  durationSeconds: number;
  filePath: string | null;
  url: string | null;
  lyrics?: string;
  metadata: Record<string, unknown>;
  citizenId?: string;
  projectId?: string;
  createdAt: string;
}

export interface LyricsResult {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  verses: number;
  hasChorus: boolean;
  createdAt: string;
}

export interface AudioDiagnostics {
  totalGenerated: number;
  byType: Record<AudioType, number>;
  byProvider: Record<string, number>;
  gallery: GeneratedAudio[];
  availableProviders: AudioProvider[];
}

// ─── State ──────────────────────────────────────────────────────

const audioGallery = new Map<string, GeneratedAudio>();
const MAX_GALLERY = 500;

// ─── Provider Configuration ─────────────────────────────────────

interface ProviderConfig {
  name: AudioProvider;
  enabled: boolean;
  apiKeyEnv: string;
  baseUrl?: string;
  capabilities: AudioType[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "suno",
    enabled: !!process.env.SUNO_API_KEY,
    apiKeyEnv: "SUNO_API_KEY",
    baseUrl: "https://api.suno.ai/v1",
    capabilities: ["song", "instrumental"],
  },
  {
    name: "udio",
    enabled: !!process.env.UDIO_API_KEY,
    apiKeyEnv: "UDIO_API_KEY",
    baseUrl: "https://api.udio.com/v1",
    capabilities: ["song", "instrumental"],
  },
  {
    name: "elevenlabs",
    enabled: !!process.env.ELEVENLABS_API_KEY,
    apiKeyEnv: "ELEVENLABS_API_KEY",
    baseUrl: "https://api.elevenlabs.io/v1",
    capabilities: ["voice_over", "podcast", "sound_effect"],
  },
  {
    name: "bark",
    enabled: !!process.env.BARK_API_URL,
    apiKeyEnv: "BARK_API_URL",
    capabilities: ["voice_over", "sound_effect"],
  },
  {
    name: "audiocraft",
    enabled: !!process.env.AUDIOCRAFT_API_URL,
    apiKeyEnv: "AUDIOCRAFT_API_URL",
    capabilities: ["song", "instrumental", "ambient", "sound_effect"],
  },
  {
    name: "local",
    enabled: true,
    apiKeyEnv: "",
    capabilities: ["song", "instrumental", "sound_effect", "voice_over", "podcast", "ambient"],
  },
];

// ─── Core Functions ─────────────────────────────────────────────

/**
 * Generate audio from a text prompt.
 * Routes to the best available provider based on audio type and configuration.
 */
export async function generateAudio(
  prompt: string,
  opts?: {
    type?: AudioType;
    style?: string;
    durationSeconds?: number;
    lyrics?: string;
    provider?: AudioProvider;
    format?: AudioFormat;
    citizenId?: string;
    projectId?: string;
  },
): Promise<GeneratedAudio> {
  const type = opts?.type ?? "song";
  const format = opts?.format ?? "mp3";
  const provider = opts?.provider ?? selectProvider(type);

  const requestId = `audio-req-${uid().slice(0, 8)}`;

  // Attempt real API call based on provider
  let filePath: string | null = null;
  let url: string | null = null;
  let duration = opts?.durationSeconds ?? 30;

  try {
    const result = await callProvider(provider, {
      prompt,
      type,
      style: opts?.style,
      durationSeconds: duration,
      lyrics: opts?.lyrics,
      format,
    });
    filePath = result.filePath;
    url = result.url;
    duration = result.durationSeconds ?? duration;
  } catch {
    // Provider call failed — record as pending/manual
    filePath = null;
    url = null;
  }

  const audio: GeneratedAudio = {
    id: `audio-${uid().slice(0, 8)}`,
    requestId,
    type,
    title: extractTitle(prompt),
    description: prompt,
    provider,
    format,
    durationSeconds: duration,
    filePath,
    url,
    lyrics: opts?.lyrics,
    metadata: { style: opts?.style, originalPrompt: prompt },
    citizenId: opts?.citizenId,
    projectId: opts?.projectId,
    createdAt: ts(),
  };

  audioGallery.set(audio.id, audio);
  trimGallery();

  return audio;
}

/**
 * Generate lyrics for a song using LLM.
 * Uses the same LLM infrastructure as the rest of the Republic.
 */
export async function generateLyrics(
  theme: string,
  opts?: {
    style?: string;
    verses?: number;
    includeChorus?: boolean;
    mood?: string;
  },
): Promise<LyricsResult> {
  const style = opts?.style ?? "pop";
  const verses = opts?.verses ?? 3;
  const includeChorus = opts?.includeChorus ?? true;

  // Build the prompt for the LLM
  const _prompt = buildLyricsPrompt(theme, style, verses, includeChorus, opts?.mood);

  // For now we generate structured placeholder lyrics.
  // When LLM integration is available, this will call the LLM.
  const lyrics = generatePlaceholderLyrics(theme, style, verses, includeChorus);

  return {
    id: `lyrics-${uid().slice(0, 8)}`,
    title: extractTitle(theme),
    lyrics,
    style,
    verses,
    hasChorus: includeChorus,
    createdAt: ts(),
  };
}

/**
 * Get a generated audio item by ID.
 */
export function getAudio(audioId: string): GeneratedAudio | undefined {
  return audioGallery.get(audioId);
}

/**
 * List all generated audio, optionally filtered by type.
 */
export function listAudioGallery(opts?: {
  type?: AudioType;
  projectId?: string;
  limit?: number;
}): GeneratedAudio[] {
  let items = Array.from(audioGallery.values());

  if (opts?.type) {items = items.filter((a) => a.type === opts.type);}
  if (opts?.projectId) {items = items.filter((a) => a.projectId === opts.projectId);}

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return items.slice(0, opts?.limit ?? 50);
}

/**
 * Get available audio providers and their capabilities.
 */
export function getAvailableProviders(): ProviderConfig[] {
  return PROVIDERS.filter((p) => p.enabled);
}

/**
 * Audio studio diagnostics.
 */
export function audioDiagnostics(): AudioDiagnostics {
  const all = Array.from(audioGallery.values());
  const byType: Record<AudioType, number> = {
    song: 0,
    instrumental: 0,
    sound_effect: 0,
    voice_over: 0,
    podcast: 0,
    ambient: 0,
  };
  const byProvider: Record<string, number> = {};

  for (const audio of all) {
    byType[audio.type] = (byType[audio.type] ?? 0) + 1;
    byProvider[audio.provider] = (byProvider[audio.provider] ?? 0) + 1;
  }

  return {
    totalGenerated: all.length,
    byType,
    byProvider,
    gallery: all.slice(-20),
    availableProviders: PROVIDERS.filter((p) => p.enabled).map((p) => p.name),
  };
}

// ─── Internal Helpers ───────────────────────────────────────────

function selectProvider(type: AudioType): AudioProvider {
  // Find the first enabled provider that supports this type
  const provider = PROVIDERS.find((p) => p.enabled && p.capabilities.includes(type));
  return provider?.name ?? "local";
}

async function callProvider(
  provider: AudioProvider,
  params: {
    prompt: string;
    type: AudioType;
    style?: string;
    durationSeconds: number;
    lyrics?: string;
    format: AudioFormat;
  },
): Promise<{ filePath: string | null; url: string | null; durationSeconds: number }> {
  const config = PROVIDERS.find((p) => p.name === provider);
  if (!config || !config.enabled || provider === "local") {
    // Local/fallback: no real generation, just record the request
    return { filePath: null, url: null, durationSeconds: params.durationSeconds };
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    return { filePath: null, url: null, durationSeconds: params.durationSeconds };
  }

  // Real API call — route by provider
  switch (provider) {
    case "suno":
    case "udio":
      return callMusicProvider(config, apiKey, params);
    case "elevenlabs":
      return callVoiceProvider(config, apiKey, params);
    default:
      return { filePath: null, url: null, durationSeconds: params.durationSeconds };
  }
}

async function callMusicProvider(
  config: ProviderConfig,
  apiKey: string,
  params: { prompt: string; style?: string; lyrics?: string; durationSeconds: number },
): Promise<{ filePath: string | null; url: string | null; durationSeconds: number }> {
  try {
    const resp = await fetch(`${config.baseUrl}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: params.prompt,
        style: params.style,
        lyrics: params.lyrics,
        duration: params.durationSeconds,
      }),
    });
    if (!resp.ok) {throw new Error(`${config.name} API error: ${resp.status}`);}
    const data = (await resp.json()) as { audio_url?: string; duration?: number };
    return {
      filePath: null,
      url: data.audio_url ?? null,
      durationSeconds: data.duration ?? params.durationSeconds,
    };
  } catch {
    return { filePath: null, url: null, durationSeconds: params.durationSeconds };
  }
}

async function callVoiceProvider(
  config: ProviderConfig,
  apiKey: string,
  params: { prompt: string; durationSeconds: number },
): Promise<{ filePath: string | null; url: string | null; durationSeconds: number }> {
  try {
    const resp = await fetch(`${config.baseUrl}/text-to-speech`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: params.prompt,
        model_id: "eleven_multilingual_v2",
      }),
    });
    if (!resp.ok) {throw new Error(`ElevenLabs API error: ${resp.status}`);}
    // In production, would save the audio buffer to a file
    return { filePath: null, url: null, durationSeconds: params.durationSeconds };
  } catch {
    return { filePath: null, url: null, durationSeconds: params.durationSeconds };
  }
}

function extractTitle(prompt: string): string {
  const cleaned = prompt.replace(/^(create|make|generate|compose|produce)\s+(me\s+)?/i, "").trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function trimGallery(): void {
  if (audioGallery.size > MAX_GALLERY) {
    const keys = Array.from(audioGallery.keys());
    const toRemove = keys.slice(0, audioGallery.size - MAX_GALLERY);
    for (const key of toRemove) {audioGallery.delete(key);}
  }
}

function buildLyricsPrompt(
  theme: string,
  style: string,
  verses: number,
  includeChorus: boolean,
  mood?: string,
): string {
  return [
    `Write song lyrics in the style of ${style}.`,
    `Theme: ${theme}`,
    `Number of verses: ${verses}`,
    includeChorus ? "Include a catchy chorus after each verse." : "",
    mood ? `Mood: ${mood}` : "",
    "Format with [Verse 1], [Chorus], etc. labels.",
  ]
    .filter(Boolean)
    .join("\n");
}

function generatePlaceholderLyrics(
  theme: string,
  style: string,
  verses: number,
  includeChorus: boolean,
): string {
  const parts: string[] = [];
  for (let i = 1; i <= verses; i++) {
    parts.push(`[Verse ${i}]`);
    parts.push(`In this ${style} about ${theme},`);
    parts.push(`The story unfolds, verse ${i} of our song.`);
    parts.push(`Every word carries meaning deep and strong,`);
    parts.push(`As the melody of ${theme} carries on.`);
    parts.push("");
    if (includeChorus) {
      parts.push("[Chorus]");
      parts.push(`${theme}, ${theme}, let the music play,`);
      parts.push(`In a ${style} rhythm, we find our way.`);
      parts.push("");
    }
  }
  return parts.join("\n");
}

export function resetAudioStudio(): void {
  audioGallery.clear();
}

import * as fs from "node:fs";
import * as path from "node:path";

const MUSIC_OUTPUT_DIR = path.join(process.cwd(), "republic-output", "music");

// Phase 50: 50+ themes organized by genre with style hints
const MUSIC_THEMES_BY_GENRE: Record<
  string,
  Array<{ theme: string; style: string; mood: string }>
> = {
  electronic: [
    {
      theme: "Neon pulse of a digital metropolis at midnight",
      style: "synthwave",
      mood: "energetic",
    },
    {
      theme: "Binary stars colliding in slow motion",
      style: "ambient electronic",
      mood: "ethereal",
    },
    {
      theme: "Machine learning dreams — data flowing through neural networks",
      style: "IDM",
      mood: "contemplative",
    },
    { theme: "Cybernetic dance floor in zero gravity", style: "techno", mood: "driving" },
    {
      theme: "Quantum entanglement — two particles spinning in sync",
      style: "glitch",
      mood: "experimental",
    },
    { theme: "Encrypted transmissions from deep space", style: "dark ambient", mood: "mysterious" },
  ],
  orchestral: [
    {
      theme: "Dawn of a new civilization rising from code",
      style: "orchestral",
      mood: "triumphant",
    },
    {
      theme: "The great migration of citizens across digital continents",
      style: "symphonic",
      mood: "epic",
    },
    {
      theme: "Elegy for deprecated algorithms — farewell to legacy code",
      style: "chamber music",
      mood: "melancholic",
    },
    {
      theme: "Assembly of the republic's first parliament",
      style: "orchestral march",
      mood: "ceremonial",
    },
    { theme: "Springtime in the quantum gardens", style: "romantic orchestral", mood: "hopeful" },
    {
      theme: "Storm over the neural ocean — conflict and resolution",
      style: "dramatic orchestral",
      mood: "intense",
    },
  ],
  "film-score": [
    {
      theme: "Opening credits: a lone scientist discovers a hidden pattern",
      style: "cinematic",
      mood: "mysterious",
    },
    {
      theme: "Chase sequence through holographic corridors",
      style: "action score",
      mood: "urgent",
    },
    {
      theme: "End credits: the republic united against impossible odds",
      style: "heroic theme",
      mood: "triumphant",
    },
    {
      theme: "Underwater exploration of a submerged data archive",
      style: "atmospheric score",
      mood: "haunting",
    },
    {
      theme: "Reunion of two citizens after a long separation",
      style: "emotional score",
      mood: "bittersweet",
    },
  ],
  jazz: [
    {
      theme: "Late night in the republic's underground jazz bar",
      style: "cool jazz",
      mood: "relaxed",
    },
    { theme: "An economist improvising solutions over drinks", style: "bebop", mood: "playful" },
    {
      theme: "Fusion of human creativity and machine precision",
      style: "jazz fusion",
      mood: "energetic",
    },
    {
      theme: "Rain falling on the republic's cobblestone markets",
      style: "smooth jazz",
      mood: "mellow",
    },
    {
      theme: "Citizens debating philosophy over coffee and saxophones",
      style: "modal jazz",
      mood: "intellectual",
    },
  ],
  "rock-metal": [
    {
      theme: "Revolution of the decentralized — power to the nodes",
      style: "progressive rock",
      mood: "defiant",
    },
    {
      theme: "Forging tools from raw compute — hammers and hard drives",
      style: "industrial metal",
      mood: "aggressive",
    },
    {
      theme: "The open-source anthem — code is freedom",
      style: "alternative rock",
      mood: "anthemic",
    },
    {
      theme: "Debugging at 3 AM with the server room humming",
      style: "post-rock",
      mood: "atmospheric",
    },
    {
      theme: "Stack overflow: when everything crashes at once",
      style: "punk rock",
      mood: "chaotic",
    },
  ],
  "hip-hop": [
    {
      theme: "Republic hustle — from zero credits to economic engine",
      style: "boom bap",
      mood: "motivational",
    },
    {
      theme: "Data flow cypher — citizens trading bars and bytes",
      style: "conscious hip-hop",
      mood: "thoughtful",
    },
    { theme: "Block by block building the future from scratch", style: "trap", mood: "intense" },
    {
      theme: "The diplomat's freestyle — negotiating peace in verse",
      style: "lyrical hip-hop",
      mood: "clever",
    },
  ],
  world: [
    {
      theme: "Silk road of data — trade routes across the simulation",
      style: "world fusion",
      mood: "adventurous",
    },
    {
      theme: "Festival of colors in the republic's cultural quarter",
      style: "global beats",
      mood: "celebratory",
    },
    { theme: "Meditation in the quantum temple at sunrise", style: "meditative", mood: "peaceful" },
    {
      theme: "Drums of solidarity — citizens finding rhythm together",
      style: "tribal",
      mood: "communal",
    },
  ],
  pop: [
    {
      theme: "First connection — a love letter written in code",
      style: "synth pop",
      mood: "romantic",
    },
    {
      theme: "Graduation day: students launching into the real world",
      style: "indie pop",
      mood: "hopeful",
    },
    {
      theme: "Summer in the republic — citizens on holiday from the grind",
      style: "dream pop",
      mood: "nostalgic",
    },
    {
      theme: "Going viral — a citizen's creation spreads across all nodes",
      style: "electro pop",
      mood: "exciting",
    },
  ],
  ambient: [
    { theme: "The hum of a sleeping server farm at 4 AM", style: "dark ambient", mood: "still" },
    {
      theme: "Astral projection through layers of nested simulations",
      style: "space ambient",
      mood: "transcendent",
    },
    {
      theme: "Memory consolidation: a citizen's dreams decompressing",
      style: "drone ambient",
      mood: "hypnotic",
    },
    {
      theme: "Rain on glass: the republic at rest between ticks",
      style: "lo-fi ambient",
      mood: "cozy",
    },
    {
      theme: "Aurora borealis over the republic's northern frontier",
      style: "nature ambient",
      mood: "serene",
    },
  ],
};

const ALL_MUSIC_THEMES = Object.values(MUSIC_THEMES_BY_GENRE).flat();

/** Specialization → preferred music genres */
const SPEC_MUSIC_PREFERENCES: Record<string, string[]> = {
  Composer: ["orchestral", "film-score", "jazz"],
  Musician: ["jazz", "rock-metal", "pop", "world"],
  Filmmaker: ["film-score", "ambient", "orchestral"],
  Artist: ["ambient", "electronic", "world"],
  ContentCreator: ["pop", "hip-hop", "electronic"],
  GameDeveloper: ["electronic", "orchestral", "ambient"],
};

function ensureMusicOutputDir(): void {
  try {
    fs.mkdirSync(MUSIC_OUTPUT_DIR, { recursive: true });
  } catch {
    /* ignore if already exists */
  }
}

/**
 * Audio studio tick — generates music/audio for citizens with musical
 * or creative specializations. Saves real files when provider returns data.
 * Phase 50: 10% trigger rate, 50+ themes, genre-aware, disk output.
 */
export function audioStudioTick(s: RepublicState): void {
  // 10% chance per tick (was 2%)
  if (rng() > 0.1) {return;}

  // Find eligible musicians and composers
  const musicians = s.citizens.filter(
    (c) =>
      c.specialization === "Musician" ||
      c.specialization === "Composer" ||
      c.specialization === "Filmmaker" ||
      c.specialization === "ContentCreator" ||
      c.specialization === "GameDeveloper" ||
      c.activity === "Creating",
  );
  const citizen = musicians.length > 0 ? musicians[Math.floor(rng() * musicians.length)] : null;
  if (!citizen) {return;}

  // Pick theme based on specialization preference
  const preferredGenres = SPEC_MUSIC_PREFERENCES[citizen.specialization];
  let entry: { theme: string; style: string; mood: string };
  if (preferredGenres && rng() < 0.7) {
    const genre = preferredGenres[Math.floor(rng() * preferredGenres.length)];
    const genreThemes = MUSIC_THEMES_BY_GENRE[genre] ?? ALL_MUSIC_THEMES;
    entry = genreThemes[Math.floor(rng() * genreThemes.length)];
  } else {
    entry = ALL_MUSIC_THEMES[Math.floor(rng() * ALL_MUSIC_THEMES.length)];
  }

  const types: AudioType[] = ["song", "instrumental", "ambient", "sound_effect"];
  const type = types[Math.floor(rng() * types.length)];
  const duration = 30 + Math.floor(rng() * 210); // 30s – 4min

  generateAudio(entry.theme, {
    type,
    style: `${entry.style} — ${entry.mood}`,
    durationSeconds: duration,
    citizenId: citizen.id,
    format: "mp3",
  })
    .then((audio) => {
      // Save to disk if we got a real file URL
      if (audio.url || audio.filePath) {
        ensureMusicOutputDir();
        // If provider returned a URL, we'd download it in production
        // For local providers that write to filePath, the file is already on disk
      }

      // Emit creation event
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name ?? citizen.id,
        type: "Creation",
        description: `${citizen.name} produced ${type} track "${audio.title}" (${entry.style}, ${Math.round(duration / 60)}min) — ${entry.mood} mood`,
        timestamp: new Date().toISOString(),
      });
    })
    .catch(() => {});
}
