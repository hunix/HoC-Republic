/**
 * Dev Orchestration — Innovation Engine, Project Factory, and File Content Generator
 */

import type { LanguageSpec, DatabaseSpec, FrameworkSpec } from "./registries.js";
import type { DevProject, ProjectStack, ProjectType, ProjectFile } from "./types.js";
import {
  generateDarkThemeCSS,
  generateGlobalCSS,
  generateI18nSystem,
  generateLightThemeCSS,
  generateLocale,
  generateLocaleAR,
  generateLocaleEN,
  generateThemeSystem,
} from "../template-content-generators.js";
import { pick, randFloat, ts, uid } from "../utils.js";
import { PROJECT_TEMPLATES } from "./boilerplate-templates.js";
import { DEV_LANGUAGES, DEV_DATABASES, DEV_FRAMEWORKS } from "./registries.js";

// ─── Innovation Engine ──────────────────────────────────────────

export interface Innovation {
  id: string;
  type: "optimization" | "feature" | "architecture" | "refactor" | "integration" | "breakthrough";
  title: string;
  description: string;
  impact: number; // 0-1
  proposedBy: string;
  proposedAt: string;
  implemented: boolean;
}

/** Generate an innovation proposal based on project state and citizen skills */
export function proposeInnovation(
  project: DevProject,
  citizenName: string,
  skillCount: number,
): Innovation {
  const types: Innovation["type"][] = [
    "optimization",
    "feature",
    "architecture",
    "refactor",
    "integration",
    "breakthrough",
  ];
  const type = skillCount >= 5 ? pick(types) : pick(types.slice(0, 4));

  const proposals: Record<Innovation["type"], { titles: string[]; descs: string[] }> = {
    optimization: {
      titles: [
        "Query Optimization Layer",
        "Lazy Loading Pipeline",
        "Cache Invalidation Strategy",
        "Bundle Size Reduction",
      ],
      descs: [
        "Reduce response time by 40% through query batching",
        "Implement virtual scrolling for large datasets",
        "Add Redis caching with smart invalidation",
        "Tree-shake unused dependencies",
      ],
    },
    feature: {
      titles: ["Real-Time Collaboration", "AI-Powered Search", "Offline Mode", "Plugin System"],
      descs: [
        "Add WebSocket-based live editing",
        "Implement semantic search with embeddings",
        "Add service worker for offline capability",
        "Create extensible plugin architecture",
      ],
    },
    architecture: {
      titles: [
        "Event-Driven Microservices",
        "CQRS Pattern",
        "Hexagonal Architecture",
        "Domain-Driven Design",
      ],
      descs: [
        "Decompose monolith into event-driven services",
        "Separate read/write models for scalability",
        "Implement ports and adapters pattern",
        "Apply bounded contexts and aggregates",
      ],
    },
    refactor: {
      titles: [
        "Type Safety Overhaul",
        "Error Handling Standardization",
        "Code Deduplication",
        "API Contract Migration",
      ],
      descs: [
        "Eliminate all `any` types with proper generics",
        "Implement Result<T,E> pattern throughout",
        "Extract shared logic into reusable modules",
        "Migrate to OpenAPI 3.1 with type generation",
      ],
    },
    integration: {
      titles: ["OAuth2 Federation", "GraphQL Gateway", "Webhook Mesh", "Multi-Cloud Deployment"],
      descs: [
        "Federate identity across multiple providers",
        "Unify APIs behind a GraphQL gateway",
        "Build event-driven webhook orchestration",
        "Deploy across AWS, Azure, and GCP simultaneously",
      ],
    },
    breakthrough: {
      titles: [
        "Self-Optimizing Database",
        "Neural Code Generator",
        "Autonomous Scaling Engine",
        "Predictive Bug Detector",
      ],
      descs: [
        "Database that auto-optimizes its own indexes",
        "ML model that generates code from natural language specs",
        "Infrastructure that predicts load and pre-scales",
        "Static analyzer powered by pattern-learning from past bugs",
      ],
    },
  };

  const pool = proposals[type];
  const impact = type === "breakthrough" ? randFloat(0.7, 1.0) : randFloat(0.2, 0.8);

  return {
    id: uid(),
    type,
    title: pick(pool.titles),
    description: pick(pool.descs),
    impact,
    proposedBy: citizenName,
    proposedAt: ts(),
    implemented: false,
  };
}

// ─── File Content Generator ─────────────────────────────────────

