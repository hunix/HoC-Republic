/**
 * Resource management utility for OpenClaw
 * Helps prevent memory leaks from timers and event listeners
 */

import type { EventEmitter } from "node:events";
import { ErrorCategory, handleError } from "./error-handler.js";

/**
 * Managed timer that automatically cleans up
 */
export class ManagedTimer {
  private timerId: NodeJS.Timeout | null = null;
  private readonly callback: () => void;
  private readonly delay: number;
  private readonly isInterval: boolean;

  constructor(callback: () => void, delay: number, isInterval = false) {
    this.callback = callback;
    this.delay = delay;
    this.isInterval = isInterval;
  }

  start(): void {
    if (this.timerId !== null) {
      return; // Already started
    }

    if (this.isInterval) {
      this.timerId = setInterval(this.callback, this.delay);
    } else {
      this.timerId = setTimeout(this.callback, this.delay);
    }
  }

  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  isActive(): boolean {
    return this.timerId !== null;
  }
}

/**
 * Resource manager for tracking and cleaning up resources
 */
export class ResourceManager {
  private timers: Set<ManagedTimer> = new Set();
  private eventListeners: Map<
    EventEmitter,
    Array<{ event: string; listener: (...args: unknown[]) => void }>
  > = new Map();
  private abortControllers: Set<AbortController> = new Set();
  private cleanupCallbacks: Set<() => void> = new Set();

  /**
   * Create a managed timeout
   */
  setTimeout(callback: () => void, delay: number): ManagedTimer {
    const timer = new ManagedTimer(callback, delay, false);
    this.timers.add(timer);
    timer.start();
    return timer;
  }

  /**
   * Create a managed interval
   */
  setInterval(callback: () => void, delay: number): ManagedTimer {
    const timer = new ManagedTimer(callback, delay, true);
    this.timers.add(timer);
    timer.start();
    return timer;
  }

  /**
   * Clear a managed timer
   */
  clearTimer(timer: ManagedTimer): void {
    timer.stop();
    this.timers.delete(timer);
  }

  /**
   * Add an event listener that will be automatically cleaned up
   */
  addEventListener<T extends EventEmitter>(
    emitter: T,
    event: string,
    listener: (...args: unknown[]) => void,
  ): void {
    emitter.on(event, listener);

    const listeners = this.eventListeners.get(emitter) || [];
    listeners.push({ event, listener });
    this.eventListeners.set(emitter, listeners);
  }

  /**
   * Remove a specific event listener
   */
  removeEventListener<T extends EventEmitter>(
    emitter: T,
    event: string,
    listener: (...args: unknown[]) => void,
  ): void {
    emitter.off(event, listener);

    const listeners = this.eventListeners.get(emitter);
    if (listeners) {
      const index = listeners.findIndex(
        (l) => l.event === event && l.listener === listener,
      );
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.eventListeners.delete(emitter);
      }
    }
  }

  /**
   * Create an AbortController that will be automatically aborted on cleanup
   */
  createAbortController(): AbortController {
    const controller = new AbortController();
    this.abortControllers.add(controller);
    return controller;
  }

  /**
   * Register a custom cleanup callback
   */
  onCleanup(callback: () => void): void {
    this.cleanupCallbacks.add(callback);
  }

  /**
   * Clean up all managed resources
   */
  cleanup(): void {
    try {
      // Clear all timers
      for (const timer of this.timers) {
        timer.stop();
      }
      this.timers.clear();

      // Remove all event listeners
      for (const [emitter, listeners] of this.eventListeners.entries()) {
        for (const { event, listener } of listeners) {
          try {
            emitter.off(event, listener);
          } catch (error) {
            handleError(error, {
              category: ErrorCategory.RESOURCE,
              component: "ResourceManager",
              operation: "removeEventListener",
              silent: true,
            });
          }
        }
      }
      this.eventListeners.clear();

      // Abort all controllers
      for (const controller of this.abortControllers) {
        try {
          controller.abort();
        } catch (error) {
          handleError(error, {
            category: ErrorCategory.RESOURCE,
            component: "ResourceManager",
            operation: "abortController",
            silent: true,
          });
        }
      }
      this.abortControllers.clear();

      // Execute cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          callback();
        } catch (error) {
          handleError(error, {
            category: ErrorCategory.RESOURCE,
            component: "ResourceManager",
            operation: "cleanupCallback",
            silent: true,
          });
        }
      }
      this.cleanupCallbacks.clear();
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.RESOURCE,
        component: "ResourceManager",
        operation: "cleanup",
      });
    }
  }

  /**
   * Get resource usage statistics
   */
  getStats(): {
    timers: number;
    eventListeners: number;
    abortControllers: number;
    cleanupCallbacks: number;
  } {
    return {
      timers: this.timers.size,
      eventListeners: Array.from(this.eventListeners.values()).reduce(
        (sum, listeners) => sum + listeners.length,
        0,
      ),
      abortControllers: this.abortControllers.size,
      cleanupCallbacks: this.cleanupCallbacks.size,
    };
  }
}

/**
 * Global resource manager instance
 * Use this for application-wide resource tracking
 */
export const globalResourceManager = new ResourceManager();

/**
 * Utility function to create a managed timeout
 */
export function managedSetTimeout(
  callback: () => void,
  delay: number,
  manager: ResourceManager = globalResourceManager,
): ManagedTimer {
  return manager.setTimeout(callback, delay);
}

/**
 * Utility function to create a managed interval
 */
export function managedSetInterval(
  callback: () => void,
  delay: number,
  manager: ResourceManager = globalResourceManager,
): ManagedTimer {
  return manager.setInterval(callback, delay);
}

/**
 * Decorator for automatic resource cleanup
 * Use with classes that need lifecycle management
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withResourceCleanup<T extends { new (...args: any[]): any }>(
  constructor: T,
): T {
  return class extends constructor {
    private __resourceManager = new ResourceManager();



    cleanup(): void {
      this.__resourceManager.cleanup();
      if ("cleanup" in constructor.prototype) {
        (constructor.prototype.cleanup as () => void).call(this);
      }
    }

    getResourceManager(): ResourceManager {
      return this.__resourceManager;
    }
  } as T;
}

/**
 * Execute a function with automatic resource cleanup
 */
export async function withResources<T>(
  fn: (manager: ResourceManager) => Promise<T>,
): Promise<T> {
  const manager = new ResourceManager();
  try {
    return await fn(manager);
  } finally {
    manager.cleanup();
  }
}
