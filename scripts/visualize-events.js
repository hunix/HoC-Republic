
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");

const NODES = [];

// Regex patterns
const RE_EMIT = /\.emit\(\s*['"](.+?)['"]/g;
const RE_ON = /\.on\(\s*['"](.+?)['"]/g;

function walk(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    // eslint-disable-next-line no-unused-vars
    } catch (_e) {
        return;
    }
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith(".ts")) {
            scanFile(fullPath);
        }
    }
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const relPath = path.relative(SRC_DIR, filePath).replace(/\\/g, "/");

    // Scan for emits
    let match;
    while ((match = RE_EMIT.exec(content)) !== null) {
        NODES.push({
            file: relPath,
            line: getLineNumber(content, match.index),
            event: match[1],
            type: "emit"
        });
    }

    // Scan for listeners
    while ((match = RE_ON.exec(content)) !== null) {
         NODES.push({
            file: relPath,
            line: getLineNumber(content, match.index),
            event: match[1],
            type: "listen"
        });
    }
}

function getLineNumber(content, index) {
    return content.substring(0, index).split("\n").length;
}

function generateMermaid() {
    const events = new Set(NODES.map(n => n.event));
    const lines = ["graph TD"];
    
    // Style definitions
    lines.push("classDef event fill:#f9f,stroke:#333,stroke-width:2px;");
    lines.push("classDef emitter fill:#bbf,stroke:#333,stroke-width:1px;");
    lines.push("classDef listener fill:#bfb,stroke:#333,stroke-width:1px;");

    for (const event of events) {
        const emitters = NODES.filter(n => n.event === event && n.type === "emit");
        const listeners = NODES.filter(n => n.event === event && n.type === "listen");
        
        const eventId = `E_${sanitize(event)}`;
        lines.push(`${eventId}(["${event}"])`);
        lines.push(`class ${eventId} event`);

        for (const emit of emitters) {
             const nodeId = `F_${sanitize(emit.file)}`;
             lines.push(`${nodeId}["${emit.file}"] --> |emit| ${eventId}`);
             lines.push(`class ${nodeId} emitter`);
        }

        for (const listen of listeners) {
            const nodeId = `F_${sanitize(listen.file)}`;
            lines.push(`${eventId} -.-> |listen| ${nodeId}["${listen.file}"]`);
            lines.push(`class ${nodeId} listener`);
        }
    }
    
    return lines.join("\n");
}

function sanitize(str) {
    return str.replace(/[^a-zA-Z0-9_]/g, "_");
}

console.log("Scanning src/ for events...");
walk(SRC_DIR);
console.log(`Found ${NODES.length} event references.`);

const mermaid = generateMermaid();
const outFile = path.join(ROOT_DIR, "events.mermaid");
fs.writeFileSync(outFile, mermaid);
console.log(`Graph written to ${outFile}`);
