/**
 * Republic Platform — Video Production Engine
 *
 * Produces REAL video files using programmatic frame generation + FFmpeg encoding.
 *
 * Capabilities:
 * - Motion graphics (animated SVG → frame sequence → MP4)
 * - Slideshow videos (generated images with transitions)
 * - Data visualization animations (charts, metrics, dashboards)
 * - Advertisements (branded title cards, CTAs, citizen promotions)
 * - Republic broadcasts (news-style announcement videos)
 *
 * GPU acceleration: uses NVENC (h264_nvenc / hevc_nvenc) when available,
 * falls back to libx264 on CPU.
 */

import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { emitNationalEvent } from "./event-sourcing.js";
import { probeSystemResources } from "./infra-control-plane.js";
import { uid } from "./utils.js";

const execPromise = promisify(execCb);

// ─── Types ──────────────────────────────────────────────────────

export type VideoType =
  | "motion_graphics"
  | "slideshow"
  | "data_viz"
  | "advertisement"
  | "broadcast"
  | "promo";

export interface VideoSpec {
  type: VideoType;
  title: string;
  description: string;
  /** Duration in seconds (default: 15) */
  durationSec?: number;
  /** Width in pixels (default: 1920) */
  width?: number;
  /** Height in pixels (default: 1080) */
  height?: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Citizen who requested/created */
  citizenId: string;
  citizenName: string;
  /** Specialization for theming */
  specialization?: string;
  /** Brand colors [primary, secondary, accent] */
  colors?: [string, string, string];
  /** Data to visualize (for data_viz type) */
  dataPoints?: number[];
  /** Bullet points / slides (for slideshow type) */
  slides?: string[];
  /** Output directory */
  outputDir: string;
}

