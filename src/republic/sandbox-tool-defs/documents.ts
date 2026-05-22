/**
 * Sandbox Tool Definitions — documents tools
 */

export const DOCUMENTS_TOOLS = [
  {
    name: "create_document",
    description: `Create visually rich, professional documents with multiple templates and formats.
SVG images are automatically converted to PNG for maximum compatibility.

Types & Templates:
• 'pptx' — PowerPoint presentation
  Templates: executive (dark, C-suite), modern-light (clean white), gradient (vibrant startup),
  minimal (academic/research), corporate (enterprise blue/gray)
  Layouts per slide: title, section, content, two_column, image_text, chart, comparison,
  closing, stats (KPI cards), timeline, quote, table, team, process (flow), swot (2×2 matrix)

• 'pdf' — PDF document
  Templates: research-paper (academic with abstract/citations), dashboard (KPI + charts),
  report (business report), one-pager (executive summary), brochure (marketing 2-fold)

• 'docx' — Word document
  Templates: research-paper (academic), policy (policies & procedures), report (business),
  memo (internal memo), proposal (project proposal)
  Features: cover page, table of contents, headers/footers, page numbers, styled tables,
  images with captions, footnotes, branded headings

• 'xlsx' — Excel spreadsheet (uses openpyxl)
• 'md' — Markdown document (rendered to HTML for preview)

Slide/section data: JSON array of objects. Each:
{ "title": "...", "content": "...", "layout": "content|title|chart|stats|...",
  "image_url": "optional URL", "chart_data": {labels, values, chart_type},
  "columns": [{header, items}], "stats": [{label, value, trend}],
  "steps": [{title, description}], "milestones": [{date, title}] }`,
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["pptx", "pdf", "docx", "xlsx", "md"],
          description: "Document type to create",
        },
        filename: {
          type: "string",
          description: "Output filename (e.g., 'company-profile.pptx')",
        },
        title: {
          type: "string",
          description: "Document title",
        },
        template: {
          type: "string",
          description:
            "Template theme. PPTX: executive|modern-light|gradient|minimal|corporate. DOCX: research-paper|policy|report|memo|proposal. PDF: research-paper|dashboard|report|one-pager|brochure",
        },
        slide_data: {
          type: "string",
          description:
            "JSON array of slide/section objects. Each: {title, content, layout, image_url?, chart_data?, columns?, stats?, steps?, milestones?}",
        },
        images: {
          type: "string",
          description:
            "JSON array of images to embed: [{url, caption?, position?}]. SVGs are auto-converted to PNG.",
        },
        branding: {
          type: "string",
          description:
            'JSON branding config: {"company_name": "Acme", "logo_url": "https://...", "primary_color": "#1a365d", "font_family": "Calibri"}',
        },
      },
      required: ["type", "filename", "title", "slide_data"],
    },
  },
  {
    name: "start_preview",
    description: `Signal that the project is ready for live preview. The preview server runs on port 8080
serving /workspace. Write your final output to /workspace, then call this to show the user a live preview card.

For static sites: Just write index.html to /workspace.
For dynamic apps (Express/Flask): Kill existing server first, then start yours on port 8080.
For documents: Convert to HTML preview or provide download link.`,
    input_schema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "Description of what's being previewed",
        },
      },
    },
  },
  {
    name: "create_skill",
    description: `Save a reusable skill/script that can be run again later. Skills are stored in /workspace/.skills/
with a name, description, and executable code. Use this when you create a useful automation
that the user might want to rerun (e.g., 'scrape-company-profile', 'generate-report', 'deploy-stack').`,
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Skill name (slug format, e.g., 'company-scraper')",
        },
        description: {
          type: "string",
          description: "What this skill does",
        },
        language: {
          type: "string",
          enum: ["python", "node", "bash"],
          description: "Language of the skill code",
        },
        code: {
          type: "string",
          description: "The executable skill code",
        },
      },
      required: ["name", "description", "language", "code"],
    },
  },
  {
    name: "archive_files",
    description: `Create a compressed archive (zip, tar.gz, tar.bz2) from files in the workspace.
After creation, the archive is served at http://localhost:8080/<filename> for download.
The response includes a <file_download> tag that the chat UI renders as a clickable download button.

Examples:
• Archive the entire project: files=["."] or files=["/workspace"]
• Archive specific files: files=["src/", "package.json", "README.md"]
• Archive with glob: files=["*.py", "data/*.csv"]

The archive is placed in /workspace/ so the preview server automatically serves it.`,
    input_schema: {
      type: "object" as const,
      properties: {
        files: {
          type: "string",
          description: "JSON array of file paths or globs to include (relative to /workspace)",
        },
        output_name: {
          type: "string",
          description: "Output filename (e.g., 'project.zip', 'deliverables.tar.gz')",
        },
        format: {
          type: "string",
          enum: ["zip", "tar.gz", "tar.bz2"],
          description: "Archive format (default: zip)",
        },
      },
      required: ["files", "output_name"],
    },
  },
  {
    name: "extract_archive",
    description: `Extract a compressed archive (zip, tar.gz, tar.bz2, rar, 7z) to a directory.
Automatically detects format from file extension.
Installs required extractors (unrar, p7zip-full) if not already present.

Use this when:
• User uploads a zip/rar file as a chat attachment
• You downloaded an archive from the web
• You need to inspect archive contents before extracting`,
    input_schema: {
      type: "object" as const,
      properties: {
        archive_path: {
          type: "string",
          description: "Path to the archive file",
        },
        output_dir: {
          type: "string",
          description: "Directory to extract to (default: /workspace/extracted/)",
        },
        list_only: {
          type: "boolean",
          description: "If true, only list contents without extracting",
        },
      },
      required: ["archive_path"],
    },
  },
  {
    name: "request_clarification",
    description: `When the user's request is ambiguous, incomplete, or could be interpreted multiple ways,
use this tool to present a wizard-like card in the chat with options for the user to choose from.

The chat UI renders this as an interactive card with:
• A title and description explaining what you need
• Multiple options as buttons the user can click
• Optional multi-step wizard flow (set step/totalSteps)

DO NOT proceed with assumptions when the request is unclear — ask first!

Examples of when to use:
• "Build me an app" → Ask: Web app or mobile? What framework? What features?
• "Create a presentation" → Ask: How many slides? What style? What content focus?
• "Build a fintech product" → Ask: B2B or B2C? Payments, lending, or analytics? Target market?`,
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Card title (e.g., 'Project Configuration')",
        },
        description: {
          type: "string",
          description: "What you need the user to decide",
        },
        options: {
          type: "string",
          description:
            'JSON array of options: [{"id": "opt1", "label": "Option A", "description": "Details..."}]',
        },
        step: {
          type: "number",
          description: "Current step in multi-step wizard (default: 1)",
        },
        total_steps: {
          type: "number",
          description: "Total steps in wizard (default: 1 for single card)",
        },
        allow_multiple: {
          type: "boolean",
          description: "Allow selecting multiple options (default: false)",
        },
      },
      required: ["title", "description", "options"],
    },
  },
  {
    name: "read_document",
    description: `Read and extract text from documents: PDF, Word (.docx), Excel (.xlsx/.csv), Markdown, plain text.
Returns the text content for analysis or use in building applications.

Use this when the user provides a spec document, data file, or any reference material.`,
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path to the document file in /workspace" },
        format: {
          type: "string",
          description:
            "Force format: pdf, docx, xlsx, csv, md, txt (default: auto-detect from extension)",
        },
        max_chars: { type: "number", description: "Max characters to return (default: 10000)" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "document_generate",
    description: `Generate professional documents from markdown content.

Formats:
• "pdf" — via Puppeteer/Chromium (styled, full CSS support)
• "docx" — via python-docx (Microsoft Word)
• "pptx" — via python-pptx (PowerPoint presentation)

Saves to /workspace/output/.`,
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string", description: "Output format: pdf, docx, pptx" },
        content: { type: "string", description: "Markdown content to convert" },
        title: { type: "string", description: "Document title" },
        filename: { type: "string", description: "Output filename (without extension)" },
        template: {
          type: "string",
          description: "Style template: business, academic, minimal (default: business)",
        },
      },
      required: ["format", "content"],
    },
  },
];
