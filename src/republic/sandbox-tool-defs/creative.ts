/**
 * Sandbox Tool Definitions — creative tools
 */

export const CREATIVE_TOOLS = [
  {
    name: "cuda_check",
    description: `Check GPU and CUDA status on the host machine.
Reports: GPU model, VRAM total/used/free, CUDA version, driver version,
running GPU processes, and temperature.

Runs nvidia-smi on the host via Docker socket.
If no GPU is available, reports that and suggests cloud GPU options.`,
    input_schema: {
      type: "object" as const,
      properties: {
        format: {
          type: "string",
          description: "Output format: summary, detailed, json (default: summary)",
        },
      },
    },
  },
  {
    name: "deerflow_research",
    description: `Delegate a deep research task to the DeerFlow multi-agent swarm.
DeerFlow (by ByteDance/DeepSeek) orchestrates multiple specialized sub-agents:
• Researcher — gathers information from the web
• Analyst — synthesizes findings into insights
• Writer — produces structured reports
• Reviewer — validates accuracy and completeness

Modes:
• "standard" — single research pass (fast, ~2 min)
• "pro" — multi-pass with cross-referencing (~5 min)
• "ultra" — exhaustive research with citations (~10 min)

Returns a structured research report with sources and confidence scores.
Requires DeerFlow container running (port 2026).`,
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "Research task in natural language" },
        mode: {
          type: "string",
          description: "Research depth: standard, pro, ultra (default: standard)",
        },
        output_format: {
          type: "string",
          description: "Output: markdown, json, pdf (default: markdown)",
        },
        save_path: { type: "string", description: "Save report to file (optional)" },
      },
      required: ["task"],
    },
  },
  {
    name: "data_viz",
    description: `Generate charts and graphs using matplotlib + seaborn.
Saves the output as PNG, SVG, or PDF.

Chart types:
• "bar" — bar chart (vertical/horizontal)
• "line" — line chart (single or multi-series)
• "pie" — pie/donut chart
• "scatter" — scatter plot
• "heatmap" — correlation heatmap
• "histogram" — frequency distribution
• "box" — box plot
• "area" — area chart
• "radar" — radar/spider chart
• "treemap" — hierarchical treemap
• "custom" — write raw matplotlib code

Data can be inline JSON or a path to a CSV/JSON file.
Supports custom colors, titles, labels, and branding.`,
    input_schema: {
      type: "object" as const,
      properties: {
        chart_type: { type: "string", description: "Chart type (see list above)" },
        data: { type: "string", description: "JSON data or path to CSV/JSON file" },
        title: { type: "string", description: "Chart title" },
        x_label: { type: "string", description: "X-axis label" },
        y_label: { type: "string", description: "Y-axis label" },
        colors: {
          type: "string",
          description:
            "Color palette: JSON array of hex colors or palette name (viridis, plasma, etc.)",
        },
        output_path: {
          type: "string",
          description: "Output file path (default: /workspace/chart.png)",
        },
        output_format: {
          type: "string",
          description: "Output format: png, svg, pdf (default: png)",
        },
        width: { type: "number", description: "Figure width in inches (default: 10)" },
        height: { type: "number", description: "Figure height in inches (default: 6)" },
        style: {
          type: "string",
          description: "Seaborn style: darkgrid, whitegrid, dark, white, ticks (default: darkgrid)",
        },
        custom_code: {
          type: "string",
          description: "Raw matplotlib/seaborn Python code (for custom type)",
        },
      },
      required: ["chart_type"],
    },
  },
  {
    name: "image_generate",
    description: `Generate images from text prompts using GPU-accelerated ComfyUI.
Auto-starts the ComfyUI sandbox container with NVIDIA GPU passthrough.

Models available:
• "flux-schnell" — FLUX.2 Schnell (fast, photorealistic)
• "flux-dev" — FLUX.2 Dev (high quality, slower)
• "sdxl" — Stable Diffusion XL (general purpose)

Output is saved to /workspace/ and the file path is returned.
Supports custom dimensions, seeds, and negative prompts.`,
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "Image generation prompt" },
        negative_prompt: { type: "string", description: "What to avoid in the image" },
        model: {
          type: "string",
          description: "Model: flux-schnell, flux-dev, sdxl (default: flux-schnell)",
        },
        width: { type: "number", description: "Image width (default: 1024)" },
        height: { type: "number", description: "Image height (default: 1024)" },
        seed: { type: "number", description: "Seed for reproducibility (-1 for random)" },
        output_path: {
          type: "string",
          description: "Output file path (default: /workspace/generated_image.png)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "video_generate",
    description: `Generate video from text using local GPU-accelerated AI models.

Backends (auto-detected in priority order):
1. **WanGP** (preferred) — Wan 2.2 model via Gradio API. SOTA quality, 480p-720p, up to 10s.
   Start with: container_manage action="start" container_type="wan2gp"
2. **ComfyUI AnimateDiff** (fallback) — SD 1.5 motion model. Lower quality, 512×512 @ 8fps.
   Start with: container_manage action="start" container_type="comfyui"

With WanGP (recommended):
• Default: 832×480 @ 24fps, 5 seconds
• Supports Wan 2.2, Hunyuan Video, LTX-2.3 models
• 14B model needs 24GB+ VRAM (your TITAN RTX / 3090 Ti / 6000 Pro all work)

Output is saved as MP4 to /workspace/.`,
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "Video generation prompt — describe the scene, motion, and style",
        },
        negative_prompt: { type: "string", description: "What to avoid in the video" },
        model: {
          type: "string",
          description:
            "Model: wan2.2, hunyuan, ltx-2.3 (default: wan2.2). Only used with WanGP backend.",
        },
        source_image: {
          type: "string",
          description: "Source image path for image-to-video (optional)",
        },
        duration_seconds: {
          type: "number",
          description: "Video duration in seconds (default: 5, max: 10)",
        },
        fps: { type: "number", description: "Frames per second (default: 24)" },
        width: { type: "number", description: "Video width (default: 832)" },
        height: { type: "number", description: "Video height (default: 480)" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
        output_path: {
          type: "string",
          description: "Output path (default: /workspace/generated_video.mp4)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "tts_speak",
    description: `Generate speech from text with voice cloning using Chatterbox TTS.
Only needs ~4GB of memory. Three model variants:

• "turbo" — Low-latency, supports paralinguistic tags ([laughs], [sighs], etc.)
• "standard" — High-quality English TTS
• "multilingual" — Supports 23 languages

Voice cloning: Provide a reference audio clip (5-30 seconds) to clone any voice.
Output is saved as WAV/MP3 to /workspace/.`,
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Text to convert to speech" },
        model: {
          type: "string",
          description: "Model: turbo, standard, multilingual (default: turbo)",
        },
        voice_ref: {
          type: "string",
          description: "Path to reference audio for voice cloning (optional)",
        },
        language: {
          type: "string",
          description: "Language code for multilingual model (default: en)",
        },
        output_path: {
          type: "string",
          description: "Output file path (default: /workspace/speech.wav)",
        },
        output_format: { type: "string", description: "Output format: wav, mp3 (default: wav)" },
      },
      required: ["text"],
    },
  },
  {
    name: "upscale_image",
    description: `Upscale images 2x or 4x using GPU-accelerated RealESRGAN.
Uses the ComfyUI sandbox with GPU passthrough.

Models:
• "realesrgan-x4" — General 4x upscale
• "realesrgan-x2" — Fast 2x upscale
• "realesrgan-anime" — Optimized for anime/illustration

Example: 512×512 → 2048×2048 in ~5 seconds on RTX 3090.`,
    input_schema: {
      type: "object" as const,
      properties: {
        image_path: { type: "string", description: "Path to input image" },
        scale: { type: "number", description: "Upscale factor: 2 or 4 (default: 4)" },
        model: {
          type: "string",
          description:
            "Model: realesrgan-x4, realesrgan-x2, realesrgan-anime (default: realesrgan-x4)",
        },
        output_path: { type: "string", description: "Output path (default: auto-generated)" },
      },
      required: ["image_path"],
    },
  },
  {
    name: "image_process",
    description: `Process images: resize, crop, optimize, convert formats, generate favicons and responsive sets.
Uses ImageMagick for professional image manipulation.

Actions:
• "resize" — Resize to specific dimensions
• "crop" — Crop to specific area
• "optimize" — Compress for web (reduce file size)
• "convert" — Convert between formats (png, jpg, webp, svg, ico)
• "favicon" — Generate complete favicon set (16, 32, 48, 192, 512px)
• "responsive" — Generate responsive image set (sm, md, lg, xl)`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: resize, crop, optimize, convert, favicon, responsive",
        },
        input_path: { type: "string", description: "Input image path" },
        output_path: { type: "string", description: "Output path (default: auto-generated)" },
        width: { type: "number", description: "Target width in pixels" },
        height: { type: "number", description: "Target height in pixels" },
        quality: { type: "number", description: "JPEG/WebP quality 1-100 (default: 85)" },
        output_format: {
          type: "string",
          description: "Output format: png, jpg, webp, ico (for convert action)",
        },
      },
      required: ["action", "input_path"],
    },
  },
  {
    name: "video_process",
    description: `Process, edit, convert, or analyze video files using ffmpeg.

Actions:
- info: Get video metadata (duration, resolution, codecs, bitrate)
- trim: Cut a clip (start_time + duration)
- compress: Reduce file size with H.264 (crf 23=high quality, 35=smaller)
- convert: Change format (mp4, webm, gif, mkv, avi)
- extract_frames: Export frames as PNG images at a given fps
- add_audio: Overlay or replace audio track
- concat: Join multiple video files together (files="a.mp4,b.mp4")
- thumbnail: Extract a single frame as a JPEG image

ffmpeg must be available in the sandbox. Install with: sandbox_exec command="apt-get install -y ffmpeg"
Or use kali_exec if ffmpeg is already in Kali: kali_exec command="ffmpeg ..."`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Operation: info, trim, compress, convert, extract_frames, add_audio, concat, thumbnail",
        },
        input_path: {
          type: "string",
          description: "Path to input video file (e.g., /workspace/video.mp4)",
        },
        output_path: {
          type: "string",
          description: "Path for output file (auto-generated if not specified)",
        },
        start_time: { type: "string", description: "For trim: start time e.g. '00:00:10' or '30'" },
        duration: { type: "string", description: "For trim: duration in seconds or HH:MM:SS" },
        crf: {
          type: "number",
          description: "For compress: quality 18-35 (lower=better quality, 28 default)",
        },
        preset: {
          type: "string",
          description: "For compress: encoding speed: ultrafast, fast, medium, slow",
        },
        format: {
          type: "string",
          description: "For convert: target format e.g. mp4, webm, gif, mkv",
        },
        fps: { type: "number", description: "For extract_frames: frames per second to extract" },
        audio_path: {
          type: "string",
          description: "For add_audio: path to audio file (.mp3, .wav, .aac)",
        },
        files: {
          type: "string",
          description: "For concat: comma-separated list of video file paths",
        },
        timestamp: { type: "string", description: "For thumbnail: timestamp e.g. '00:00:05'" },
      },
      required: ["action"],
    },
  },
  {
    name: "audio_process",
    description: `Audio manipulation using ffmpeg and sox.
Companion to video_process — handles all audio-specific operations.

Actions:
• "info" — Show duration, codec, bitrate, sample rate, channels
• "trim" — Cut audio segment (start_time, duration)
• "convert" — Convert between formats (mp3, wav, flac, ogg, aac, m4a)
• "merge" — Concatenate multiple audio files
• "normalize" — Normalize volume levels
• "extract" — Extract audio track from video file
• "split" — Split into equal-length segments
• "mix" — Mix/overlay two audio tracks
• "effects" — Apply effects: fade_in, fade_out, speed, reverse, echo, bass_boost
• "transcribe" — Speech-to-text using Whisper (if available)`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Action: info, trim, convert, merge, normalize, extract, split, mix, effects, transcribe",
        },
        input_path: { type: "string", description: "Input audio/video file path" },
        output_path: {
          type: "string",
          description: "Output file path (auto-generated if omitted)",
        },
        format: { type: "string", description: "Output format: mp3, wav, flac, ogg, aac, m4a" },
        start_time: {
          type: "string",
          description: "Start time for trim (e.g. '00:01:30' or '90')",
        },
        duration: { type: "string", description: "Duration for trim/split (seconds or HH:MM:SS)" },
        files: { type: "string", description: "Comma-separated file paths (for merge/mix)" },
        effect: {
          type: "string",
          description: "Effect name: fade_in, fade_out, speed, reverse, echo, bass_boost",
        },
        effect_value: {
          type: "string",
          description: "Effect parameter (e.g. speed factor, fade duration)",
        },
        bitrate: { type: "string", description: "Output bitrate (e.g. '192k', '320k')" },
        sample_rate: {
          type: "number",
          description: "Output sample rate in Hz (e.g. 44100, 48000)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "ai_inference",
    description: `Call an LLM for text generation, embeddings, or analysis from within the sandbox.
Use this when building AI-powered features (chatbots, summarizers, search, classification).

Providers:
• "anthropic" — Uses ANTHROPIC_API_KEY (default, best quality)
• "ollama" — Uses local Ollama if available (free, offline)
• "openai" — Uses OPENAI_API_KEY if set

Returns the model's response text.`,
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "The prompt to send to the LLM" },
        system: { type: "string", description: "System prompt (optional)" },
        provider: {
          type: "string",
          description: "Provider: anthropic, ollama, openai (default: anthropic)",
        },
        model: { type: "string", description: "Model name (default: auto-select best available)" },
        max_tokens: { type: "number", description: "Max tokens in response (default: 1024)" },
        temperature: { type: "number", description: "Temperature 0.0-1.0 (default: 0.7)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "image_analyze",
    description:
      "Analyze, understand, and extract information from images. Actions: describe, ocr, objects, compare, colors, metadata, measure, faces, classify. The agent's 'eyes'.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Action: describe, ocr, objects, compare, colors, metadata, measure, faces, classify",
        },
        image_path: { type: "string", description: "Path to the image file" },
        image_b: { type: "string", description: "Second image for compare" },
        lang: { type: "string", description: "OCR language (default: eng)" },
        output_path: { type: "string", description: "Save output to file" },
      },
      required: ["action", "image_path"],
    },
  },
];
