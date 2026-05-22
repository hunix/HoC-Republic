/**
 * Lightweight i18n (internationalization) module for HoC UI.
 *
 * Provides:
 * - `t(key, params?)` — translate a dot-path key with optional interpolation
 * - `setLocale(locale)` — switch the active locale (triggers callback)
 * - `getLocale()` — returns current BCP47 locale tag
 * - `getDir()` — returns "ltr" or "rtl" based on current locale
 * - `onLocaleChange(cb)` — register callback for locale switches
 */

// ─── Types ────────────────────────────────────────────────────────

export type Locale = "en" | "ar";
export type Dir = "ltr" | "rtl";

interface StringMap { [key: string]: string | StringMap; }

// ─── RTL Locales ──────────────────────────────────────────────────

const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "he", "fa", "ur"]);

// ─── State ────────────────────────────────────────────────────────

let currentLocale: Locale = "en";
let strings: StringMap = {};
const listeners: Array<(locale: Locale) => void> = [];

// ─── Locale Data ──────────────────────────────────────────────────

// Inline English strings - the default/fallback locale
import en from "../locales/en.json" with { type: "json" };

// Lazy-loaded locale bundles
const localeBundles: Record<Locale, () => Promise<{ default: StringMap }>> = {
  en: () => Promise.resolve({ default: en as StringMap }),
  ar: () => import("../locales/ar.json", { with: { type: "json" } }) as Promise<{ default: StringMap }>,
};

// ─── Core API ─────────────────────────────────────────────────────

/**
 * Translate a key. Keys use dot notation: `t("common.loading")`.
 * Supports interpolation: `t("population.showing", { count: 50, total: 200 })`
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const value = resolve(strings, key) ?? resolve(en as StringMap, key) ?? key;
  if (!params) {return value;}
  return value.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

/** Switch the active locale. Loads the bundle if needed. */
export async function setLocale(locale: Locale): Promise<void> {
  const loader = localeBundles[locale];
  if (!loader) {return;}
  const mod = await loader();
  strings = mod.default;
  currentLocale = locale;
  for (const cb of listeners) {cb(locale);}
}

/** Returns the current BCP47 locale tag. */
export function getLocale(): Locale {
  return currentLocale;
}

/** Returns "ltr" or "rtl" based on the current locale. */
export function getDir(): Dir {
  return RTL_LOCALES.has(currentLocale) ? "rtl" : "ltr";
}

/** Register a callback that fires when the locale changes. Returns unsubscribe fn. */
export function onLocaleChange(cb: (locale: Locale) => void): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) {listeners.splice(idx, 1);}
  };
}

/** Returns the list of available locales. */
export function getAvailableLocales(): Locale[] {
  return Object.keys(localeBundles) as Locale[];
}

/** Returns a display name for a locale. */
export function getLocaleDisplayName(locale: Locale): string {
  const names: Record<Locale, string> = {
    en: "English",
    ar: "العربية",
  };
  return names[locale] ?? locale;
}

// ─── Internal ─────────────────────────────────────────────────────

/** Resolve a dot-path key from a nested string map. */
function resolve(map: StringMap, key: string): string | undefined {
  const parts = key.split(".");
  let current: StringMap | string = map;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) {return undefined;}
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

// ─── Init ─────────────────────────────────────────────────────────

// Load English strings synchronously (bundled inline)
strings = en as StringMap;
