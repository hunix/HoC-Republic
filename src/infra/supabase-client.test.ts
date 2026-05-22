/**
 * Supabase Client — Tests
 *
 * Phase 32A: Validates the Supabase client singleton, config resolution,
 * dual-mode (cloud vs fallback), and diagnostics.
 */

import { describe, it, expect, beforeEach, _vi } from "vitest";
import {
  initSupabase,
  getSupabaseClient,
  isSupabaseEnabled,
  getSupabaseConfig,
  getSupabaseStatus,
  shutdownSupabase,
  resolveSupabaseConfig,
} from "../infra/supabase-client.js";

describe("supabase-client", () => {
  beforeEach(async () => {
    await shutdownSupabase();
  });

  // ─── Config Resolution ──────────────────────────────────────

  describe("resolveSupabaseConfig", () => {
    it("returns null when no config sources are available", () => {
      const original = { ...process.env };
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const result = resolveSupabaseConfig(null);
      expect(result).toBeNull();

      // Restore
      Object.assign(process.env, original);
    });

    it("resolves from explicit gateway config", () => {
      const result = resolveSupabaseConfig({
        supabase: {
          url: "https://test.supabase.co",
          anonKey: "test-anon-key",
          serviceRoleKey: "test-service-key",
        },
      });

      expect(result).toEqual({
        url: "https://test.supabase.co",
        anonKey: "test-anon-key",
        serviceRoleKey: "test-service-key",
      });
    });

    it("resolves from environment variables when config is absent", () => {
      const original = { ...process.env };
      process.env.SUPABASE_URL = "https://env.supabase.co";
      process.env.SUPABASE_ANON_KEY = "env-anon-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "env-service-key";

      const result = resolveSupabaseConfig(null);
      expect(result).toEqual({
        url: "https://env.supabase.co",
        anonKey: "env-anon-key",
        serviceRoleKey: "env-service-key",
      });

      // Restore
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      Object.assign(process.env, original);
    });

    it("prefers explicit config over env vars", () => {
      const original = { ...process.env };
      process.env.SUPABASE_URL = "https://env.supabase.co";
      process.env.SUPABASE_ANON_KEY = "env-anon-key";

      const result = resolveSupabaseConfig({
        supabase: {
          url: "https://explicit.supabase.co",
          anonKey: "explicit-anon-key",
        },
      });

      expect(result?.url).toBe("https://explicit.supabase.co");
      expect(result?.anonKey).toBe("explicit-anon-key");

      // Restore
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      Object.assign(process.env, original);
    });

    it("requires both url and anonKey", () => {
      const result = resolveSupabaseConfig({
        supabase: {
          url: "https://test.supabase.co",
          // anonKey missing
        },
      });
      expect(result).toBeNull();
    });
  });

  // ─── Initialization ─────────────────────────────────────────

  describe("initSupabase", () => {
    it("returns false when config is null", async () => {
      const ok = await initSupabase(null);
      expect(ok).toBe(false);
      expect(isSupabaseEnabled()).toBe(false);
      expect(getSupabaseClient()).toBeNull();
    });

    it("returns false when url is empty", async () => {
      const ok = await initSupabase({ url: "", anonKey: "key" });
      expect(ok).toBe(false);
    });

    it("returns false when anonKey is empty", async () => {
      const ok = await initSupabase({ url: "https://test.supabase.co", anonKey: "" });
      expect(ok).toBe(false);
    });
  });

  // ─── Diagnostics ────────────────────────────────────────────

  describe("getSupabaseStatus", () => {
    it("reports disconnected when not initialized", () => {
      const status = getSupabaseStatus();
      expect(status.connected).toBe(false);
      expect(status.url).toBeNull();
      expect(status.isServiceRole).toBe(false);
      expect(status.error).toBeNull();
    });

    it("has a valid lastCheckedAt", async () => {
      await initSupabase(null);
      const status = getSupabaseStatus();
      expect(status.lastCheckedAt).toBeTruthy();
      expect(new Date(status.lastCheckedAt).getTime()).toBeGreaterThan(0);
    });
  });

  // ─── Shutdown ───────────────────────────────────────────────

  describe("shutdownSupabase", () => {
    it("clears client state", async () => {
      await shutdownSupabase();
      expect(getSupabaseClient()).toBeNull();
      expect(isSupabaseEnabled()).toBe(false);
    });

    it("can be called multiple times safely", async () => {
      await shutdownSupabase();
      await shutdownSupabase();
      expect(getSupabaseClient()).toBeNull();
    });
  });

  // ─── Dual Mode ──────────────────────────────────────────────

  describe("dual-mode (cloud vs fallback)", () => {
    it("returns null client when not configured (enables fallback)", async () => {
      await initSupabase(null);
      const client = getSupabaseClient();
      expect(client).toBeNull();

      // Consumer pattern: check for null and fall back
      const data = client ? "cloud" : "in-memory";
      expect(data).toBe("in-memory");
    });

    it("getSupabaseConfig returns null when not configured", async () => {
      await initSupabase(null);
      expect(getSupabaseConfig()).toBeNull();
    });
  });
});
