import { ErrorCodes, errorShape } from "../../../gateway/protocol/schema/error-codes.js";
import type { GatewayRequestHandlers } from "../types.js";
import { getLocalInstances } from "../../../republic/local-compute.js";

interface ProxyParams {
  engine: "ollama" | "lmstudio";
  system: string;
  user: string;
  options?: {
    temperature?: number;
    num_predict?: number;
    num_ctx?: number;
  };
}

/**
 * Cluster Compute Proxy
 * 
 * Securely proxies LLM inference requests from peer gateways in the local mesh
 * directly to this node's local inference engines (Ollama, LM Studio).
 */
export const computeProxyHandlers: GatewayRequestHandlers = {
  "republic.cluster.llm.proxy": async ({ params, respond }) => {
    try {
      const p = params as unknown as ProxyParams;
      if (!p.system || !p.user || !p.engine) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "engine, system, and user are required"));
        return;
      }

      if (p.engine === "ollama") {
        const OLLAMA_URL = process.env.OLLAMA_HOST || "http://localhost:11434";
        const ollamaInstance = getLocalInstances().find(
          (i) => i.type === "ollama" && i.status === "online" && i.models.length > 0,
        );
        const model = ollamaInstance?.models?.[0] ?? "llama3.2";

        const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            system: p.system,
            prompt: p.user,
            stream: false,
            format: "json",
            options: p.options ?? { temperature: 0.7, num_predict: 200, num_ctx: 2048 },
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          throw new Error(`Ollama ${resp.status}: ${errBody.slice(0, 200)}`);
        }

        const data = (await resp.json()) as { response: string };
        respond(true, { response: data.response });
        return;

      } else if (p.engine === "lmstudio") {
        const LMSTUDIO_URL = process.env.LMSTUDIO_HOST || "http://localhost:1234";
        const lmsInstance = getLocalInstances().find(
          (i) => i.type === "lmstudio" && i.status === "online" && i.models.length > 0,
        );
        const model = lmsInstance?.models?.[0] ?? "local-model";

        const resp = await fetch(`${LMSTUDIO_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: p.system },
              { role: "user", content: p.user },
            ],
            temperature: p.options?.temperature ?? 0.7,
            max_tokens: p.options?.num_predict ?? 200,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          throw new Error(`LM Studio ${resp.status}: ${errBody.slice(0, 200)}`);
        }

        const data = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
        respond(true, { response: data.choices[0]?.message?.content ?? "{}" });
        return;
      }

      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unsupported engine: ${p.engine}`));
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
