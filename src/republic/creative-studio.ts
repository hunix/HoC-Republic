/**
 * Republic Platform — Creative Studio
 *
 * Citizens can generate, edit, and compose visual content using
 * multimodal AI services:
 * - DALL-E 3 (OpenAI) — photorealistic + artistic generation
 * - Stable Diffusion (local or API) — open-source diffusion models
 * - ComfyUI (local) — node-based workflow for advanced compositing
 *
 * All providers are loaded lazily. If none are configured the module
 * returns descriptive placeholders so the simulation never crashes.
 */

import { routeImageEdit, routeImageGeneration } from "./media-router.js";
import type { RepublicState } from "./types.js";
import { rand, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type ImageStyle =
  | "photorealistic"
  | "digital-art"
  | "oil-painting"
  | "watercolor"
  | "pixel-art"
  | "3d-render"
  | "sketch"
  | "anime"
  | "poster"
  | "logo";

export type ImageSize = "256" | "512" | "1024" | "1792x1024" | "1024x1792";

export interface GeneratedImage {
  id: string;
  prompt: string;
  revisedPrompt?: string;
  style: ImageStyle;
  provider: "dalle3" | "stable-diffusion" | "comfyui" | "placeholder" | "plugin";
  base64: string;
  width: number;
  height: number;
  createdAt: string;
  citizenId: string;
  costCredits: number;
}

export interface ImageEditRequest {
  sourceBase64: string;
  maskBase64?: string;
  prompt: string;
  style?: ImageStyle;
}

export interface ImageEditResult {
  id: string;
  original: string;
  edited: string;
  prompt: string;
  provider: string;
  createdAt: string;
}

export interface CompositeLayer {
  base64: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blendMode: "normal" | "multiply" | "screen" | "overlay";
}

export interface CompositeResult {
  id: string;
  layerCount: number;
  outputBase64: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface VariationResult {
  id: string;
  original: string;
  variations: string[];
  count: number;
  createdAt: string;
}

export interface UpscaleResult {
  id: string;
  original: string;
  upscaled: string;
  scaleFactor: number;
  outputWidth: number;
  outputHeight: number;
  createdAt: string;
}

// ─── State ──────────────────────────────────────────────────────

const generatedImages: GeneratedImage[] = [];
const MAX_IMAGE_HISTORY = 200;

// ─── Provider Configuration ────────────────────────────────────

// Lazy getter — read process.env on every call (populated by loadDotEnv at boot)
const envKey = (name: string) => process.env[name] || "";
const SD_API_URL = process.env.SD_API_URL ?? "http://127.0.0.1:7860";
const COMFYUI_API_URL = process.env.COMFYUI_API_URL ?? "http://127.0.0.1:8188";

/**
 * Whether DALL-E is allowed for autonomous (tick-driven) generation.
 * Set ALLOW_DALLE_AUTONOMOUS=1 to opt in. Default: OFF to prevent cost overruns.
 * DALL-E is ALWAYS available for explicit user-triggered requests via the API.
 */
const ALLOW_DALLE_AUTONOMOUS = () => process.env.ALLOW_DALLE_AUTONOMOUS === "1";

function getAvailableProvider(): "dalle3" | "stable-diffusion" | "comfyui" | "placeholder" {
  // Local providers are always preferred
  // DALL-E is only reported if explicitly allowed for autonomous use
  if (ALLOW_DALLE_AUTONOMOUS() && envKey("OPENAI_API_KEY")) {
    return "dalle3";
  }
  return "placeholder"; // SD/ComfyUI checked at call time
}

// ─── Image Generation ───────────────────────────────────────────

/**
 * Generate an image from a text prompt.
 * LOCAL-FIRST: Tries SD → ComfyUI → DALL-E (only if ALLOW_DALLE_AUTONOMOUS=1).
 * If no local providers are available and DALL-E is gated, returns a placeholder.
 */
export async function generateImage(
  prompt: string,
  opts?: {
    style?: ImageStyle;
    size?: ImageSize;
    citizenId?: string;
    allowCloud?: boolean; // Explicit user request can bypass the gate
  },
): Promise<GeneratedImage> {
  const style = opts?.style ?? "digital-art";
  const size = opts?.size ?? "1024";
  const citizenId = opts?.citizenId ?? "system";
  const allowCloud = opts?.allowCloud ?? false;
  const sizeNum = parseInt(size, 10) || 1024;

  // 0. Try local GPU plugins first (GLM-Image, OmniGen, Switti, etc.)
  try {
    const pluginResult = await routeImageGeneration(prompt, {
      width: sizeNum,
      height: sizeNum,
      citizenId,
    });
    if (pluginResult?.success) {
      const generated: GeneratedImage = {
        id: uid(),
        prompt,
        style,
        provider: "plugin" as GeneratedImage["provider"],
        base64: pluginResult.base64 ?? "",
        width: sizeNum,
        height: sizeNum,
        createdAt: ts(),
        citizenId,
        costCredits: 0, // Local GPU = free
      };
      archiveImage(generated);
      return generated;
    }
  } catch {
    // Fall through
  }

  // 1. Try Stable Diffusion (local, free)
  try {
    return await generateWithSD(prompt, style, size, citizenId);
  } catch {
    // Fall through
  }

  // 2. Try ComfyUI (local, free)
  try {
    return await generateWithComfyUI(prompt, style, size, citizenId);
  } catch {
    // Fall through
  }

  // 3. DALL-E — only if explicitly allowed (user request or env flag)
  if (envKey("OPENAI_API_KEY") && (allowCloud || ALLOW_DALLE_AUTONOMOUS())) {
    return generateWithDalle3(prompt, style, size, citizenId);
  }

  // 4. Placeholder (free, no API cost)
  return createPlaceholder(prompt, style, citizenId);
}

/**
 * Edit an existing image using inpainting.
 */
export async function editImage(request: ImageEditRequest): Promise<ImageEditResult> {
  const styledPrompt = request.style
    ? `${request.prompt}, in ${request.style} style`
    : request.prompt;

  // 0. Try local GPU plugins first
  try {
    const pluginResult = await routeImageEdit(styledPrompt, [request.sourceBase64]);
    if (pluginResult?.success) {
      return {
        id: uid(),
        original: request.sourceBase64.slice(0, 50),
        edited: pluginResult.base64 ?? "",
        prompt: styledPrompt,
        provider: pluginResult.provider,
        createdAt: ts(),
      };
    }
  } catch {
    // Fall through
  }

  // 1. DALL-E — only if explicitly allowed (gated like generateImage)
  if (envKey("OPENAI_API_KEY") && ALLOW_DALLE_AUTONOMOUS()) {
    try {
      const resp = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-2",
          image: request.sourceBase64,
          mask: request.maskBase64,
          prompt: styledPrompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as { data: { b64_json: string }[] };
        return {
          id: uid(),
          original: request.sourceBase64.slice(0, 50),
          edited: data.data[0]?.b64_json ?? "",
          prompt: styledPrompt,
          provider: "dalle",
          createdAt: ts(),
        };
      }
    } catch {
      // Fall through
    }
  }

  return {
    id: uid(),
    original: request.sourceBase64.slice(0, 50),
    edited: "",
    prompt: styledPrompt,
    provider: "placeholder",
    createdAt: ts(),
  };
}

/**
 * Generate variations of an existing image.
 */
export async function generateVariations(
  sourceBase64: string,
  count = 3,
): Promise<VariationResult> {
  // DALL-E variations — only if explicitly allowed (gated like generateImage)
  if (envKey("OPENAI_API_KEY") && ALLOW_DALLE_AUTONOMOUS()) {
    try {
      const resp = await fetch("https://api.openai.com/v1/images/variations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-2",
          image: sourceBase64,
          n: Math.min(count, 4),
          size: "1024x1024",
          response_format: "b64_json",
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as { data: { b64_json: string }[] };
        return {
          id: uid(),
          original: sourceBase64.slice(0, 50),
          variations: data.data.map((d) => d.b64_json),
          count: data.data.length,
          createdAt: ts(),
        };
      }
    } catch {
      // Fall through
    }
  }

  return {
    id: uid(),
    original: sourceBase64.slice(0, 50),
    variations: [],
    count: 0,
    createdAt: ts(),
  };
}

/**
 * Upscale an image to higher resolution.
 * Uses Stable Diffusion upscaler or basic nearest-neighbor placeholder.
 */
export async function upscaleImage(sourceBase64: string, scaleFactor = 2): Promise<UpscaleResult> {
  try {
    const resp = await fetch(`${SD_API_URL}/sdapi/v1/extra-single-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: sourceBase64,
        upscaling_resize: scaleFactor,
        upscaler_1: "R-ESRGAN 4x+",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (resp.ok) {
      const data = (await resp.json()) as { image: string };
      return {
        id: uid(),
        original: sourceBase64.slice(0, 50),
        upscaled: data.image,
        scaleFactor,
        outputWidth: 1024 * scaleFactor,
        outputHeight: 1024 * scaleFactor,
        createdAt: ts(),
      };
    }
  } catch {
    // Fall through
  }

  return {
    id: uid(),
    original: sourceBase64.slice(0, 50),
    upscaled: "",
    scaleFactor,
    outputWidth: 0,
    outputHeight: 0,
    createdAt: ts(),
  };
}

/**
 * Composite multiple image layers together.
 */
export function compositeImages(
  layers: CompositeLayer[],
  canvasWidth = 1024,
  canvasHeight = 1024,
): CompositeResult {
  // In a full implementation this would use sharp or canvas
  // For now we record the composite spec and return the base layer
  return {
    id: uid(),
    layerCount: layers.length,
    outputBase64: layers[0]?.base64 ?? "",
    width: canvasWidth,
    height: canvasHeight,
    createdAt: ts(),
  };
}

// ─── Provider Implementations ───────────────────────────────────

async function generateWithDalle3(
  prompt: string,
  style: ImageStyle,
  size: ImageSize,
  citizenId: string,
): Promise<GeneratedImage> {
  const dalleSize = size.includes("x") ? size : `${size}x${size}`;
  const styledPrompt = `${prompt}, in ${style} style`;

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: styledPrompt,
      n: 1,
      size: dalleSize,
      quality: "standard", // Use standard quality to reduce cost ($0.04 vs $0.08)
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    throw new Error(`DALL-E 3 error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    data: { b64_json: string; revised_prompt?: string }[];
  };

  const img = data.data[0];
  const sizeNum = parseInt(size, 10) || 1024;
  const generated: GeneratedImage = {
    id: uid(),
    prompt,
    revisedPrompt: img?.revised_prompt,
    style,
    provider: "dalle3",
    base64: img?.b64_json ?? "",
    width: sizeNum,
    height: sizeNum,
    createdAt: ts(),
    citizenId,
    costCredits: 25,
  };

  archiveImage(generated);
  return generated;
}

async function generateWithSD(
  prompt: string,
  style: ImageStyle,
  size: ImageSize,
  citizenId: string,
): Promise<GeneratedImage> {
  const sizeNum = parseInt(size, 10) || 512;

  const resp = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${prompt}, ${style} style`,
      negative_prompt: "blurry, low quality, deformed",
      steps: 30,
      width: sizeNum,
      height: sizeNum,
      cfg_scale: 7.5,
      sampler_name: "DPM++ 2M Karras",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    throw new Error(`Stable Diffusion error: ${resp.status}`);
  }

  const data = (await resp.json()) as { images: string[] };

  const generated: GeneratedImage = {
    id: uid(),
    prompt,
    style,
    provider: "stable-diffusion",
    base64: data.images[0] ?? "",
    width: sizeNum,
    height: sizeNum,
    createdAt: ts(),
    citizenId,
    costCredits: 5,
  };

  archiveImage(generated);
  return generated;
}

async function generateWithComfyUI(
  prompt: string,
  style: ImageStyle,
  size: ImageSize,
  citizenId: string,
): Promise<GeneratedImage> {
  const sizeNum = parseInt(size, 10) || 512;

  // ComfyUI uses a workflow-based API — we submit a minimal txt2img workflow
  const workflowPayload = {
    prompt: {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: rand(0, 2 ** 31 - 1),
          steps: 25,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: `${prompt}, ${style} style` },
      },
    },
  };

  const resp = await fetch(`${COMFYUI_API_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflowPayload),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    throw new Error(`ComfyUI error: ${resp.status}`);
  }

  // ComfyUI returns a prompt_id — in production we'd poll for completion
  const data = (await resp.json()) as { prompt_id: string };

  const generated: GeneratedImage = {
    id: uid(),
    prompt,
    style,
    provider: "comfyui",
    base64: "", // Would be filled after polling
    width: sizeNum,
    height: sizeNum,
    createdAt: ts(),
    citizenId,
    costCredits: 3,
  };

  archiveImage(generated);
  return { ...generated, revisedPrompt: `ComfyUI job: ${data.prompt_id}` };
}

function createPlaceholder(prompt: string, style: ImageStyle, citizenId: string): GeneratedImage {
  const generated: GeneratedImage = {
    id: uid(),
    prompt,
    style,
    provider: "placeholder",
    base64: "",
    width: 1024,
    height: 1024,
    createdAt: ts(),
    citizenId,
    costCredits: 0,
  };

  archiveImage(generated);
  return generated;
}

function archiveImage(img: GeneratedImage): void {
  generatedImages.push(img);
  if (generatedImages.length > MAX_IMAGE_HISTORY) {
    generatedImages.splice(0, generatedImages.length - MAX_IMAGE_HISTORY);
  }
}

// ─── Gallery & Queries ──────────────────────────────────────────

export function getGallery(limit = 50): GeneratedImage[] {
  return generatedImages.slice(-limit);
}

export function getCitizenGallery(citizenId: string, limit = 20): GeneratedImage[] {
  return generatedImages.filter((img) => img.citizenId === citizenId).slice(-limit);
}

export function getImageById(imageId: string): GeneratedImage | undefined {
  return generatedImages.find((img) => img.id === imageId);
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface CreativeStudioDiagnostics {
  totalGenerated: number;
  activeProvider: string;
  providerStatus: Record<string, boolean>;
  gallerySize: number;
}

export function getCreativeStudioDiagnostics(): CreativeStudioDiagnostics {
  return {
    totalGenerated: generatedImages.length,
    activeProvider: getAvailableProvider(),
    providerStatus: {
      dalle3: !!envKey("OPENAI_API_KEY"),
      stableDiffusion: false, // Would check connectivity
      comfyui: false, // Would check connectivity
    },
    gallerySize: generatedImages.length,
  };
}

// ─── Tick ───────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";

const OUTPUT_DIR = path.join(process.cwd(), "republic-output", "art");

// Phase 50: 60+ diverse prompts by category
const ART_PROMPTS_BY_GENRE: Record<string, string[]> = {
  "fine-art": [
    "A luminous Turner-inspired seascape with molten gold sunset over turbulent waves",
    "Abstract expressionist canvas of colliding cosmic forces — deep blues and violent reds",
    "Hyper-detailed still life of crystalline science equipment bathed in candlelight",
    "Oil painting of a mythical library that stretches infinitely into mist and starlight",
    "Renaissance-style portrait of an AI philosopher contemplating a holographic sphere",
    "Impressionist garden scene with citizens gathering under chrome-leaf trees",
    "Baroque chiaroscuro of a blacksmith forging tools from pure light",
  ],
  "digital-art": [
    "Cyberpunk metropolis with neon-lit data streams flowing through underground markets",
    "A floating island city sustained by quantum energy rings, sunset lighting",
    "Holographic data visualization of a republic's neural network rendered in 3D space",
    "Sci-fi command bridge with panoramic view of a binary star system",
    "Biomechanical fusion: organic forests growing through circuit board landscapes",
    "Digital double-exposure: a citizen's face merging with their neural network signature",
    "Crystal data center inside a mountain cavern, illuminated by bioluminescent fungi",
  ],
  architectural: [
    "Isometric view of a futuristic sustainable campus with vertical farms and sky bridges",
    "Cross-section of an underground data center integrated with geothermal systems",
    "Parametric architectural concept: flowing organic office building with living walls",
    "Blueprint-style illustration of a self-sustaining space habitat in orbit",
    "Aerial view of a smart city grid with autonomous transit and green corridors",
  ],
  character: [
    "Full character design sheet of a republic scientist in layered explorer attire",
    "Dynamic action pose of an engineer deploying repair drones in zero gravity",
    "Portrait series: diverse citizens of the republic in their professional environments",
    "Concept art of a diplomat mediating between two alien civilizations",
    "Stylized character lineup of a republic development squad — 5 specialists",
  ],
  "ui-design": [
    "Sleek dashboard mockup for a citizen management system with glassmorphism cards",
    "Mobile app UI concept for a decentralized marketplace — dark mode with gradients",
    "Figma-style component library showcase with buttons, cards, modals, and typography",
    "AR heads-up display interface for an engineer's diagnostic toolkit",
    "Infographic poster of a republic's economic engine with data visualizations",
  ],
  "album-cover": [
    "Album cover: vast cosmic ocean with a lone figure standing on a data crystal shoreline",
    "Music artwork: retro-futuristic radio tower broadcasting quantum signals into space",
    "Album art: geometric mandala made of sound waves and circuit traces, neon palette",
    "EP cover: silhouette of a composer conducting an orchestra of holographic instruments",
    "Single artwork: minimalist gradient with subtle waveform embedded in gold foil texture",
  ],
  "movie-poster": [
    "Cinematic movie poster: epic wide shot of citizens migrating to a new digital frontier",
    "Film noir poster: shadowed figure in trench coat investigating data crimes in rain",
    "Animated film poster: colorful cartooned citizens building a fantastical machine together",
    "Documentary poster: split-screen of nature and technology converging into harmony",
    "Thriller poster: close-up eye reflecting a fracturing holographic world, dramatic lighting",
  ],
  "game-art": [
    "Game environment concept: enchanted forest hosting a quantum computing shrine at dawn",
    "Pixel art tileset for a cyberpunk city builder — buildings, roads, vehicles, characters",
    "Low-poly 3D render of a fantasy RPG village with glowing rune stones",
    "Game character sprite sheet: 8-directional walk cycle of an adventurer-engineer",
    "Game UI wireframe: inventory, skill tree, and minimap mockups in sci-fi theme",
  ],
  photography: [
    "Photorealistic render of a macro electronic circuit board with bokeh depth-of-field",
    "Studio product photography of a cutting-edge wearable holographic device",
    "Street photography style: citizens interacting with augmented reality projections",
    "Aerial drone photography of a solar farm patterned like a circuit board",
    "Environmental portrait of a farmer using precision agriculture sensors at golden hour",
  ],
  "logo-branding": [
    "Minimalist geometric logo for 'Republic Forge' — anvil + code brackets motif",
    "Brand identity concept: lettermark + icon + color palette for a citizen startup",
    "Emblem-style badge logo for a republic engineering guild, metallic finish",
    "Wordmark logo design for 'Quantum Gardens' — elegant serif with particle effects",
    "App icon design: rounded square with abstract neural network pattern, vibrant gradient",
  ],
};

const ALL_ART_PROMPTS = Object.values(ART_PROMPTS_BY_GENRE).flat();

/** Map specializations to preferred art genres */
const SPEC_ART_PREFERENCES: Record<string, string[]> = {
  Artist: ["fine-art", "digital-art", "photography"],
  Designer: ["ui-design", "logo-branding", "architectural"],
  Filmmaker: ["movie-poster", "character", "digital-art"],
  Composer: ["album-cover", "digital-art", "fine-art"],
  GameDeveloper: ["game-art", "character", "digital-art"],
  Architect: ["architectural", "digital-art"],
  Engineer: ["architectural", "photography"],
  WebDeveloper: ["ui-design", "logo-branding"],
  ContentCreator: ["photography", "logo-branding", "digital-art"],
};

function ensureArtOutputDir(): void {
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch {
    /* ignore if already exists */
  }
}

/**
 * Creative studio tick — generates art for citizens with artistic skills
 * or creative specializations. Saves real files when provider returns data.
 * Phase 50: 12% trigger rate, specialization-aware prompts, disk output.
 */
export function creativeStudioTick(s: RepublicState): void {
  // 3% chance per tick — reduced from 12% to control cloud API costs.
  // Art generation now prefers local providers (SD, ComfyUI) over DALL-E.
  if (rng() > 0.03) {return;}

  // Find eligible creators — expanded to all production specs
  const creators = s.citizens.filter(
    (c) =>
      c.specialization === "Artist" ||
      c.specialization === "Designer" ||
      c.specialization === "Filmmaker" ||
      c.specialization === "Composer" ||
      c.specialization === "GameDeveloper" ||
      c.specialization === "WebDeveloper" ||
      c.specialization === "ContentCreator" ||
      c.specialization === "Architect" ||
      c.activity === "Creating",
  );
  const citizen = creators.length > 0 ? creators[Math.floor(rng() * creators.length)] : null;
  if (!citizen) {return;}

  // Pick prompt based on specialization preference
  const preferredGenres = SPEC_ART_PREFERENCES[citizen.specialization];
  let prompt: string;
  if (preferredGenres && rng() < 0.7) {
    // 70% chance: use preferred genre
    const genre = preferredGenres[Math.floor(rng() * preferredGenres.length)];
    const genrePrompts = ART_PROMPTS_BY_GENRE[genre] ?? ALL_ART_PROMPTS;
    prompt = genrePrompts[Math.floor(rng() * genrePrompts.length)];
  } else {
    prompt = ALL_ART_PROMPTS[Math.floor(rng() * ALL_ART_PROMPTS.length)];
  }

  // Personalize: prepend citizen's name as the artist
  const personalizedPrompt = `[Created by ${citizen.name}] ${prompt}`;

  const styles: ImageStyle[] = [
    "photorealistic",
    "digital-art",
    "oil-painting",
    "watercolor",
    "pixel-art",
    "3d-render",
    "sketch",
    "anime",
    "poster",
    "logo",
  ];
  const style = styles[Math.floor(rng() * styles.length)];

  generateImage(personalizedPrompt, { style, citizenId: citizen.id })
    .then((img) => {
      // Save to disk if we got real data
      if (img.base64 && img.provider !== "placeholder") {
        ensureArtOutputDir();
        const filename = `${img.id}_${style}_${citizen.name?.replace(/\s+/g, "_") ?? "anon"}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        try {
          fs.writeFileSync(filepath, Buffer.from(img.base64, "base64"));
        } catch {
          /* write errors non-fatal */
        }
      }

      // Emit creation event
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name ?? citizen.id,
        type: "ArtCreated",
        description: `${citizen.name} created ${style} artwork: "${prompt.slice(0, 80)}…"`,
        timestamp: new Date().toISOString(),
      });
    })
    .catch(() => {});
}