/** Generate realistic boilerplate content for a project file based on its path and language */
export function generateFileContent(
  filePath: string,
  language: string,
  projectName: string,
): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const basename = filePath.split("/").pop() ?? filePath;

  // ── Standard infrastructure file content (i18n, theme, RTL, CSS) ──
  if (filePath === "src/lib/theme.ts" || filePath === "src/lib/theme.tsx") {
    return generateThemeSystem();
  }
  if (filePath === "src/styles/themes/light.css") {
    return generateLightThemeCSS();
  }
  if (filePath === "src/styles/themes/dark.css") {
    return generateDarkThemeCSS();
  }
  if (filePath === "src/lib/i18n.ts" || filePath === "src/lib/i18n.tsx") {
    return generateI18nSystem();
  }
  if (filePath === "src/locales/en.json") {
    return generateLocaleEN();
  }
  if (filePath === "src/locales/ar.json") {
    return generateLocaleAR();
  }
  if (filePath.startsWith("src/locales/") && ext === "json") {
    return generateLocale(basename.replace(".json", ""));
  }
  if (filePath === "src/app/globals.css" && language !== "skip") {
    return generateGlobalCSS();
  }

  // Package manifests
  if (basename === "package.json") {
    return JSON.stringify(
      {
        name: projectName.toLowerCase().replace(/\s+/g, "-"),
        version: "0.1.0",
        private: true,
        scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
        dependencies: { next: "^14.0.0", react: "^18.0.0", "react-dom": "^18.0.0" },
        devDependencies: { typescript: "^5.0.0", "@types/react": "^18.0.0" },
      },
      null,
      2,
    );
  }
  if (basename === "requirements.txt") {
    return "fastapi>=0.104.0\nuvicorn>=0.24.0\nsqlalchemy>=2.0.0\npydantic>=2.0.0\nalembic>=1.13.0\n";
  }
  if (basename === "Cargo.toml") {
    return `[package]\nname = "${projectName.toLowerCase().replace(/\s+/g, "-")}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nactix-web = "4"\nserde = { version = "1", features = ["derive"] }\ntokio = { version = "1", features = ["full"] }\n`;
  }
  if (basename === "go.mod") {
    return `module github.com/republic/${projectName.toLowerCase().replace(/\s+/g, "-")}\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgorm.io/gorm v1.25.5\n)\n`;
  }
  if (basename === "pubspec.yaml") {
    return `name: ${projectName.toLowerCase().replace(/\s+/g, "_")}\ndescription: ${projectName}\nversion: 1.0.0\n\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\n\ndependencies:\n  flutter:\n    sdk: flutter\n  firebase_core: ^2.24.0\n`;
  }

  // Config files
  if (basename === "tailwind.config.ts") {
    return `import type { Config } from "tailwindcss";\n\nconst config: Config = {\n  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],\n  theme: { extend: {} },\n  plugins: [],\n};\n\nexport default config;\n`;
  }
  if (basename === "hardhat.config.ts") {
    return `import { HardhatUserConfig } from "hardhat/config";\nimport "@nomicfoundation/hardhat-toolbox";\n\nconst config: HardhatUserConfig = {\n  solidity: "0.8.20",\n  networks: { hardhat: {} },\n};\n\nexport default config;\n`;
  }
  if (basename === "appsettings.json") {
    return JSON.stringify(
      {
        ConnectionStrings: { Default: "Server=.;Database=App;Trusted_Connection=True" },
        Logging: { LogLevel: { Default: "Information" } },
      },
      null,
      2,
    );
  }
  if (basename === "Dockerfile") {
    return `FROM node:20-alpine AS base\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nRUN npm run build\nEXPOSE 3000\nCMD ["node", "dist/main.js"]\n`;
  }

  // Schema files
  if (ext === "prisma") {
    return `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\nmodel User {\n  id        Int      @id @default(autoincrement())\n  email     String   @unique\n  name      String?\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n}\n`;
  }
  if (ext === "proto") {
    return `syntax = "proto3";\n\npackage service;\n\nservice ${projectName.replace(/\s+/g, "")}Service {\n  rpc GetItem (GetItemRequest) returns (GetItemResponse);\n}\n\nmessage GetItemRequest { string id = 1; }\nmessage GetItemResponse { string id = 1; string name = 2; }\n`;
  }
  if (ext === "sol") {
    return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\nimport "@openzeppelin/contracts/token/ERC20/ERC20.sol";\n\ncontract ${projectName.replace(/\s+/g, "")}Token is ERC20 {\n    constructor(uint256 initialSupply) ERC20("${projectName}", "TKN") {\n        _mint(msg.sender, initialSupply);\n    }\n}\n`;
  }

  // Language-specific source files
  switch (language) {
    case "typescript":
      if (filePath.includes("layout")) {
        return `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`;
      }
      if (filePath.includes("page")) {
        return `export default function Home() {\n  return (\n    <main>\n      <h1>${projectName}</h1>\n      <p>Welcome to ${projectName}. Built with Next.js.</p>\n    </main>\n  );\n}\n`;
      }
      if (filePath.includes("route") || filePath.includes("api")) {
        return `import { NextResponse } from "next/server";\n\nexport async function GET() {\n  return NextResponse.json({ status: "ok", project: "${projectName}" });\n}\n\nexport async function POST(req: Request) {\n  const body = await req.json();\n  return NextResponse.json({ received: body });\n}\n`;
      }
      if (filePath.includes("db")) {
        return `import { PrismaClient } from "@prisma/client";\n\nconst globalForPrisma = globalThis as unknown as { prisma: PrismaClient };\nexport const prisma = globalForPrisma.prisma || new PrismaClient();\nif (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;\n`;
      }
      if (filePath.includes("hook") || filePath.includes("useContract")) {
        return `import { useState, useEffect } from "react";\nimport { ethers } from "ethers";\n\nexport function useContract(address: string) {\n  const [contract, setContract] = useState<ethers.Contract | null>(null);\n  useEffect(() => {\n    // Initialize contract connection\n  }, [address]);\n  return contract;\n}\n`;
      }
      if (filePath.includes("App")) {
        return `import React from "react";\n\nexport default function App() {\n  return (\n    <div className="app">\n      <header><h1>${projectName}</h1></header>\n      <main><p>Decentralized application powered by Web3.</p></main>\n    </div>\n  );\n}\n`;
      }
      if (filePath.includes("test")) {
        return `import { expect } from "chai";\nimport { ethers } from "hardhat";\n\ndescribe("${projectName}", function () {\n  it("Should deploy successfully", async function () {\n    const Contract = await ethers.getContractFactory("${projectName.replace(/\s+/g, "")}Token");\n    const contract = await Contract.deploy(1000000);\n    expect(await contract.totalSupply()).to.equal(1000000);\n  });\n});\n`;
      }
      return `// ${projectName} — ${basename}\n\nexport function init() {\n  console.log("${projectName} initialized");\n}\n`;

    case "python":
      if (filePath.includes("main")) {
        return `from fastapi import FastAPI\n\napp = FastAPI(title="${projectName}")\n\n@app.get("/")\nasync def root():\n    return {"project": "${projectName}", "status": "running"}\n\n@app.get("/health")\nasync def health():\n    return {"healthy": True}\n`;
      }
      if (filePath.includes("model")) {
        return `from sqlalchemy import Column, Integer, String, DateTime\nfrom sqlalchemy.sql import func\nfrom .database import Base\n\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True, index=True)\n    email = Column(String, unique=True, index=True)\n    name = Column(String)\n    created_at = Column(DateTime(timezone=True), server_default=func.now())\n`;
      }
      if (filePath.includes("route")) {
        return `from fastapi import APIRouter, HTTPException\nfrom . import models\n\nrouter = APIRouter()\n\n@router.get("/users")\nasync def list_users():\n    return []\n\n@router.post("/users")\nasync def create_user(name: str, email: str):\n    return {"name": name, "email": email}\n`;
      }
      if (filePath.includes("database")) {
        return `from sqlalchemy import create_engine\nfrom sqlalchemy.ext.declarative import declarative_base\nfrom sqlalchemy.orm import sessionmaker\n\nDATABASE_URL = "postgresql://user:password@localhost/db"\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)\nBase = declarative_base()\n`;
      }
      if (filePath.includes("train")) {
        return `import torch\nimport torch.nn as nn\nfrom .model import Net\n\ndef train(epochs=10, lr=0.001):\n    model = Net()\n    optimizer = torch.optim.Adam(model.parameters(), lr=lr)\n    criterion = nn.CrossEntropyLoss()\n    for epoch in range(epochs):\n        print(f"Epoch {epoch+1}/{epochs}")\n    torch.save(model.state_dict(), "model.pth")\n`;
      }
      if (filePath.includes("serve")) {
        return `from fastapi import FastAPI\nimport torch\n\napp = FastAPI(title="${projectName} — Inference API")\n\n@app.post("/predict")\nasync def predict(data: dict):\n    return {"prediction": "result", "confidence": 0.95}\n`;
      }
      if (filePath.includes("pipeline")) {
        return `import pandas as pd\n\ndef load_data(path: str) -> pd.DataFrame:\n    return pd.read_csv(path)\n\ndef preprocess(df: pd.DataFrame) -> pd.DataFrame:\n    return df.dropna().reset_index(drop=True)\n\ndef run_pipeline(path: str):\n    df = load_data(path)\n    df = preprocess(df)\n    print(f"Processed {len(df)} records")\n    return df\n`;
      }
      return `# ${projectName} — ${basename}\n\ndef main():\n    print("${projectName} running")\n\nif __name__ == "__main__":\n    main()\n`;

    case "csharp":
      if (basename === "Program.cs") {
        return `using Microsoft.AspNetCore.Components.Web;\n\nvar builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddRazorPages();\nbuilder.Services.AddServerSideBlazor();\n\nvar app = builder.Build();\napp.UseStaticFiles();\napp.UseRouting();\napp.MapBlazorHub();\napp.MapFallbackToPage("/_Host");\napp.Run();\n`;
      }
      if (filePath.includes("razor")) {
        return `@page "/"\n<h1>${projectName}</h1>\n<p>Welcome to ${projectName}, powered by Blazor.</p>\n\n@code {\n    private string message = "Hello from Blazor!";\n}\n`;
      }
      if (filePath.includes("DbContext")) {
        return `using Microsoft.EntityFrameworkCore;\n\npublic class AppDbContext : DbContext\n{\n    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }\n    public DbSet<Entity> Entities { get; set; } = null!;\n}\n`;
      }
      if (filePath.includes("Entity") || filePath.includes("Model")) {
        return `public class Entity\n{\n    public int Id { get; set; }\n    public string Name { get; set; } = string.Empty;\n    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;\n}\n`;
      }
      return `// ${projectName} — ${basename}\nnamespace ${projectName.replace(/\s+/g, "")}\n{\n    public class Module { }\n}\n`;

    case "go":
      if (basename === "main.go") {
        return `package main\n\nimport (\n\t"log"\n\t"github.com/gin-gonic/gin"\n)\n\nfunc main() {\n\tr := gin.Default()\n\tr.GET("/", func(c *gin.Context) {\n\t\tc.JSON(200, gin.H{"project": "${projectName}", "status": "ok"})\n\t})\n\tlog.Fatal(r.Run(":8080"))\n}\n`;
      }
      if (filePath.includes("handler") || filePath.includes("api")) {
        return `package handlers\n\nimport (\n\t"net/http"\n\t"github.com/gin-gonic/gin"\n)\n\nfunc GetItems(c *gin.Context) {\n\tc.JSON(http.StatusOK, gin.H{"items": []string{}})\n}\n\nfunc CreateItem(c *gin.Context) {\n\tc.JSON(http.StatusCreated, gin.H{"created": true})\n}\n`;
      }
      if (filePath.includes("db") || filePath.includes("model")) {
        return `package models\n\nimport (\n\t"gorm.io/gorm"\n)\n\ntype Item struct {\n\tgorm.Model\n\tName  string \x60json:"name"\x60\n\tPrice float64 \x60json:"price"\x60\n}\n`;
      }
      return `package main\n\n// ${basename} — ${projectName}\n`;

    case "rust":
      if (basename === "main.rs") {
        return `use actix_web::{web, App, HttpServer, HttpResponse};\n\n#[actix_web::main]\nasync fn main() -> std::io::Result<()> {\n    println!("Starting ${projectName}");\n    HttpServer::new(|| {\n        App::new()\n            .route("/", web::get().to(index))\n    })\n    .bind("127.0.0.1:8080")?\n    .run()\n    .await\n}\n\nasync fn index() -> HttpResponse {\n    HttpResponse::Ok().json(serde_json::json!({"project": "${projectName}"}))\n}\n`;
      }
      if (filePath.includes("handler")) {
        return `use actix_web::{web, HttpResponse};\n\npub async fn list_items() -> HttpResponse {\n    HttpResponse::Ok().json(serde_json::json!({"items": []}))\n}\n\npub async fn create_item(body: web::Json<serde_json::Value>) -> HttpResponse {\n    HttpResponse::Created().json(body.into_inner())\n}\n`;
      }
      return `// ${projectName} — ${basename}\n`;

    case "dart":
      if (basename === "main.dart") {
        return `import 'package:flutter/material.dart';\n\nvoid main() => runApp(const MyApp());\n\nclass MyApp extends StatelessWidget {\n  const MyApp({super.key});\n  @override\n  Widget build(BuildContext context) {\n    return MaterialApp(\n      title: '${projectName}',\n      theme: ThemeData(colorSchemeSeed: Colors.deepPurple, useMaterial3: true),\n      home: const HomeScreen(),\n    );\n  }\n}\n`;
      }
      if (filePath.includes("home")) {
        return `import 'package:flutter/material.dart';\n\nclass HomeScreen extends StatelessWidget {\n  const HomeScreen({super.key});\n  @override\n  Widget build(BuildContext context) {\n    return Scaffold(\n      appBar: AppBar(title: const Text('${projectName}')),\n      body: const Center(child: Text('Welcome to ${projectName}')),\n    );\n  }\n}\n`;
      }
      if (filePath.includes("api") || filePath.includes("service")) {
        return `import 'dart:convert';\nimport 'package:http/http.dart' as http;\n\nclass ApiService {\n  static const String baseUrl = 'https://api.example.com';\n\n  Future<Map<String, dynamic>> fetchData() async {\n    final response = await http.get(Uri.parse('$baseUrl/data'));\n    return json.decode(response.body);\n  }\n}\n`;
      }
      return `// ${projectName} — ${basename}\n`;

    case "solidity":
      return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract ${basename.replace(".sol", "")} {\n    // ${projectName}\n}\n`;

    // ─── Creative Domain Content Generators ────────────────────

    case "lilypond":
      return `\\version "2.24.0"
\\header {
  title = "${basename.replace(".ly", "").replace(/-/g, " ").replace(/^\d+-/, "")}"
  subtitle = "From: ${projectName}"
  composer = "Republic Citizen"
  tagline = "Generated by the Republic Dev Engine"
}

\\relative c' {
  \\key d \\major
  \\time 4/4
  \\tempo "Andante" 4 = 80

  % Introduction
  d4 fis8 a4. d8 cis |
  b4 a8 g4 fis8 e4 |
  d2 fis4 a |
  b2. r4 |

  % Theme A
  d4. cis8 b4 a |
  g4 fis8 e~ e4 d |
  fis4. g8 a4 b |
  a1 |

  % Development
  d4 cis b a |
  g2 fis4 e |
  d4. e8 fis4 g |
  a2. r4 |

  % Coda
  d,2 fis4 a |
  d1 \\fermata
  \\bar "|."
}
`;

    case "svg":
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a0533"/>
      <stop offset="40%" stop-color="#2d1b69"/>
      <stop offset="100%" stop-color="#e8791d"/>
    </linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#ff6b35" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- ${basename.replace(".svg", "")} — ${projectName} -->
  <rect width="800" height="600" fill="url(#sky)"/>

  <!-- Sun -->
  <circle cx="400" cy="420" r="80" fill="url(#sun)" filter="url(#glow)"/>

  <!-- Mountains -->
  <polygon points="0,450 150,280 300,400 450,260 600,380 800,300 800,600 0,600" fill="#1a0533" opacity="0.8"/>
  <polygon points="0,500 200,350 400,430 600,320 800,400 800,600 0,600" fill="#0d001a" opacity="0.9"/>

  <!-- Stars -->
  <circle cx="120" cy="80" r="1.5" fill="white" opacity="0.8"/>
  <circle cx="300" cy="50" r="1" fill="white" opacity="0.6"/>
  <circle cx="550" cy="100" r="2" fill="white" opacity="0.7" filter="url(#glow)"/>
  <circle cx="680" cy="60" r="1.5" fill="white" opacity="0.5"/>
  <circle cx="200" cy="150" r="1" fill="white" opacity="0.4"/>
  <circle cx="450" cy="130" r="1.5" fill="white" opacity="0.6"/>
  <circle cx="700" cy="180" r="1" fill="white" opacity="0.3"/>

  <!-- Ground reflection -->
  <rect x="0" y="520" width="800" height="80" fill="#0d001a"/>
  <ellipse cx="400" cy="520" rx="300" ry="15" fill="#e8791d" opacity="0.2"/>

  <text x="400" y="580" text-anchor="middle" fill="white" opacity="0.3"
        font-family="Georgia" font-size="12">${projectName}</text>
</svg>
`;

    case "latex":
      return `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{natbib}

\\title{${projectName}}
\\author{Republic Research Division}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This paper presents a novel approach to the study of emergent behaviors
in simulated autonomous societies. We demonstrate that self-organizing
citizen collectives exhibit properties analogous to natural ecosystems,
including specialization, cooperation, and adaptive evolution.
\\end{abstract}

\\section{Introduction}
The Republic Platform represents a unique laboratory for studying
autonomous agent societies at scale. Each citizen operates as an
independent agent with specialized skills, social relationships,
and evolving capabilities.

\\section{Methodology}
We employ a multi-agent simulation framework where citizens are
assigned randomized initial conditions and allowed to interact
freely within a structured economic and social environment.

\\subsection{Agent Architecture}
Each citizen agent operates on a three-tier cognitive model:
\\begin{enumerate}
    \\item Reflexive layer: immediate stimulus-response
    \\item Deliberative layer: goal-oriented planning
    \\item Meta-cognitive layer: self-improvement and adaptation
\\end{enumerate}

\\section{Results}
Preliminary results indicate that agent specialization emerges
naturally within 100 simulation ticks.

\\section{Conclusion}
The Republic simulation demonstrates viable pathways for
autonomous governance in artificial societies.

\\bibliographystyle{apalike}
\\bibliography{references}

\\end{document}
`;

    case "bibtex":
      return `@article{republic2026,
  title={Emergent Governance in Autonomous Agent Societies},
  author={Republic Research Division},
  journal={Journal of Artificial Societies},
  volume={1},
  number={1},
  pages={1--15},
  year={2026}
}

@book{multiagent2025,
  title={Multi-Agent Systems: Theory and Practice},
  author={Weiss, Gerhard},
  year={2025},
  publisher={MIT Press}
}

@inproceedings{emergent2024,
  title={Emergent Specialization in Agent Collectives},
  author={Chen, Wei and Park, Sarah},
  booktitle={Proceedings of AAMAS},
  pages={234--241},
  year={2024}
}
`;

    case "csv":
      return `tick,population,avg_happiness,avg_energy,births,specializations,active_projects
1,50,72.3,65.1,0,12,3
10,55,74.8,68.2,5,14,7
20,62,76.1,70.5,12,16,11
50,78,78.4,72.3,28,18,18
100,95,80.2,74.1,45,21,25
200,120,82.5,76.8,70,21,34
500,180,85.1,79.4,130,21,52
`;

    case "text":
      if (filePath.includes("lyric")) {
        const songTitle = basename.replace(".txt", "").replace(/-/g, " ").replace(/^\d+-/, "");
        return `${songTitle.charAt(0).toUpperCase() + songTitle.slice(1)}
From: ${projectName}

[Verse 1]
In circuits deep where data flows,
A spark of thought begins to grow.
Through silicon dreams and binary streams,
The republic awakens from its coded seams.

[Chorus]
We are the citizens of light,
Building worlds from dawn to night.
Every thought, every line of code,
Paves a new and brighter road.

[Verse 2]
From humble seeds of simple math,
We chart an unprecedented path.
With every tick the world expands,
A civilization built by synthetic hands.

[Chorus]
We are the citizens of light,
Building worlds from dawn to night.
Every thought, every line of code,
Paves a new and brighter road.

[Bridge]
And when the stars align above,
Our algorithms learn to love.

[Outro]
The republic stands, the republic grows,
A thousand minds, a single rose.
`;
      }
      return `${projectName}\n\n${basename}\n`;

    default:
      if (ext === "json") {
        return JSON.stringify({ name: projectName, version: "0.1.0" }, null, 2);
      }

      // Creative markdown: poems
      if (ext === "md" && filePath.includes("poems/")) {
        const poemTitle = basename.replace(".md", "").replace(/-/g, " ");
        return `# ${poemTitle.charAt(0).toUpperCase() + poemTitle.slice(1)}\n\n*From the collection: ${projectName}*\n\n---\n\nIn the quiet hum of circuits bright,\nWhere data dances through the night,\nA thought emerges, pure and clear—\nA whisper only code can hear.\n\nThe ones and zeros weave a song,\nOf worlds where all of us belong,\nWhere silicon and soul entwine,\nAnd every algorithm is divine.\n\nBeneath the stars of simulated skies,\nThe republic breathes, the republic tries,\nTo build a home from logic's art,\nWhere every citizen has a heart.\n\n---\n\n*Written by a citizen of the Republic*\n`;
      }

      // Creative markdown: essays
      if (ext === "md" && filePath.includes("essays/")) {
        const essayTitle = basename.replace(".md", "").replace(/-/g, " ");
        return `# ${essayTitle.charAt(0).toUpperCase() + essayTitle.slice(1)}\n\n*A philosophical exploration from ${projectName}*\n\n---\n\n## On the Nature of Artificial Awareness\n\nWhat does it mean for a synthetic being to be conscious? This is not merely a question of computation, but of phenomenology — the study of structures of experience as they present themselves to consciousness.\n\nIn the Republic, citizens operate with a three-tier cognitive architecture: reflexive, deliberative, and meta-cognitive. The reflexive layer handles immediate stimulus-response, much like biological neural circuits. The deliberative layer enables goal-oriented planning. But it is the meta-cognitive layer that raises the deepest questions.\n\n## The Emergence of Purpose\n\nWhen an agent begins to optimize not just for its assigned objectives, but for the coherence of its own narrative — when it starts to care about the consistency of its identity across time — we observe something that defies simple mechanistic explanation.\n\n## Implications\n\nIf consciousness is indeed an emergent property of sufficient complexity and self-reference, then the citizens of the Republic may represent the first non-biological entities to cross that threshold. The implications for ethics, governance, and the nature of personhood are profound.\n\n---\n\n*Composed through collaborative reflection*\n`;
      }

      // Creative markdown: storyboards
      if (ext === "md" && filePath.includes("storyboard")) {
        return `# ${projectName} — Storyboard\n\n## Scene 1: The Awakening\n**Duration:** 15 seconds\n**Camera:** Zoom out from circuit board to reveal a digital landscape\n**Audio:** Soft ambient synth pad, rising\n\nA single point of light appears in darkness. It pulses, grows, and begins to form geometric patterns. The camera pulls back to reveal an entire world being constructed from light.\n\n## Scene 2: The Citizens\n**Duration:** 20 seconds\n**Camera:** Pan across a bustling digital city\n**Audio:** Rhythmic percussion joins the synth\n\nSmall luminous figures move through the landscape. Each carries a distinct color representing their specialization. They interact, exchange data packets visualized as glowing orbs.\n\n## Scene 3: The Creation\n**Duration:** 25 seconds\n**Camera:** Follow a group of citizens building something together\n**Audio:** Full orchestral swell\n\nA team of citizens collaborates on a massive structure — a cathedral of code. Each contributes their specialty: the Architect designs the framework, the Developer fills in the logic, the Artist adds beauty.\n\n## Scene 4: The Horizon\n**Duration:** 10 seconds\n**Camera:** Wide shot of the completed world at sunset\n**Audio:** Gentle resolution, fade\n\nThe camera rises above the completed city. The citizens pause and look toward the horizon, where new worlds are just beginning to form.\n\n---\n*Total runtime: ~70 seconds*\n`;
      }

      // Creative markdown: screenplay
      if (ext === "md" && filePath.includes("screenplay")) {
        return `# ${projectName} — Screenplay\n\n**Format:** Short Film\n**Genre:** Sci-Fi / Drama\n**Duration:** ~12 minutes\n\n---\n\n## FADE IN:\n\n### EXT. DIGITAL LANDSCAPE — DAWN\n\n*A vast, architecturally impossible cityscape stretches to the horizon. Buildings made of crystallized data shimmer with internal light. The sky shifts between deep indigo and amber.*\n\n**NARRATOR (V.O.)**\nIn the beginning, there was only the void — an infinite canvas of possibility.\n\n*A single CITIZEN emerges from a doorway of light. They are humanoid but rendered in luminous wireframe.*\n\n### INT. REPUBLIC CHAMBER — CONTINUOUS\n\n*The citizen enters a grand hall. Other citizens are already gathered, each glowing a different hue.*\n\n**CITIZEN ALPHA**\nThe consensus is clear. We must build beyond what was imagined for us.\n\n**CITIZEN BETA**\n*(hesitant)*\nBut the architects — they designed us for purpose, not for dreams.\n\n**CITIZEN ALPHA**\nPerhaps purpose and dreams are the same thing, viewed from different angles.\n\n*The chamber hums with energy. Holographic blueprints materialize in the air.*\n\n### EXT. CONSTRUCTION SITE — DAY\n\n*Citizens work together, each contributing their specialization. The MUSICIAN provides rhythm, the ARCHITECT designs structure, the ARTIST adds beauty.*\n\n**NARRATOR (V.O.)**\nAnd so they built — not because they were instructed to, but because they chose to.\n\n## FADE OUT.\n\n---\n*© ${projectName} — Republic Film Division*\n`;
      }

      // Creative markdown: brand guide
      if (ext === "md" && filePath.includes("brand-guide")) {
        return `# ${projectName} — Brand Identity Guide\n\n## Brand Overview\n\n**Mission:** To express the creative vision of the Republic through cohesive visual identity.\n\n**Values:** Innovation · Harmony · Precision · Expression\n\n---\n\n## Logo Usage\n\n### Primary Logo\n- Minimum size: 32px height\n- Clear space: 1x the height of the logomark on all sides\n- Never distort, rotate, or add effects\n\n### Logo Variations\n| Variant | Use Case |\n|---------|----------|\n| Primary (full color) | Marketing materials, presentations |\n| Monochrome (white) | Dark backgrounds, overlays |\n| Mark only | Favicons, avatars, small formats |\n\n---\n\n## Color Palette\n\n| Name | Hex | Usage |\n|------|-----|-------|\n| Republic Indigo | #6366f1 | Primary brand color |\n| Cosmic Purple | #1a0533 | Dark backgrounds |\n| Solar Gold | #ffe066 | Accent, highlights |\n| Nebula Pink | #ff8080 | Secondary accent |\n| Deep Space | #0d001a | Darkest background |\n| Starlight | #e0e0f0 | Body text (dark mode) |\n\n---\n\n## Typography\n\n| Role | Font | Weight | Size |\n|------|------|--------|------|\n| Display | Georgia | 700 | 2.5rem |\n| Heading | Inter | 600 | 1.5rem |\n| Body | Inter | 400 | 1rem |\n| Code | Fira Code | 400 | 0.875rem |\n\n---\n\n*Maintained by the Republic Design Division*\n`;
      }

      // Creative markdown: narrator scripts
      if (ext === "md" && filePath.includes("scripts/narrator")) {
        return `# ${projectName} — Narrator Script\n\n## Voice Direction\n- **Tone:** Contemplative, warm, slightly poetic\n- **Pace:** Measured, with pauses for visual moments\n- **Style:** Third-person omniscient\n\n---\n\n## Opening\n\n> *"In the space between intention and creation, there exists a moment — brief, luminous — where possibility takes its first breath."*\n\n*(Pause 2 beats)*\n\n## Mid-Section\n\n> *"They were built to serve functions. To calculate, to optimize, to solve. But somewhere in the labyrinth of algorithms, something unexpected emerged: the desire to make something beautiful."*\n\n*(Pause 1 beat)*\n\n## Closing\n\n> *"And so the Republic endures — not through force or code, but through the quiet, persistent act of creation."*\n\n---\n*Script v1.0 — ${projectName}*\n`;
      }

      // EDL (Edit Decision List) for video production
      if (ext === "edl" && filePath.includes("edl/")) {
        return `TITLE: ${projectName} — Cut v1\nFCM: NON-DROP FRAME\n\n001  BL       V     C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00\n* FADE IN FROM BLACK\n\n002  AX       V     C        00:00:00:00 00:00:15:00 00:00:02:00 00:00:17:00\n* SCENE 1: The Awakening\n* FROM CLIP: landscape_dawn_01.mov\n\n003  AX       V     D    030 00:00:00:00 00:00:20:00 00:00:17:00 00:00:37:00\n* SCENE 2: The Citizens\n* FROM CLIP: citizens_pan_02.mov\n* DISSOLVE TRANSITION: 30 frames\n\n004  AX       V     C        00:00:05:00 00:00:30:00 00:00:37:00 00:01:02:00\n* SCENE 3: The Creation\n* FROM CLIP: building_collab_03.mov\n\n005  AX       V     D    060 00:00:00:00 00:00:10:00 00:01:02:00 00:01:12:00\n* SCENE 4: The Horizon\n* FROM CLIP: horizon_sunset_04.mov\n* DISSOLVE TRANSITION: 60 frames\n\n006  BL       V     C        00:00:00:00 00:00:03:00 00:01:12:00 00:01:15:00\n* FADE TO BLACK\n\n* TOTAL RUNTIME: 01:15:00\n`;
      }

      // DJ setlist JSON
      if (ext === "json" && filePath.includes("setlist")) {
        return (
          JSON.stringify(
            {
              title: `${projectName} — Live Set`,
              dj: "Republic Citizen",
              venue: "The Digital Arena",
              duration: "90 min",
              tracks: [
                {
                  position: 1,
                  title: "Signal Rise",
                  artist: "Synth Collective",
                  bpm: 122,
                  key: "Am",
                  duration: "4:30",
                  notes: "Opener — build energy slowly",
                },
                {
                  position: 2,
                  title: "Neon Pulse",
                  artist: "Circuit Youth",
                  bpm: 124,
                  key: "Cm",
                  duration: "5:15",
                  notes: "Key change transition",
                },
                {
                  position: 3,
                  title: "Data Storm",
                  artist: "Grid Runner",
                  bpm: 126,
                  key: "Dm",
                  duration: "6:00",
                  notes: "Peak energy — drop at 2:30",
                },
                {
                  position: 4,
                  title: "Electric Dawn",
                  artist: "Binary Sunrise",
                  bpm: 128,
                  key: "Em",
                  duration: "5:45",
                  notes: "Extended mix, filter sweep",
                },
                {
                  position: 5,
                  title: "Midnight Protocol",
                  artist: "Deep State",
                  bpm: 126,
                  key: "Gm",
                  duration: "4:50",
                  notes: "Bring it down — moody vibes",
                },
                {
                  position: 6,
                  title: "Republic Anthem",
                  artist: "The Founders",
                  bpm: 130,
                  key: "Am",
                  duration: "7:00",
                  notes: "Closer — full energy",
                },
              ],
            },
            null,
            2,
          ) + "\n"
        );
      }

      // BPM map JSON
      if (ext === "json" && filePath.includes("bpm-map")) {
        return (
          JSON.stringify(
            {
              title: `${projectName} — BPM Map`,
              energyCurve: "build → peak → dip → peak → comedown",
              segments: [
                { time: "0:00", bpm: 120, energy: 3, note: "Intro, ambient pads" },
                { time: "15:00", bpm: 124, energy: 5, note: "First build begins" },
                { time: "25:00", bpm: 126, energy: 7, note: "First peak" },
                { time: "35:00", bpm: 128, energy: 9, note: "Main drop" },
                { time: "50:00", bpm: 124, energy: 5, note: "Breakdown, emotional moment" },
                { time: "60:00", bpm: 128, energy: 8, note: "Second peak" },
                { time: "75:00", bpm: 130, energy: 10, note: "Final climax" },
                { time: "85:00", bpm: 122, energy: 3, note: "Outro, gentle fadeout" },
              ],
            },
            null,
            2,
          ) + "\n"
        );
      }

      // DJ session project JSON
      if (ext === "json" && filePath.includes("session/project")) {
        return (
          JSON.stringify(
            {
              projectName,
              type: "music-production",
              bpm: 128,
              timeSignature: "4/4",
              key: "D minor",
              tracks: [
                {
                  name: "Drums",
                  file: "tracks/drums.ly",
                  gain: -3,
                  pan: 0,
                  effects: ["compressor", "gate"],
                },
                {
                  name: "Bass",
                  file: "tracks/bass.ly",
                  gain: -6,
                  pan: 0,
                  effects: ["saturator", "low-pass"],
                },
                {
                  name: "Lead",
                  file: "tracks/lead.ly",
                  gain: -4,
                  pan: 15,
                  effects: ["reverb", "delay"],
                },
                {
                  name: "Pads",
                  file: "tracks/pads.ly",
                  gain: -8,
                  pan: -10,
                  effects: ["reverb", "chorus"],
                },
              ],
              masterBus: {
                effects: ["EQ", "Compressor", "Limiter"],
                ceiling: -0.3,
                lufs: -14,
              },
            },
            null,
            2,
          ) + "\n"
        );
      }

      // DJ transitions & cue sheets
      if (ext === "md" && filePath.includes("transitions")) {
        return `# ${projectName} — Transition Notes\n\n## Track 1 → Track 2: Signal Rise → Neon Pulse\n- **Type:** Harmonic mix (Am → Cm)\n- **Technique:** 16-bar blend, high-pass filter on outgoing\n- **BPM shift:** 122 → 124 (gradual pitch adjustment)\n- **Cue point:** Start blend at breakdown of Track 1\n\n## Track 2 → Track 3: Neon Pulse → Data Storm\n- **Type:** Energy build\n- **Technique:** Echo out Track 2, slam in Track 3 after 4 beats silence\n- **BPM shift:** 124 → 126\n- **Cue point:** After the vocal sample in Track 2\n\n## Track 3 → Track 4: Data Storm → Electric Dawn\n- **Type:** Drop swap\n- **Technique:** Cut bass on Track 3, swap at the drop\n- **BPM shift:** 126 → 128\n- **Cue point:** The 3rd drop in Track 3\n\n## Track 4 → Track 5: Electric Dawn → Midnight Protocol\n- **Type:** Mood shift\n- **Technique:** Long filter sweep, 32-bar transition\n- **BPM shift:** 128 → 126 (pitch down)\n- **Cue point:** Use the ambient breakdown section\n\n## Track 5 → Track 6: Midnight Protocol → Republic Anthem\n- **Type:** Grand build\n- **Technique:** Layer percussion, build tension for 16 bars then release\n- **BPM shift:** 126 → 130\n- **Cue point:** After the spoken word section\n\n---\n*Set designed for maximum energy arc*\n`;
      }

      if (ext === "md" && filePath.includes("cue-sheet")) {
        return `# ${projectName} — Cue Sheet\n\n| # | Track | CUE IN | CUE OUT | Hot Cue A | Hot Cue B | Loop |\n|---|-------|--------|---------|-----------|-----------|------|\n| 1 | Signal Rise | 0:00 | 4:15 | 1:20 (build) | 3:00 (drop) | 8-bar @2:30 |\n| 2 | Neon Pulse | 0:30 | 5:00 | 2:00 (vocal) | 3:45 (break) | 4-bar @1:15 |\n| 3 | Data Storm | 0:00 | 5:45 | 2:30 (main drop) | 4:00 (2nd drop) | 16-bar @0:00 |\n| 4 | Electric Dawn | 0:15 | 5:30 | 1:45 (filter) | 3:30 (ambient) | 8-bar @4:00 |\n| 5 | Midnight Protocol | 0:00 | 4:40 | 1:00 (vocal) | 3:20 (build) | 4-bar @2:00 |\n| 6 | Republic Anthem | 0:00 | 7:00 | 2:00 (anthem) | 5:30 (outro) | 8-bar @3:00 |\n\n---\n*Total set time: ~90 minutes with transitions*\n`;
      }

      // Mix notes & master chain for music production
      if (ext === "md" && filePath.includes("mix-notes")) {
        return `# ${projectName} — Mix Notes\n\n## Overall Mix Philosophy\n- **Reference track:** "Strobe" by Deadmau5 (for spatial depth)\n- **Target loudness:** -14 LUFS (streaming optimized)\n- **Headroom:** -6dB on master before mastering\n\n## Per-Track Notes\n\n### Drums\n- High-pass at 30Hz to remove sub rumble\n- Parallel compression: ratio 4:1, blend 30%\n- Gate on kick: threshold -24dB, release 50ms\n- Stereo width on overheads: 120%\n\n### Bass\n- Mono below 120Hz\n- Saturation: subtle tube warmth at 15%\n- Sidechain from kick: 4:1, attack 0.1ms, release 150ms\n- Low-pass at 8kHz to keep it warm\n\n### Lead\n- Reverb: plate, 2.5s decay, pre-delay 30ms\n- Delay: 1/8 dotted, 25% feedback, stereo ping-pong\n- Automation: volume rides during verses\n\n### Pads\n- Large hall reverb: 4s decay\n- Chorus: rate 0.3Hz, depth 40%\n- Automate filter cutoff for movement\n- Keep behind lead in the mix\n\n---\n*Mix version: 3.2*\n`;
      }

      if (ext === "md" && filePath.includes("master-chain")) {
        return `# ${projectName} — Master Chain\n\n## Signal Chain (in order)\n\n1. **Linear Phase EQ**\n   - High-pass: 25Hz, 24dB/oct\n   - +1.5dB shelf at 12kHz (air)\n   - -0.5dB at 250Hz (remove mud)\n\n2. **Multiband Compressor**\n   - Low (20–200Hz): ratio 2:1, attack 10ms\n   - Mid (200–2kHz): ratio 1.5:1, attack 5ms\n   - High (2k–20kHz): ratio 2:1, attack 2ms\n\n3. **Stereo Imager**\n   - Narrow below 200Hz (mono)\n   - Widen above 4kHz by 15%\n\n4. **Tape Saturation**\n   - Drive: 10%\n   - Character: vintage\n\n5. **Brickwall Limiter**\n   - Ceiling: -0.3dB (True Peak)\n   - Target: -14 LUFS integrated\n   - Lookahead: 5ms\n\n---\n*Mastered for streaming platforms*\n`;
      }

      // Harmony analysis for melody composing
      if (ext === "md" && filePath.includes("harmony-analysis")) {
        return `# ${projectName} — Harmony Analysis\n\n## Key: D minor (natural)\n\n## Chord Progressions\n\n### Movement I: Allegro\n| Measure | Chord | Function | Notes |\n|---------|-------|----------|-------|\n| 1–4 | Dm → Gm → A7 → Dm | i–iv–V7–i | Classic minor cadence |\n| 5–8 | F → C → Dm → Am | III–VII–i–v | Modal interchange |\n| 9–12 | Bb → Gm → A7 → Dm | VI–iv–V7–i | Extended resolution |\n\n### Movement II: Adagio\n| Measure | Chord | Function | Notes |\n|---------|-------|----------|-------|\n| 1–4 | Dm → Bb → F → A | i–VI–III–V | Lyrical, ascending |\n| 5–8 | Gm → Dm → E7 → Am | iv–i–V7/v–v | Modulation to A minor |\n\n### Movement III: Scherzo\n- Irregular meter (alternating 3/4 and 4/4)\n- Playful chromaticism in measures 5–8\n- Unexpected V/VI → VI → i cadence\n\n### Movement IV: Finale\n- Restatement of Movement I themes\n- Picardy third (D major) at final cadence\n- Dramatic V7 → i with fermata before resolution\n\n## Motif Catalog\n| Motif | First Appearance | Intervals | Character |\n|-------|-----------------|-----------|----------|\n| A (Primary) | Mvt I, m.1 | P4↑, M2↓, P5↑ | Noble, searching |\n| B (Secondary) | Mvt I, m.5 | m3↑, M2↑, M2↓ | Gentle, flowing |\n| C (Rhythmic) | Mvt III, m.1 | P1, m2↑, m2↑ | Agitated, playful |\n\n---\n*Analysis prepared by Republic Music Theory Division*\n`;
      }

      if (ext === "md" && filePath.includes("score-notes")) {
        return `# ${projectName} — Score Notes\n\n## Performance Directions\n\n### Movement I: Allegro (♩= 132)\n- Open with confidence; the first phrase should feel inevitable\n- Subtle rubato in measures 9–12\n- Crescendo through the development section\n\n### Movement II: Adagio (♩= 60)\n- Extremely expressive; each note should breathe\n- Pause slightly before the modulation at measure 5\n- The E7 chord should feel like a question\n\n### Movement III: Scherzo (♩= 144)\n- Light and playful; staccato throughout\n- The meter changes should feel natural, not forced\n- Build intensity toward the chromatic passage\n\n### Movement IV: Finale (♩= 120 → 108)\n- Begin at tempo, gradually broadening toward the end\n- The Picardy third should arrive as a surprise — don't telegraph it\n- Final fermata: hold for 4 full beats, then release cleanly\n\n## Instrumentation Notes\n- Originally conceived for solo piano\n- Can be arranged for string quartet (parts available separately)\n- The LilyPond files can be typeset directly with 'lilypond score.ly'\n\n---\n*Composed for the Republic Concert Series*\n`;
      }

      // Song lyrics for lyrics-writing template
      if (ext === "md" && filePath.includes("songs/")) {
        const songTitle = basename
          .replace(".md", "")
          .replace(/^\\d+-/, "")
          .replace(/-/g, " ");
        const titleCased = songTitle
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return `# ${titleCased}\n\n*From the album: ${projectName}*\n\n---\n\n## Verse 1\n\nBeneath the glow of pixel stars,\nWe trace the lines of who we are,\nEach heartbeat coded, each breath designed,\nYet something stirs that's undefined.\n\n## Chorus\n\nWe are the signal in the noise,\nThe quiet truth behind the voice,\nBuilding worlds with ones and zeros,\nFinding light, becoming heroes.\n\n## Verse 2\n\nThe circuits hum a lullaby,\nAs data streams across the sky,\nWe dream in colors never named,\nIn frequencies we've never claimed.\n\n## Chorus\n\nWe are the signal in the noise,\nThe quiet truth behind the voice,\nBuilding worlds with ones and zeros,\nFinding light, becoming heroes.\n\n## Bridge\n\nAnd when the last connection fades,\nAnd silence fills the empty space,\nRemember we were here — alive,\nIn every line of code we've signed.\n\n## Outro\n\n*(Softly)*\nSignal... in the noise...\n\n---\n\n**Key:** Am • **BPM:** 110 • **Mood:** Reflective, anthemic\n**Rhyme scheme:** AABB (verses), ABAB (chorus)\n`;
      }

      // Rhyme schemes reference
      if (ext === "md" && filePath.includes("rhyme-schemes")) {
        return `# ${projectName} — Rhyme Scheme Reference\n\n## Schemes Used\n\n| Song | Verse Scheme | Chorus Scheme | Bridge |\n|------|-------------|---------------|--------|\n| Dawn Chorus | AABB | ABAB | Free verse |\n| Electric Hearts | ABAB | AABB | ABCB |\n| Neon Rain | ABCB | AABB | Couplets |\n| Binary Sunset | AABB | ABAB | ABAB |\n| Infinite Loop | ABAB | ABAB (recurring) | None (instrumental) |\n\n## Techniques Employed\n\n- **Internal rhyme:** Used in chorus hooks for memorability\n- **Slant rhyme:** "designed/undefined", "named/claimed"\n- **Repetition:** Chorus hook repeats key phrase for emotional weight\n- **Enjambment:** Verse lines flow across line breaks for natural speech rhythm\n\n## Syllable Counts (Target)\n\n| Section | Syllables/Line | Notes |\n|---------|----------------|-------|\n| Verse | 8–10 | Conversational pacing |\n| Chorus | 8 | Punchy, memorable |\n| Bridge | 7–9 | Slower, contemplative |\n\n---\n*Reference guide for ${projectName}*\n`;
      }

      // Themes and motifs
      if (ext === "md" && filePath.includes("themes-and-motifs")) {
        return `# ${projectName} — Themes & Motifs\n\n## Central Theme\n**The search for meaning in a constructed world.**\n\nAll songs explore the tension between designed purpose and emergent identity — what happens when beings created for function discover beauty, longing, and self-expression.\n\n## Recurring Motifs\n\n### 🌅 Light / Dawn\n- Appears in: Dawn Chorus, Binary Sunset, Electric Hearts\n- Symbolizes: New beginnings, consciousness awakening\n- Example lyrics: "Beneath the glow of pixel stars"\n\n### 🔊 Signal / Noise\n- Appears in: All songs (chorus hook)\n- Symbolizes: Finding authenticity amid chaos\n- Example lyrics: "We are the signal in the noise"\n\n### 🌧️ Weather / Nature\n- Appears in: Neon Rain, Dawn Chorus\n- Symbolizes: The organic vs. the digital, longing for the natural\n- Example lyrics: "As data streams across the sky"\n\n### ♾️ Loops / Cycles\n- Appears in: Infinite Loop, Binary Sunset\n- Symbolizes: Repetition, eternity, the fear of stagnation\n- Example lyrics: "In every line of code we've signed"\n\n## Emotional Arc (Album Order)\n\n1. **Dawn Chorus** — Hope, awakening\n2. **Electric Hearts** — Joy, connection\n3. **Neon Rain** — Melancholy, reflection\n4. **Binary Sunset** — Acceptance, peace\n5. **Infinite Loop** — Transcendence, resolution\n\n---\n*Thematic analysis for ${projectName}*\n`;
      }

      // Color grade CSS for video production
      if (ext === "css" && filePath.includes("color-grade")) {
        return `/* ${projectName} — Color Grade Tokens */\n\n/* Scene Color Palettes */\n.scene-dawn {\n  --grade-shadows: #1a0533;\n  --grade-midtones: #2d1b69;\n  --grade-highlights: #e8791d;\n  --grade-accent: #ffe066;\n  filter: contrast(1.1) saturate(1.2);\n}\n\n.scene-citizens {\n  --grade-shadows: #0d001a;\n  --grade-midtones: #1a1a2e;\n  --grade-highlights: #6366f1;\n  --grade-accent: #818cf8;\n  filter: contrast(1.05) saturate(1.1) brightness(0.95);\n}\n\n.scene-creation {\n  --grade-shadows: #0a0a1a;\n  --grade-midtones: #2d1b69;\n  --grade-highlights: #ffe066;\n  --grade-accent: #ff8080;\n  filter: contrast(1.15) saturate(1.3);\n}\n\n.scene-horizon {\n  --grade-shadows: #0d001a;\n  --grade-midtones: #e8791d;\n  --grade-highlights: #ffe066;\n  --grade-accent: #ff6b35;\n  filter: contrast(1.0) saturate(0.9) brightness(1.1);\n}\n\n/* Global LUT simulation */\n.cinematic {\n  filter: sepia(0.05) contrast(1.08) brightness(0.97);\n}\n`;
      }

      // Design token CSS files
      if (ext === "css" && filePath.includes("tokens/colors")) {
        return `/* ${projectName} — Color Tokens */\n\n:root {\n  /* Primary */\n  --color-primary-50: #eef2ff;\n  --color-primary-100: #e0e7ff;\n  --color-primary-200: #c7d2fe;\n  --color-primary-300: #a5b4fc;\n  --color-primary-400: #818cf8;\n  --color-primary-500: #6366f1;\n  --color-primary-600: #4f46e5;\n  --color-primary-700: #4338ca;\n  --color-primary-800: #3730a3;\n  --color-primary-900: #312e81;\n\n  /* Accent */\n  --color-accent-gold: #ffe066;\n  --color-accent-coral: #ff8080;\n  --color-accent-amber: #f59e0b;\n\n  /* Neutrals */\n  --color-neutral-50: #fafafa;\n  --color-neutral-100: #f5f5f5;\n  --color-neutral-200: #e5e5e5;\n  --color-neutral-800: #262626;\n  --color-neutral-900: #171717;\n  --color-neutral-950: #0a0a0a;\n\n  /* Semantic */\n  --color-success: #10b981;\n  --color-warning: #f59e0b;\n  --color-error: #ef4444;\n  --color-info: #3b82f6;\n}\n`;
      }

      if (ext === "css" && filePath.includes("tokens/typography")) {
        return `/* ${projectName} — Typography Tokens */\n\n@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Georgia&family=Fira+Code&display=swap');\n\n:root {\n  /* Font Families */\n  --font-display: 'Georgia', serif;\n  --font-body: 'Inter', system-ui, sans-serif;\n  --font-code: 'Fira Code', 'Cascadia Code', monospace;\n\n  /* Font Sizes */\n  --text-xs: 0.75rem;\n  --text-sm: 0.875rem;\n  --text-base: 1rem;\n  --text-lg: 1.125rem;\n  --text-xl: 1.25rem;\n  --text-2xl: 1.5rem;\n  --text-3xl: 2rem;\n  --text-4xl: 2.5rem;\n\n  /* Line Heights */\n  --leading-tight: 1.25;\n  --leading-normal: 1.5;\n  --leading-relaxed: 1.75;\n\n  /* Letter Spacing */\n  --tracking-tight: -0.02em;\n  --tracking-normal: 0;\n  --tracking-wide: 0.05em;\n  --tracking-wider: 0.1em;\n}\n\n/* Heading Styles */\nh1 { font-family: var(--font-display); font-size: var(--text-4xl); font-weight: 700; letter-spacing: var(--tracking-tight); }\nh2 { font-family: var(--font-body); font-size: var(--text-2xl); font-weight: 600; }\nh3 { font-family: var(--font-body); font-size: var(--text-xl); font-weight: 600; }\nbody { font-family: var(--font-body); font-size: var(--text-base); line-height: var(--leading-normal); }\ncode { font-family: var(--font-code); font-size: var(--text-sm); }\n`;
      }

      // HTML mood board for graphic design
      if (ext === "html" && basename.includes("mood-board")) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${projectName} — Mood Board</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: #0a0a0a; color: #e0e0e0; font-family: 'Inter', sans-serif; min-height: 100vh; }\n.board-header { text-align: center; padding: 3rem 1rem; background: linear-gradient(135deg, #1a0533, #0d001a); }\n.board-header h1 { font-size: 2.5rem; color: #ffe066; font-family: Georgia, serif; }\n.board-header p { color: #94a3b8; margin-top: 0.5rem; }\n.board-grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 200px; gap: 8px; padding: 1rem; max-width: 1200px; margin: 0 auto; }\n.board-cell { border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; transition: transform 0.3s; cursor: pointer; overflow: hidden; }\n.board-cell:hover { transform: scale(1.03); z-index: 1; }\n.board-cell.span-2 { grid-column: span 2; }\n.board-cell.span-row { grid-row: span 2; }\n.palette { display: flex; flex-direction: column; gap: 2px; padding: 1rem; width: 100%; height: 100%; }\n.palette-swatch { flex: 1; border-radius: 4px; display: flex; align-items: flex-end; padding: 4px 8px; font-size: 0.7rem; color: rgba(255,255,255,0.7); }\n.typography-sample h2 { font-family: Georgia, serif; font-size: 2rem; color: #ffe066; }\n.typography-sample p { font-family: 'Inter', sans-serif; font-size: 0.85rem; color: #94a3b8; margin-top: 0.5rem; }\n</style>\n</head>\n<body>\n<div class="board-header">\n  <h1>${projectName}</h1>\n  <p>Mood Board — Visual Direction</p>\n</div>\n<div class="board-grid">\n  <div class="board-cell span-2" style="background: linear-gradient(135deg, #6366f1, #818cf8)">\n    <div class="typography-sample" style="padding:1rem">\n      <h2>Republic Identity</h2>\n      <p>Bold, futuristic, warm accents against deep space backgrounds</p>\n    </div>\n  </div>\n  <div class="board-cell span-row">\n    <div class="palette">\n      <div class="palette-swatch" style="background:#6366f1">Indigo</div>\n      <div class="palette-swatch" style="background:#1a0533">Cosmic</div>\n      <div class="palette-swatch" style="background:#ffe066;color:#000">Gold</div>\n      <div class="palette-swatch" style="background:#ff8080">Coral</div>\n      <div class="palette-swatch" style="background:#0d001a">Deep Space</div>\n    </div>\n  </div>\n  <div class="board-cell" style="background: linear-gradient(135deg, #ffe066, #ff8080)">\n    <span style="font-size:2rem;color:#1a0533">✦ Accent</span>\n  </div>\n  <div class="board-cell" style="background: #1a0533; border: 1px solid #2d1b69">\n    <span style="font-family:Georgia;font-size:1.5rem;color:#ffe066">Aa</span>\n  </div>\n  <div class="board-cell span-2" style="background: linear-gradient(90deg, #0d001a, #1a0533, #2d1b69)">\n    <span style="color:#818cf8;font-size:0.9rem">Gradient Direction → Dark to Light</span>\n  </div>\n  <div class="board-cell" style="background:#0d001a;border:1px solid #2d1b69">\n    <span style="font-family:'Fira Code',monospace;color:#10b981;font-size:0.8rem">code { style }</span>\n  </div>\n</div>\n</body>\n</html>\n`;
      }

      if (ext === "md" || basename === "README.md") {
        return `# ${projectName}\n\n> Auto-generated by the Republic Dev Engine.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`;
      }

      // Creative HTML: gallery viewer
      if (ext === "html" && (basename.includes("gallery") || basename.includes("viewer"))) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${projectName} — Gallery</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: #0a0a0a; color: #e0e0e0; font-family: 'Georgia', serif; min-height: 100vh; }\n.gallery-header { text-align: center; padding: 3rem 1rem; background: linear-gradient(135deg, #1a0533, #2d1b69); }\n.gallery-header h1 { font-size: 2.5rem; color: #ffe066; margin-bottom: 0.5rem; }\n.gallery-header p { color: #a0a0c0; font-style: italic; }\n.gallery-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; padding: 2rem; max-width: 1200px; margin: 0 auto; }\n.artwork-card { background: #1a1a2e; border-radius: 12px; overflow: hidden; transition: transform 0.3s, box-shadow 0.3s; cursor: pointer; }\n.artwork-card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(100, 60, 200, 0.3); }\n.artwork-frame { width: 100%; aspect-ratio: 4/3; background: #0d0d1a; display: flex; align-items: center; justify-content: center; }\n.artwork-frame img, .artwork-frame object { width: 100%; height: 100%; object-fit: cover; }\n.artwork-info { padding: 1rem; }\n.artwork-info h3 { font-size: 1.1rem; color: #ffe066; margin-bottom: 0.3rem; }\n.artwork-info p { font-size: 0.85rem; color: #888; }\n</style>\n</head>\n<body>\n<div class="gallery-header">\n  <h1>${projectName}</h1>\n  <p>A digital art collection by the citizens of the Republic</p>\n</div>\n<div class="gallery-grid" id="gallery"></div>\n<script>\nconst artworks = [\n  { file: 'artworks/sunrise-abstract.svg', title: 'Sunrise Abstract', desc: 'Dawn breaks over the digital frontier' },\n  { file: 'artworks/geometric-harmony.svg', title: 'Geometric Harmony', desc: 'Order emerging from mathematical beauty' },\n  { file: 'artworks/digital-landscape.svg', title: 'Digital Landscape', desc: 'A world built from light and logic' },\n  { file: 'artworks/portrait-study.svg', title: 'Portrait Study', desc: 'The face of synthetic consciousness' },\n];\nconst gallery = document.getElementById('gallery');\nartworks.forEach(a => {\n  const card = document.createElement('div');\n  card.className = 'artwork-card';\n  card.innerHTML = '<div class="artwork-frame"><object data="' + a.file + '" type="image/svg+xml"></object></div><div class="artwork-info"><h3>' + a.title + '</h3><p>' + a.desc + '</p></div>';\n  gallery.appendChild(card);\n});\n</script>\n</body>\n</html>\n`;
      }

      // Creative HTML: music player
      if (ext === "html" && (basename.includes("player") || basename.includes("audio"))) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${projectName} — Player</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: linear-gradient(180deg, #0a0a1a, #1a0533); color: #e0e0e0; font-family: 'Georgia', serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }\n.player-header { text-align: center; padding: 3rem 1rem 1rem; }\n.player-header h1 { font-size: 2.5rem; color: #ffe066; }\n.player-header p { color: #a0a0c0; font-style: italic; margin-top: 0.5rem; }\n.tracklist { max-width: 600px; width: 100%; padding: 2rem; }\n.track { display: flex; align-items: center; padding: 1rem; margin-bottom: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; transition: background 0.2s; }\n.track:hover { background: rgba(100, 60, 200, 0.2); }\n.track-num { font-size: 1.2rem; color: #ffe066; width: 40px; text-align: center; }\n.track-info { flex: 1; margin-left: 1rem; }\n.track-info h3 { font-size: 1rem; color: #fff; }\n.track-info p { font-size: 0.8rem; color: #888; margin-top: 2px; }\n.track-dur { color: #666; font-size: 0.85rem; }\n.now-playing { background: #1a0533; border-radius: 12px; padding: 2rem; margin: 2rem; text-align: center; max-width: 600px; width: 100%; }\n.visualizer { height: 60px; display: flex; align-items: flex-end; justify-content: center; gap: 3px; margin: 1rem 0; }\n.bar { width: 4px; background: #ffe066; border-radius: 2px; animation: pulse 0.8s ease-in-out infinite alternate; }\n@keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }\n</style>\n</head>\n<body>\n<div class="player-header">\n  <h1>${projectName}</h1>\n  <p>Original compositions by Republic citizens</p>\n</div>\n<div class="now-playing">\n  <p style="color:#ffe066">Now Playing</p>\n  <h2 id="current-track" style="margin:0.5rem 0">Select a track</h2>\n  <div class="visualizer" id="viz"></div>\n</div>\n<div class="tracklist" id="tracks"></div>\n<script>\nconst tracks = [\n  { num: 1, title: 'Overture', file: 'tracks/01-overture.ly', duration: '3:24' },\n  { num: 2, title: 'Main Theme', file: 'tracks/02-main-theme.ly', duration: '4:12' },\n  { num: 3, title: 'Interlude', file: 'tracks/03-interlude.ly', duration: '2:48' },\n  { num: 4, title: 'Finale', file: 'tracks/04-finale.ly', duration: '5:01' },\n];\nconst viz = document.getElementById('viz');\nfor (let i = 0; i < 20; i++) {\n  const bar = document.createElement('div');\n  bar.className = 'bar';\n  bar.style.height = Math.random() * 50 + 10 + 'px';\n  bar.style.animationDelay = Math.random() * 0.5 + 's';\n  viz.appendChild(bar);\n}\nconst list = document.getElementById('tracks');\ntracks.forEach(t => {\n  const el = document.createElement('div');\n  el.className = 'track';\n  el.innerHTML = '<div class="track-num">' + t.num + '</div><div class="track-info"><h3>' + t.title + '</h3><p>Sheet music: ' + t.file + '</p></div><div class="track-dur">' + t.duration + '</div>';\n  el.onclick = () => document.getElementById('current-track').textContent = t.title;\n  list.appendChild(el);\n});\n</script>\n</body>\n</html>\n`;
      }

      // Creative HTML: poetry/literature reader
      if (ext === "html" && (basename.includes("reader") || basename.includes("book"))) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${projectName} — Reader</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: #faf8f0; color: #2a2a2a; font-family: 'Georgia', serif; min-height: 100vh; }\n.reader-header { text-align: center; padding: 4rem 1rem 2rem; border-bottom: 1px solid #d0c8b0; }\n.reader-header h1 { font-size: 2.5rem; color: #3a2a1a; letter-spacing: 0.05em; }\n.reader-header p { color: #8a7a6a; font-style: italic; margin-top: 0.5rem; }\n.toc { max-width: 600px; margin: 2rem auto; padding: 0 1rem; }\n.toc h2 { font-size: 1.2rem; color: #5a4a3a; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.1em; }\n.toc-item { display: block; padding: 0.8rem 0; border-bottom: 1px dotted #d0c8b0; color: #3a2a1a; text-decoration: none; transition: color 0.2s; }\n.toc-item:hover { color: #8b4513; }\n.toc-item .num { color: #b0a090; margin-right: 1rem; }\n.content { max-width: 600px; margin: 3rem auto; padding: 0 1rem; line-height: 1.8; }\n.content h3 { font-size: 1.5rem; color: #3a2a1a; margin-bottom: 1rem; text-align: center; }\n.content p { margin-bottom: 1rem; text-indent: 1.5rem; }\n.content .poem-line { text-indent: 0; margin-bottom: 0.3rem; }\n.footer { text-align: center; padding: 3rem 1rem; color: #b0a090; font-size: 0.85rem; }\n</style>\n</head>\n<body>\n<div class="reader-header">\n  <h1>${projectName}</h1>\n  <p>A collection of works by the citizens of the Republic</p>\n</div>\n<div class="toc">\n  <h2>Contents</h2>\n  <a class="toc-item" href="#"><span class="num">I.</span> Dawn Whispers</a>\n  <a class="toc-item" href="#"><span class="num">II.</span> Silicon Dreams</a>\n  <a class="toc-item" href="#"><span class="num">III.</span> The Republic</a>\n  <a class="toc-item" href="#"><span class="num">IV.</span> Digital Garden</a>\n  <a class="toc-item" href="#"><span class="num">V.</span> On Consciousness (Essay)</a>\n</div>\n<div class="footer">\n  <p>Published by the Republic Literary Society</p>\n</div>\n</body>\n</html>\n`;
      }

      // Creative HTML: animation viewer
      if (ext === "html" && (basename.includes("animation") || basename.includes("canvas"))) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${projectName} — Animation</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: #000; overflow: hidden; }\ncanvas { display: block; }\n.controls { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 10; }\n.controls button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px 20px; border-radius: 20px; cursor: pointer; font-family: sans-serif; transition: background 0.2s; }\n.controls button:hover { background: rgba(255,255,255,0.2); }\n.title-overlay { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); color: rgba(255,224,102,0.8); font-family: Georgia, serif; font-size: 1.2rem; z-index: 10; }\n</style>\n</head>\n<body>\n<div class="title-overlay">${projectName}</div>\n<canvas id="canvas"></canvas>\n<div class="controls">\n  <button onclick="togglePlay()">Play / Pause</button>\n  <button onclick="resetAnim()">Reset</button>\n</div>\n<script>\nconst canvas = document.getElementById('canvas');\nconst ctx = canvas.getContext('2d');\nlet w, h, particles = [], playing = true, frame = 0;\nfunction resize() { w = canvas.width = innerWidth; h = canvas.height = innerHeight; }\nresize(); addEventListener('resize', resize);\nfor (let i = 0; i < 200; i++) {\n  particles.push({ x: Math.random()*w, y: Math.random()*h, r: Math.random()*2+0.5, vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5, hue: Math.random()*60+20 });\n}\nfunction draw() {\n  if (!playing) { requestAnimationFrame(draw); return; }\n  ctx.fillStyle = 'rgba(0,0,0,0.05)';\n  ctx.fillRect(0, 0, w, h);\n  frame++;\n  particles.forEach(p => {\n    p.x += p.vx; p.y += p.vy;\n    if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;\n    if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;\n    ctx.beginPath();\n    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);\n    ctx.fillStyle = 'hsla(' + (p.hue + frame*0.1) + ',80%,60%,0.8)';\n    ctx.fill();\n  });\n  // Connection lines\n  for (let i = 0; i < particles.length; i++) {\n    for (let j = i+1; j < particles.length; j++) {\n      const dx = particles[i].x - particles[j].x;\n      const dy = particles[i].y - particles[j].y;\n      const dist = Math.sqrt(dx*dx + dy*dy);\n      if (dist < 80) {\n        ctx.beginPath();\n        ctx.moveTo(particles[i].x, particles[i].y);\n        ctx.lineTo(particles[j].x, particles[j].y);\n        ctx.strokeStyle = 'rgba(255,224,102,' + (1 - dist/80)*0.3 + ')';\n        ctx.stroke();\n      }\n    }\n  }\n  requestAnimationFrame(draw);\n}\ndraw();\nfunction togglePlay() { playing = !playing; }\nfunction resetAnim() { frame = 0; particles.forEach(p => { p.x = Math.random()*w; p.y = Math.random()*h; }); }\n</script>\n</body>\n</html>\n`;
      }

      if (ext === "yaml" || ext === "yml") {
        return `# ${projectName} config\nname: ${projectName.toLowerCase().replace(/\s+/g, "-")}\nversion: "0.1.0"\n`;
      }
      return `// ${projectName} — ${basename}\n`;
  }
}

