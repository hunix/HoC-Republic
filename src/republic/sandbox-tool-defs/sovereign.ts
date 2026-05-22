/**
 * Sovereign Tool Definitions — Vision, Search, Knowledge, Code Interpreter
 *
 * Adds the self-sovereign engine tools to the agent's sandbox toolbox.
 * These tools wire directly into the sovereign engines for local-first AI.
 */

export const SOVEREIGN_TOOLS = [
  // ─── Vision ─────────────────────────────────────────────────────
  {
    name: "analyze_image",
    description:
      "Analyze an image using multimodal vision (describe, OCR, chart analysis, object detection). " +
      "Supports Ollama Gemma4, Gemini Flash, and OpenAI. Provide a base64-encoded image or URL.",
    input_schema: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description: "Base64-encoded image data OR a public URL to an image",
        },
        action: {
          type: "string",
          enum: [
            "describe",
            "ocr",
            "chart",
            "screenshot",
            "detect_objects",
            "compare",
            "emotion",
            "qa",
            "moderate",
          ],
          description: "Type of analysis to perform (default: describe)",
        },
        question: {
          type: "string",
          description: "Optional question about the image (used with action='qa')",
        },
        provider: {
          type: "string",
          enum: ["ollama", "gemini", "openai"],
          description: "Vision provider to use (default: auto-selects best available)",
        },
      },
      required: ["image"],
    },
  },

  // ─── Search + RAG ──────────────────────────────────────────────
  {
    name: "sovereign_search",
    description:
      "Perform a grounded web search with RAG pipeline. Automatically determines if search " +
      "is needed via heuristic classifier, fetches results, chunks content, ranks by relevance, " +
      "and synthesizes an answer with inline citations.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        max_results: {
          type: "number",
          description: "Maximum number of search results to process (default: 5)",
        },
      },
      required: ["query"],
    },
  },

  // ─── Knowledge Base ────────────────────────────────────────────
  {
    name: "knowledge_store",
    description:
      "Store a piece of knowledge (fact, preference, decision, instruction, or context) " +
      "in the persistent knowledge base for future reference across conversations.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for this knowledge entry",
        },
        content: {
          type: "string",
          description: "The knowledge content to store",
        },
        category: {
          type: "string",
          enum: ["fact", "preference", "instruction", "decision", "context", "procedure"],
          description: "Category of knowledge (default: fact)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for categorization",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "knowledge_query",
    description:
      "Search the persistent knowledge base for previously stored facts, preferences, " +
      "decisions, and instructions. Returns ranked results by relevance.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find relevant knowledge",
        },
        category: {
          type: "string",
          enum: ["fact", "preference", "instruction", "decision", "context", "procedure"],
          description: "Optional category filter",
        },
        top_k: {
          type: "number",
          description: "Number of results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },

  // ─── Code Interpreter ──────────────────────────────────────────
  {
    name: "run_code",
    description:
      "Execute Python or JavaScript code in an isolated sandbox with full scientific " +
      "computing support (numpy, pandas, matplotlib). Returns stdout, stderr, and any " +
      "generated files (charts, images) as base64.",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code to execute",
        },
        language: {
          type: "string",
          enum: ["python", "javascript", "typescript"],
          description: "Programming language (default: python)",
        },
        timeout_ms: {
          type: "number",
          description: "Maximum execution time in milliseconds (default: 30000)",
        },
      },
      required: ["code"],
    },
  },

  // ─── Voice ─────────────────────────────────────────────────────
  {
    name: "transcribe_audio",
    description:
      "Transcribe audio to text using speech-to-text. Supports Whisper (local), " +
      "Groq Whisper (fast cloud), OpenAI Whisper, and AssemblyAI.",
    input_schema: {
      type: "object",
      properties: {
        audio_base64: {
          type: "string",
          description: "Base64-encoded audio data (WAV, MP3, FLAC, OGG, WebM)",
        },
        provider: {
          type: "string",
          enum: ["local", "groq", "openai", "assemblyai"],
          description: "STT provider (default: auto-selects best available)",
        },
        language: {
          type: "string",
          description: "Language code (e.g. 'en', 'ar', 'fr'). Auto-detected if omitted.",
        },
      },
      required: ["audio_base64"],
    },
  },
  {
    name: "synthesize_speech",
    description:
      "Convert text to speech audio. Supports Chatterbox (local), Qwen3-TTS (local), " +
      "ElevenLabs (cloud), and OpenAI TTS.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to convert to speech",
        },
        provider: {
          type: "string",
          enum: ["chatterbox", "qwen3", "elevenlabs", "openai"],
          description: "TTS provider (default: auto-selects best available)",
        },
        voice_id: {
          type: "string",
          description: "Voice identifier (provider-specific)",
        },
      },
      required: ["text"],
    },
  },
];
