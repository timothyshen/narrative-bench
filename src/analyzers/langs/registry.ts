/**
 * @input  LanguageModule implementations
 * @output registerLanguage(), getLanguage() — the language resolution API
 * @pos    lib/analyzers/langs — central registry for all language modules
 */

import type { LanguageModule } from "./types"
import { en } from "./en"
import { zh } from "./zh"

const registry = new Map<string, LanguageModule>()

/** Register a language module */
export function registerLanguage(mod: LanguageModule): void {
  registry.set(mod.locale, mod)
}

/**
 * Resolve a LanguageModule from a locale string or by auto-detecting text.
 *
 * Priority:
 * 1. Exact locale match (e.g. "zh", "en")
 * 2. Auto-detect from text content (first module whose detect() returns true)
 * 3. Fallback to English
 */
export function getLanguage(localeOrText?: string): LanguageModule {
  if (!localeOrText) return en

  // 1. Exact locale match
  const exact = registry.get(localeOrText)
  if (exact) return exact

  // 2. Auto-detect from text
  for (const mod of registry.values()) {
    if (mod.detect(localeOrText)) return mod
  }

  // 3. Fallback
  return en
}

/** Get all registered language modules */
export function getAllLanguages(): LanguageModule[] {
  return Array.from(registry.values())
}

// ── Bootstrap built-in languages ──
registerLanguage(en)
registerLanguage(zh)