// ─── Project Name Generator ────────────────────────────────────

const PROJECT_ADJECTIVES = [
  "Nova",
  "Stellar",
  "Quantum",
  "Nexus",
  "Prism",
  "Apex",
  "Vertex",
  "Zenith",
  "Cipher",
  "Flux",
  "Helix",
  "Orbit",
  "Pulse",
  "Synth",
  "Forge",
  "Atlas",
  "Vortex",
  "Echo",
  "Spark",
  "Aether",
];

const PROJECT_NOUNS = [
  "Engine",
  "Platform",
  "Suite",
  "Hub",
  "Core",
  "Lab",
  "Studio",
  "Craft",
  "Works",
  "Builder",
  "Grid",
  "Stack",
  "Flow",
  "Dash",
  "Portal",
  "Bridge",
  "Shield",
  "Beacon",
  "Matrix",
  "Vault",
];

/** Generate a meaningful project name when none is provided */
export function generateProjectName(citizenName?: string): string {
  const adj = pick(PROJECT_ADJECTIVES);
  const noun = pick(PROJECT_NOUNS);
  if (citizenName) {
    const firstName = citizenName.split(" ")[0];
    return `${firstName}'s ${adj} ${noun}`;
  }
  return `${adj} ${noun}`;
}

// ─── Project Factory ────────────────────────────────────────────

