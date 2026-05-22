/**
 * Supabase Command Center — Module Entry Point
 *
 * Re-exports public API for use from gateway startup and RPC handlers.
 */
export {
  startSupabaseConnector,
  stopSupabaseConnector,
  getConnectorStatus,
  getActivityLog,
  type SupabaseConnectorOptions,
  type ConnectorStatus,
} from "./supabase-connector.js";

export { routeCommand, listSupportedMethods } from "./method-router.js";
