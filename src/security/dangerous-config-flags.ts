import type { GatewayControlUiConfig } from "../config/types.gateway.js";

// Type alias matching the OpenClaw config structure for this module.
// This keeps the function signature consistent with upstream while using HoC types.
type ConfigWithGateway = {
  gateway?: {
    controlUi?: GatewayControlUiConfig;
    hooks?: {
      gmail?: { allowUnsafeExternalContent?: boolean };
      mappings?: Array<{ allowUnsafeExternalContent?: boolean }>;
    };
  };
  hooks?: {
    gmail?: { allowUnsafeExternalContent?: boolean };
    mappings?: Array<{ allowUnsafeExternalContent?: boolean }>;
  };
  tools?: {
    exec?: {
      applyPatch?: { workspaceOnly?: boolean };
    };
  };
};

/**
 * Collects all explicitly enabled insecure or dangerous config flags.
 * Used by security audit and startup checks to warn operators about risky configuration.
 */
export function collectEnabledInsecureOrDangerousFlags(cfg: ConfigWithGateway): string[] {
  const enabledFlags: string[] = [];

  if (cfg.gateway?.controlUi?.allowInsecureAuth === true) {
    enabledFlags.push("gateway.controlUi.allowInsecureAuth=true");
  }
  if (
    (cfg.gateway?.controlUi as Record<string, unknown>)
      ?.dangerouslyAllowHostHeaderOriginFallback === true
  ) {
    enabledFlags.push("gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true");
  }
  if (cfg.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true) {
    enabledFlags.push("gateway.controlUi.dangerouslyDisableDeviceAuth=true");
  }

  // Hooks Gmail unsafe external content
  const gmailHooks =
    cfg.hooks?.gmail ?? (cfg.gateway)?.hooks?.gmail;
  if (gmailHooks?.allowUnsafeExternalContent === true) {
    enabledFlags.push("hooks.gmail.allowUnsafeExternalContent=true");
  }

  // Hooks mappings unsafe external content
  const mappings: Array<{ allowUnsafeExternalContent?: boolean }> | undefined =
    cfg.hooks?.mappings ?? (cfg.gateway)?.hooks?.mappings;
  if (Array.isArray(mappings)) {
    for (const [index, mapping] of mappings.entries()) {
      if (mapping?.allowUnsafeExternalContent === true) {
        enabledFlags.push(`hooks.mappings[${index}].allowUnsafeExternalContent=true`);
      }
    }
  }

  // applyPatch workspace restriction disabled
  if (cfg.tools?.exec?.applyPatch?.workspaceOnly === false) {
    enabledFlags.push("tools.exec.applyPatch.workspaceOnly=false");
  }

  return enabledFlags;
}
