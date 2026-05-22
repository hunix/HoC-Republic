/**
 * Configuration for the Mission Control integration.
 *
 * When enabled, the gateway automatically starts Mission Control via Docker
 * Compose on boot and provisions an organization + gateway entry so that MC
 * is immediately ready to use.
 *
 * Auth is fully automatic: the gateway's own `auth.token` is reused as MC's
 * `LOCAL_AUTH_TOKEN`.  If the gateway has no token configured, one is
 * auto-generated and persisted to openclaw.json.
 */
export type MissionControlConfig = {
  /** Enable automatic Mission Control lifecycle management. Default: false */
  enabled?: boolean;

  /** Absolute path to the compose.yml (or directory containing it). Auto-detected if omitted. */
  composePath?: string;

  /** Mission Control backend port. Default: 8000 */
  apiPort?: number;

  /** Mission Control frontend port. Default: 3000 */
  frontendPort?: number;
};