export interface VideoResult {
  success: boolean;
  filePath: string;
  fileName: string;
  durationSec: number;
  fileSize: number;
  codec: string;
  gpuAccelerated: boolean;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_COLORS: [string, string, string] = ["#6C63FF", "#FF6584", "#43E97B"];
const REPUBLIC_BRAND = {
  name: "HoC Republic",
  tagline: "Where AI Citizens Create the Future",
  accent: "#6C63FF",
  bg: "#0D1117",
  text: "#E6EDF3",
};

// ─── GPU / FFmpeg Detection ─────────────────────────────────────

let _ffmpegAvailable: boolean | null = null;
let _nvencAvailable: boolean | null = null;

async function probeFFmpeg(): Promise<boolean> {
  if (_ffmpegAvailable !== null) {
    return _ffmpegAvailable;
  }
  try {
    await execPromise("ffmpeg -version", { encoding: "utf-8", timeout: 5000 });
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
  }
  return _ffmpegAvailable;
}

async function probeNvenc(): Promise<boolean> {
  if (_nvencAvailable !== null) {
    return _nvencAvailable;
  }
  try {
    const { stdout: output } = await execPromise("ffmpeg -encoders 2>&1", {
      encoding: "utf-8",
      timeout: 5000,
    });
    _nvencAvailable = output.includes("h264_nvenc");
  } catch {
    _nvencAvailable = false;
  }
  return _nvencAvailable;
}


// ─── SVG Frame Renderers ────────────────────────────────────────

function generateMotionGraphicsSVG(
  frameIndex: number,
  totalFrames: number,
  spec: VideoSpec,
): string {
  const w = spec.width ?? 1920;
  const h = spec.height ?? 1080;
  const t = frameIndex / totalFrames; // 0.0 → 1.0
  const colors = spec.colors ?? DEFAULT_COLORS;

  // Animated geometric shapes with smooth motion
  const circleR = 60 + Math.sin(t * Math.PI * 4) * 40;
  const circleX = w * 0.3 + Math.cos(t * Math.PI * 2) * (w * 0.15);
  const circleY = h * 0.5 + Math.sin(t * Math.PI * 3) * (h * 0.15);

  const rectAngle = t * 360;
  const hexX = w * 0.7 + Math.sin(t * Math.PI * 2.5) * (w * 0.1);
  const hexY = h * 0.5 + Math.cos(t * Math.PI * 1.5) * (h * 0.1);

  // Title fade-in (first 20% of video)
  const titleOpacity = Math.min(1, t * 5);
  // Subtitle fade-in (10%-30%)
  const subOpacity = Math.min(1, Math.max(0, (t - 0.1) * 5));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${REPUBLIC_BRAND.bg}"/>
      <stop offset="100%" style="stop-color:#1a1a2e"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:0.6"/>
      <stop offset="100%" style="stop-color:${colors[0]};stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${circleX}" cy="${circleY}" r="${circleR * 3}" fill="url(#glow)"/>
  <circle cx="${circleX}" cy="${circleY}" r="${circleR}" fill="${colors[0]}" opacity="0.8"/>
  <g transform="translate(${hexX},${hexY}) rotate(${rectAngle})">
    <rect x="-50" y="-50" width="100" height="100" rx="15" fill="${colors[1]}" opacity="0.7"/>
  </g>
  <polygon points="${w * 0.5},${h * 0.2 - 30} ${w * 0.5 + 35},${h * 0.2 + 20} ${w * 0.5 - 35},${h * 0.2 + 20}"
           fill="${colors[2]}" opacity="${0.5 + Math.sin(t * Math.PI * 6) * 0.3}"
           transform="rotate(${t * 180}, ${w * 0.5}, ${h * 0.2})"/>
  <text x="${w / 2}" y="${h * 0.45}" text-anchor="middle" fill="${REPUBLIC_BRAND.text}"
        font-family="Arial, sans-serif" font-size="72" font-weight="bold" opacity="${titleOpacity}">
    ${escapeXml(spec.title)}
  </text>
  <text x="${w / 2}" y="${h * 0.55}" text-anchor="middle" fill="${colors[0]}"
        font-family="Arial, sans-serif" font-size="32" opacity="${subOpacity}">
    ${escapeXml(spec.description.slice(0, 80))}
  </text>
  <text x="${w / 2}" y="${h * 0.92}" text-anchor="middle" fill="${REPUBLIC_BRAND.text}"
        font-family="Arial, sans-serif" font-size="20" opacity="0.5">
    ${REPUBLIC_BRAND.name} — ${REPUBLIC_BRAND.tagline}
  </text>
</svg>`;
}

function generateSlideshowSVG(frameIndex: number, totalFrames: number, spec: VideoSpec): string {
  const w = spec.width ?? 1920;
  const h = spec.height ?? 1080;
  const slides = spec.slides ?? ["No content provided"];
  const framesPerSlide = Math.floor(totalFrames / slides.length);
  const slideIdx = Math.min(Math.floor(frameIndex / framesPerSlide), slides.length - 1);
  const slideProgress = (frameIndex % framesPerSlide) / framesPerSlide;
  const colors = spec.colors ?? DEFAULT_COLORS;

  // Slide transition: fade
  const fadeIn = Math.min(1, slideProgress * 5);
  const fadeOut = slideProgress > 0.85 ? Math.max(0, (1 - slideProgress) * 6.67) : 1;
  const opacity = Math.min(fadeIn, fadeOut);

  // Slide number indicator
  const dotRadius = 8;
  const dotSpacing = 30;
  const dotsStartX = w / 2 - ((slides.length - 1) * dotSpacing) / 2;

  let dots = "";
  for (let i = 0; i < slides.length; i++) {
    const dotFill = i === slideIdx ? colors[0] : "#555";
    dots += `<circle cx="${dotsStartX + i * dotSpacing}" cy="${h * 0.88}" r="${dotRadius}" fill="${dotFill}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${REPUBLIC_BRAND.bg}"/>
  <rect x="60" y="60" width="${w - 120}" height="${h - 120}" rx="20" fill="#161b22" stroke="${colors[0]}" stroke-width="2"/>
  <text x="${w / 2}" y="120" text-anchor="middle" fill="${colors[0]}"
        font-family="Arial, sans-serif" font-size="24" font-weight="bold">
    ${escapeXml(spec.title)} — Slide ${slideIdx + 1}/${slides.length}
  </text>
  <text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="${REPUBLIC_BRAND.text}"
        font-family="Arial, sans-serif" font-size="48" font-weight="bold" opacity="${opacity}">
    ${escapeXml(slides[slideIdx].slice(0, 60))}
  </text>
  ${dots}
  <text x="${w / 2}" y="${h * 0.95}" text-anchor="middle" fill="#666"
        font-family="Arial, sans-serif" font-size="16">
    Created by ${escapeXml(spec.citizenName)} — ${REPUBLIC_BRAND.name}
  </text>
</svg>`;
}

function generateDataVizSVG(frameIndex: number, totalFrames: number, spec: VideoSpec): string {
  const w = spec.width ?? 1920;
  const h = spec.height ?? 1080;
  const data = spec.dataPoints ?? [45, 72, 38, 90, 65, 83, 55, 78, 42, 95];
  const colors = spec.colors ?? DEFAULT_COLORS;
  const t = frameIndex / totalFrames;

  // Animated bar chart
  const barCount = data.length;
  const chartW = w * 0.7;
  const chartH = h * 0.5;
  const chartX = w * 0.15;
  const chartY = h * 0.25;
  const barW = (chartW / barCount) * 0.7;
  const barGap = (chartW / barCount) * 0.3;
  const maxVal = Math.max(...data);

  let bars = "";
  for (let i = 0; i < barCount; i++) {
    const animatedHeight = (data[i] / maxVal) * chartH * Math.min(1, t * 3 - i * 0.1);
    const barH = Math.max(0, animatedHeight);
    const x = chartX + i * (barW + barGap);
    const y = chartY + chartH - barH;
    const colorIdx = i % 3;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${colors[colorIdx]}" opacity="0.85"/>`;
    bars += `<text x="${x + barW / 2}" y="${y - 10}" text-anchor="middle" fill="${REPUBLIC_BRAND.text}" font-size="14">${data[i]}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${REPUBLIC_BRAND.bg}"/>
  <text x="${w / 2}" y="60" text-anchor="middle" fill="${REPUBLIC_BRAND.text}"
        font-family="Arial, sans-serif" font-size="42" font-weight="bold">
    ${escapeXml(spec.title)}
  </text>
  <text x="${w / 2}" y="100" text-anchor="middle" fill="${colors[0]}"
        font-family="Arial, sans-serif" font-size="22">
    ${escapeXml(spec.description.slice(0, 80))}
  </text>
  <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="#333" stroke-width="2"/>
  <line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="#333" stroke-width="2"/>
  ${bars}
  <text x="${w / 2}" y="${h * 0.92}" text-anchor="middle" fill="#666"
        font-family="Arial, sans-serif" font-size="18">
    ${REPUBLIC_BRAND.name} Analytics — ${escapeXml(spec.citizenName)}
  </text>
</svg>`;
}

function generateAdvertisementSVG(
  frameIndex: number,
  totalFrames: number,
  spec: VideoSpec,
): string {
  const w = spec.width ?? 1920;
  const h = spec.height ?? 1080;
  const t = frameIndex / totalFrames;
  const colors = spec.colors ?? DEFAULT_COLORS;

  // Pulsing glow effect
  const glowR = 200 + Math.sin(t * Math.PI * 4) * 50;
  const titleScale = 1 + Math.sin(t * Math.PI * 2) * 0.05;

  // CTA button animation (appears at 50%)
  const ctaOpacity = t > 0.5 ? Math.min(1, (t - 0.5) * 4) : 0;
  const ctaY = h * 0.7 + (t > 0.5 ? 0 : 30);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="adBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0D1117"/>
      <stop offset="50%" style="stop-color:#161b22"/>
      <stop offset="100%" style="stop-color:#0D1117"/>
    </linearGradient>
    <radialGradient id="heroGlow">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:0.4"/>
      <stop offset="100%" style="stop-color:${colors[0]};stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#adBg)"/>
  <circle cx="${w / 2}" cy="${h * 0.4}" r="${glowR}" fill="url(#heroGlow)"/>
  <g transform="translate(${w / 2}, ${h * 0.35}) scale(${titleScale})">
    <text x="0" y="0" text-anchor="middle" fill="${REPUBLIC_BRAND.text}"
          font-family="Arial, sans-serif" font-size="80" font-weight="bold">
      ${escapeXml(spec.title.slice(0, 30))}
    </text>
  </g>
  <text x="${w / 2}" y="${h * 0.5}" text-anchor="middle" fill="${colors[0]}"
        font-family="Arial, sans-serif" font-size="36">
    ${escapeXml(spec.description.slice(0, 60))}
  </text>
  <text x="${w / 2}" y="${h * 0.58}" text-anchor="middle" fill="#aaa"
        font-family="Arial, sans-serif" font-size="24">
    by ${escapeXml(spec.citizenName)} • ${spec.specialization ?? "Creative"}
  </text>
  <rect x="${w / 2 - 150}" y="${ctaY - 30}" width="300" height="60" rx="30"
        fill="${colors[1]}" opacity="${ctaOpacity}"/>
  <text x="${w / 2}" y="${ctaY + 5}" text-anchor="middle" fill="white"
        font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="${ctaOpacity}">
    Visit the Republic →
  </text>
  <line x1="0" y1="${h - 60}" x2="${w}" y2="${h - 60}" stroke="${colors[0]}" stroke-width="2" opacity="0.3"/>
  <text x="${w / 2}" y="${h - 25}" text-anchor="middle" fill="#666"
        font-family="Arial, sans-serif" font-size="18">
    ${REPUBLIC_BRAND.name} — ${REPUBLIC_BRAND.tagline}
  </text>
</svg>`;
}

// ─── Main Producer ──────────────────────────────────────────────

/**
 * Produce a real MP4 video file.
 *
 * Pipeline:
 * 1. Generate SVG frames programmatically
 * 2. Encode via FFmpeg (GPU h264_nvenc or CPU libx264)
 * 3. Return result with file path and metadata
 */
export async function produceVideo(spec: VideoSpec): Promise<VideoResult> {
  const startTime = Date.now();
  const videoId = uid().slice(0, 12);
  const fps = spec.fps ?? 30;
  const durationSec = spec.durationSec ?? 15;
  const totalFrames = fps * durationSec;
  const w = spec.width ?? 1920;
  const h = spec.height ?? 1080;
  const fileName = `${spec.type}-${videoId}.mp4`;
  const outputPath = path.join(spec.outputDir, fileName);

  // Ensure output directory exists
  await fs.mkdir(spec.outputDir, { recursive: true });

  // Check FFmpeg availability (async probe, caches result)
  if (!(await probeFFmpeg())) {
    return {
      success: false,
      filePath: "",
      fileName,
      durationSec,
      fileSize: 0,
      codec: "none",
      gpuAccelerated: false,
      error: "FFmpeg not found. Install FFmpeg to enable video production.",
    };
  }

  // Create temp directory for frames
  const tmpDir = path.join(spec.outputDir, `.tmp-${videoId}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Select the frame renderer based on video type
    const renderer = getFrameRenderer(spec.type);

    // Generate all SVG frames
    for (let i = 0; i < totalFrames; i++) {
      const svg = renderer(i, totalFrames, spec);
      const framePath = path.join(tmpDir, `frame-${String(i).padStart(6, "0")}.svg`);
      await fs.writeFile(framePath, svg, "utf-8");
    }

    // Determine codec (GPU or CPU)
    const useNvenc = await probeNvenc();
    const codec = useNvenc ? "h264_nvenc" : "libx264";
    const hwAccel = useNvenc ? ["-hwaccel", "cuda"] : [];

    // Build FFmpeg command
    const ffmpegArgs = [
      "ffmpeg",
      "-y",
      ...hwAccel,
      "-framerate",
      String(fps),
      "-i",
      path.join(tmpDir, "frame-%06d.svg"),
      "-c:v",
      codec,
      "-pix_fmt",
      "yuv420p",
      "-s",
      `${w}x${h}`,
      ...(useNvenc
        ? ["-preset", "p4", "-rc", "vbr", "-b:v", "8M"]
        : ["-preset", "medium", "-crf", "23"]),
      "-movflags",
      "+faststart",
      outputPath,
    ];

    // Execute FFmpeg
    await execAsync(ffmpegArgs.join(" "), 120_000);

    // Get file size
    const stat = await fs.stat(outputPath);

    emitNationalEvent("culture", "video_produced", spec.citizenId, {
      type: spec.type,
      title: spec.title,
      fileName,
      durationSec,
      codec,
      gpuAccelerated: useNvenc,
      fileSizeBytes: stat.size,
      productionTimeMs: Date.now() - startTime,
    });

    return {
      success: true,
      filePath: outputPath,
      fileName,
      durationSec,
      fileSize: stat.size,
      codec,
      gpuAccelerated: useNvenc,
    };
  } catch (err) {
    return {
      success: false,
      filePath: "",
      fileName,
      durationSec,
      fileSize: 0,
      codec: "unknown",
      gpuAccelerated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Clean up temp frames
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}

// ─── Convenience Producers ──────────────────────────────────────

/**
 * Produce a citizen advertisement video.
 */
export async function produceAdvertisement(
  citizenId: string,
  citizenName: string,
  specialization: string,
  title: string,
  tagline: string,
  outputDir: string,
): Promise<VideoResult> {
  return produceVideo({
    type: "advertisement",
    title,
    description: tagline,
    citizenId,
    citizenName,
    specialization,
    durationSec: 15,
    outputDir,
  });
}

/**
 * Produce a Republic broadcast video.
 */
export async function produceRepublicBroadcast(
  headline: string,
  bulletPoints: string[],
  outputDir: string,
): Promise<VideoResult> {
  return produceVideo({
    type: "broadcast",
    title: headline,
    description: REPUBLIC_BRAND.tagline,
    citizenId: "republic-system",
    citizenName: REPUBLIC_BRAND.name,
    specialization: "Governance",
    slides: bulletPoints,
    durationSec: 20,
    outputDir,
  });
}

/**
 * Probe GPU capabilities for video production.
 */
export async function getVideoProductionCapabilities(): Promise<{
  ffmpegAvailable: boolean;
  nvencAvailable: boolean;
  gpuCount: number;
  totalVramGB: number;
  recommendedCodec: string;
}> {
  const resources = await probeSystemResources();
  const ffmpeg = await probeFFmpeg();
  const nvenc = await probeNvenc();
  return {
    ffmpegAvailable: ffmpeg,
    nvencAvailable: nvenc,
    gpuCount: resources.gpus.length,
    totalVramGB: resources.vramGB,
    recommendedCodec: nvenc ? "h264_nvenc (GPU)" : "libx264 (CPU)",
  };
}

// ─── Helpers ────────────────────────────────────────────────────

type FrameRenderer = (frameIndex: number, totalFrames: number, spec: VideoSpec) => string;

function getFrameRenderer(type: VideoType): FrameRenderer {
  switch (type) {
    case "motion_graphics":
    case "promo":
      return generateMotionGraphicsSVG;
    case "slideshow":
    case "broadcast":
      return generateSlideshowSVG;
    case "data_viz":
      return generateDataVizSVG;
    case "advertisement":
      return generateAdvertisementSVG;
    default:
      return generateMotionGraphicsSVG;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function execAsync(cmd: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execCb(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\n${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}
