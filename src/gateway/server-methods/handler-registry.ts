/**
 * Handler Registry — central aggregator for descriptor-mapped gateway handlers.
 *
 * As handler barrels adopt `defineHandlers()` instead of raw
 * `GatewayRequestHandlers` objects they register themselves here.
 * The registry is read by `authorizeGatewayMethod` at request time to
 * determine the handler's auth scope without consulting the flat
 * READ_METHODS / WRITE_METHODS sets.
 *
 * Migration path:
 *   1. A barrel converts one file to `defineHandlers(...)`.
 *   2. It calls `registryRegister(myDescriptors)` at module load.
 *   3. `authorizeGatewayMethod` uses the registry first, falling back to the
 *      legacy sets for still-unconverted methods. This is fully backward-compatible.
 *   4. Once all barrels are converted the legacy sets and fallback branch can
 *      be removed in a cleanup pass.
 */

import type { HandlerDescriptorMap, HandlerScope } from "./types.js";

// Global registry: method name → scope
const _registry = new Map<string, HandlerScope>();

/**
 * Register a descriptor map with the global handler registry.
 * Call this at module load time from any barrel that uses `defineHandlers()`.
 *
 * @example
 * // At the bottom of my-domain-handlers.ts:
 * registryRegister(myDomainHandlers);
 */
export function registryRegister(descriptors: HandlerDescriptorMap): void {
  for (const [method, desc] of Object.entries(descriptors)) {
    if (_registry.has(method)) {
      // Warn on duplicate registration (dev-time safety net)
      console.warn(`[handler-registry] Duplicate registration: "${method}" — keeping first`);
      continue;
    }
    _registry.set(method, desc.scope);
  }
}

/**
 * Look up the declared scope for a method.
 * Returns `undefined` if the method has not been registered via `defineHandlers()`.
 * In that case, `authorizeGatewayMethod` falls back to the legacy flat sets.
 */
export function registryLookupScope(method: string): HandlerScope | undefined {
  return _registry.get(method);
}

/** Return a snapshot of all registered methods and their scopes (for diagnostics / admin). */
export function registrySnapshot(): ReadonlyMap<string, HandlerScope> {
  return _registry;
}
