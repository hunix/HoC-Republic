import type { GatewayTlsConfig } from "../../config/types.gateway.js";
import {
    loadGatewayTlsRuntime as loadGatewayTlsRuntimeConfig, type GatewayTlsRuntime
} from "../../infra/tls/gateway.js";

export type { GatewayTlsRuntime } from "../../infra/tls/gateway.js";

export async function loadGatewayTlsRuntime(
  cfg: GatewayTlsConfig | undefined,
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void },
): Promise<GatewayTlsRuntime> {
  return await loadGatewayTlsRuntimeConfig(cfg, log);
}
