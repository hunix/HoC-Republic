/**
 * Quantum Executor — Executes companion tool plans from QuantumIntelligence decisions.
 *
 * When the quantum bridge identifies Windows Companion gateway methods as the
 * right tools, this module actually invokes them via the CompanionBridge IPC.
 */

import { getCompanionBridge, isCompanionAvailable } from "../infra/companion-bridge.js";
import type { Decision } from "./quantum-intelligence.js";

export interface ExecutionResult {
    tool: string;
    success: boolean;
    result?: unknown;
    error?: string;
}

/**
 * Execute companion tools identified in a quantum decision.
 * Returns an array of execution results.
 */
export async function executeCompanionPlan(
    decision: Decision,
    userMessage: string,
): Promise<ExecutionResult[]> {
    // Only execute task_execution decisions
    if (decision.hypothesis.type !== "task_execution") {return [];}

    const companionSteps = decision.action.steps.filter(
        (s) => s.action === "use_tool" && (s.parameters?.toolName as string)?.startsWith("windows."),
    );
    if (companionSteps.length === 0) {return [];}

    // Check companion availability
    if (!(await isCompanionAvailable())) {
        return [{ tool: "companion", success: false, error: "Windows companion service not available" }];
    }

    const bridge = getCompanionBridge();
    await bridge.connect();

    const results: ExecutionResult[] = [];

    for (const step of companionSteps) {
        const toolName = step.parameters?.toolName as string;
        const companionCmd = toolName.replace(/^windows\./, "");

        // Extract parameters — returns null if the user didn't ask for this action
        const params = extractCompanionParams(companionCmd, userMessage);
        if (params === null) {continue;} // Skip tools the user didn't explicitly ask for

        try {
            const result = await bridge.invoke(companionCmd, params);
            results.push({ tool: toolName, success: true, result });
        } catch (err) {
            results.push({
                tool: toolName,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return results;
}

/**
 * Extract parameters for a companion command from the user's natural language.
 * Returns null if the user's message does NOT request this specific action
 * (used to filter out irrelevant matched tools).
 */
function extractCompanionParams(
    command: string,
    message: string,
): Record<string, unknown> | null {
    const msg = message.toLowerCase();

    switch (command) {
        // ── Window Management ──────────────────────────────────────
        case "window.minimize":
            return msg.includes("minimize") ? {} : null;
        case "window.maximize":
            return msg.includes("maximize") ? {} : null;
        case "window.close":
            return msg.includes("close") && (msg.includes("window") || msg.includes("app")) ? {} : null;
        case "window.list":
            return msg.includes("list") && msg.includes("window") ? {} : null;
        case "window.focus":
            return msg.includes("focus") && msg.includes("window") ? {} : null;

        // ── Mouse ──────────────────────────────────────────────────
        case "input.mouse.move": {
            if (!(msg.includes("move") && (msg.includes("mouse") || msg.includes("cursor")))) {return null;}
            const coords = message.match(/(\d+)\s*,\s*(\d+)/);
            return coords ? { x: parseInt(coords[1], 10), y: parseInt(coords[2], 10) } : null;
        }
        case "input.mouse.click": {
            if (!msg.includes("click")) {return null;}
            const button = msg.includes("right click") || msg.includes("right-click")
                ? "right"
                : msg.includes("middle click")
                    ? "middle"
                    : "left";
            return { button };
        }
        case "input.mouse.scroll": {
            if (!msg.includes("scroll")) {return null;}
            const delta = msg.includes("up") ? -120 : 120;
            return { delta };
        }

        // ── Keyboard ───────────────────────────────────────────────
        case "input.keyboard.type": {
            if (!msg.includes("type")) {return null;}
            const quoted = message.match(/"([^"]+)"|'([^']+)'/);
            return quoted ? { text: quoted[1] || quoted[2] } : null;
        }
        case "input.keyboard.combo": {
            if (!(msg.includes("press") || msg.includes("shortcut") || msg.includes("combo"))) {return null;}
            const comboPattern = message.match(/(?:press|combo|shortcut)\s+([A-Za-z]+(?:\+[A-Za-z]+)+)/i);
            if (comboPattern) {return { keys: comboPattern[1].split("+") };}
            return null;
        }
        case "input.keyboard.press": {
            if (!msg.includes("press")) {return null;}
            const keyMatch = message.match(/press\s+(?:the\s+)?([A-Za-z]+)\s+key/i);
            return keyMatch ? { key: keyMatch[1] } : null;
        }

        // ── Screen ─────────────────────────────────────────────────
        case "screen.capture":
            return msg.includes("screenshot") || msg.includes("capture screen") ? {} : null;

        // ── Audio ──────────────────────────────────────────────────
        case "audio.mute":
            return msg.includes("mute") ? {} : null;
        case "audio.unmute":
            return msg.includes("unmute") ? {} : null;
        case "audio.volume.set": {
            const volMatch = message.match(/volume\s+(?:to\s+)?(\d+)/i);
            return volMatch ? { level: parseInt(volMatch[1], 10) } : null;
        }

        // ── System ─────────────────────────────────────────────────
        case "system.shutdown":
            return msg.includes("shut down") || msg.includes("shutdown") ? {} : null;
        case "system.restart":
            return msg.includes("restart") || msg.includes("reboot") ? {} : null;
        case "system.sleep":
            return msg.includes("sleep") ? {} : null;
        case "system.hibernate":
            return msg.includes("hibernate") ? {} : null;
        case "system.lock":
            return msg.includes("lock") ? {} : null;
        case "system.logoff":
            return msg.includes("log off") || msg.includes("sign out") || msg.includes("logoff") ? {} : null;
        case "system.notification.show": {
            if (!(msg.includes("notification") || msg.includes("notify"))) {return null;}
            const notifMatch = message.match(/(?:show|display|send)\s+(?:a\s+)?notification\s*:?\s*["']?([^"'\n]+)["']?/i);
            return notifMatch ? { message: notifMatch[1].trim(), title: "OpenClaw" } : null;
        }

        // ── Clipboard ──────────────────────────────────────────────
        case "clipboard.get":
            return msg.includes("clipboard") && (msg.includes("get") || msg.includes("read") || msg.includes("paste"))
                ? {}
                : null;
        case "clipboard.set": {
            if (!(msg.includes("copy") || msg.includes("clipboard"))) {return null;}
            const clipMatch =
                message.match(/copy\s+["']([^"']+)["']/i) ||
                message.match(/clipboard\s*=\s*["']([^"']+)["']/i);
            return clipMatch ? { text: clipMatch[1] } : null;
        }

        // ── Process ────────────────────────────────────────────────
        case "process.list":
            return msg.includes("list") && msg.includes("process") ? {} : null;
        case "process.start": {
            if (!(msg.includes("open") || msg.includes("launch") || msg.includes("start")) ||
                !(msg.includes("app") || msg.includes("program") || msg.includes("application"))) {return null;}
            const appMatch = message.match(/(?:open|launch|start)\s+["']?([A-Za-z0-9. ]+)["']?/i);
            return appMatch ? { path: appMatch[1].trim() } : null;
        }
        case "process.kill": {
            if (!(msg.includes("kill") || msg.includes("terminate") || msg.includes("end"))) {return null;}
            return null; // Need PID or name — too dangerous to guess
        }

        // ── Display ────────────────────────────────────────────────
        case "hardware.display.brightness": {
            const brightMatch = message.match(/brightness\s+(?:to\s+)?(\d+)/i);
            return brightMatch ? { level: parseInt(brightMatch[1], 10) } : null;
        }

        default:
            return null; // Unknown command — don't execute
    }
}