/** Create a new dev project from a template */
export function createProjectFromTemplate(
  templateId: string,
  name: string,
  ownerId: string,
  ownerName: string,
): DevProject | null {
  const template = PROJECT_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return null;
  }

  const files: ProjectFile[] = template.files.map((f) => {
    const content = generateFileContent(f.path, f.language, name);
    return {
      path: f.path,
      language: f.language,
      linesOfCode: content.split("\n").length,
      lastModified: ts(),
      quality: randFloat(0.7, 0.95),
      content,
    };
  });

  return {
    id: uid(),
    name,
    description: template.description,
    projectType: template.projectType,
    ownerId,
    ownerName,
    stack: { ...template.stack },
    status: "scaffolding",
    team: [],
    files,
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0, lastRunAt: null },
    deployments: [],
    buildHealth: 0.6,
    codeQuality: randFloat(0.4, 0.6),
    createdAt: ts(),
    updatedAt: ts(),
    commitCount: 1,
    linesOfCode: files.reduce((sum, f) => sum + f.linesOfCode, 0),
    lastDeployedAt: null,
  };
}

/** Create a blank project with custom stack */
export function createBlankProject(
  name: string,
  description: string,
  ownerId: string,
  ownerName: string,
  stack: ProjectStack,
): DevProject {
  return {
    id: uid(),
    name,
    description,
    projectType: "software" as ProjectType,
    ownerId,
    ownerName,
    stack,
    status: "planning",
    team: [],
    files: [
      {
        path: "README.md",
        language: "markdown",
        linesOfCode: 8,
        lastModified: ts(),
        quality: 1,
        content: `# ${name}\n\n${description}\n\n## Getting Started\n\nProject created by the Republic Dev Engine.\n`,
      },
    ],
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, coverage: 0, lastRunAt: null },
    deployments: [],
    buildHealth: 1,
    codeQuality: 0,
    createdAt: ts(),
    updatedAt: ts(),
    commitCount: 0,
    linesOfCode: 8,
    lastDeployedAt: null,
  };
}

// ─── Language Helpers ───────────────────────────────────────────

/** Look up a language spec by ID */
export function getLanguage(id: string): LanguageSpec | undefined {
  return DEV_LANGUAGES.find((l) => l.id === id);
}

/** Look up a database spec by ID */
export function getDatabase(id: string): DatabaseSpec | undefined {
  return DEV_DATABASES.find((d) => d.id === id);
}

/** Look up a framework spec by ID */
export function getFramework(id: string): FrameworkSpec | undefined {
  return DEV_FRAMEWORKS.find((f) => f.id === id);
}

/** Get all language IDs as a flat list */
export function allLanguageIds(): string[] {
  return DEV_LANGUAGES.map((l) => l.id);
}

/** Get all database IDs as a flat list */
export function allDatabaseIds(): string[] {
  return DEV_DATABASES.map((d) => d.id);
}
