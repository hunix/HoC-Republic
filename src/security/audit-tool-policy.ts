// Re-export tool risk constants for security audit consumers.
// Note: HoC does not have the upstream sandbox-tool-policy module; use dangerous-tools instead.
export {
  DEFAULT_GATEWAY_HTTP_TOOL_DENY,
  DANGEROUS_ACP_TOOLS,
  DANGEROUS_ACP_TOOL_NAMES,
} from "./dangerous-tools.js";
