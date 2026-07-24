/**
 * @input  StyleIssue type from ./types
 * @output Shared utilities for all style detectors
 * @pos    lib/analyzers/style — Common helpers extracted from style-detectors
 */

import type { StyleIssue } from "./types"
import { isCJKText } from "../langs/text-utils"

/** StyleIssue without chapterId — detectors return this, dispatcher adds chapterId. */
export type PartialIssue = Omit<StyleIssue, "chapterId">

// Ported from the product's detector-utils (guardian-v3 sync 2026-07): family-paired
// patterns so an ASCII apostrophe inside narration ("didn't … wasn't") can never
// bracket a phantom quote and delete the narration between two contractions.
const DIALOGUE_PATTERNS: ReadonlyArray<RegExp> = [
  /"[^"]*"/g, // ASCII double quotes
  /\u201c[^\u201c\u201d]*\u201d/g, // Smart double quotes
  /「[^「」]*」/g, // CJK corner brackets
  /『[^『』]*』/g, // CJK white corner brackets
  // Smart single quotes: \u2019 alone is an apostrophe, but \u2018 only ever opens a quote.
  /\u2018[^\u2018\u2019]*\u2019/g,
  // ASCII single quotes: only a pair whose opener/closer don't touch a letter or digit.
  /(?<![\p{L}\p{N}])'[^']*'(?![\p{L}\p{N}])/gu,
]

/** Strip quoted dialogue from text so detectors only analyze narration. */
export function stripDialogue(text: string): string {
  let result = text
  for (const pattern of DIALOGUE_PATTERNS) result = result.replace(pattern, "")
  return result
}

/** Count non-overlapping occurrences of `sub` in `text`. */
export function countSubstring(text: string, sub: string): number {
  let count = 0
  let pos = 0
  while (true) {
    const idx = text.indexOf(sub, pos)
    if (idx === -1) break
    count++
    pos = idx + sub.length
  }
  return count
}

/** Extract a context window around a match index. */
export function extractContext(text: string, start: number, end: number): string {
  return text.substring(Math.max(0, start), Math.min(text.length, end)).trim()
}

/** Resolve language branch once per detector. */
export function resolveIsCJK(locale: string, text: string): boolean {
  return locale === "zh" || isCJKText(text)
}
