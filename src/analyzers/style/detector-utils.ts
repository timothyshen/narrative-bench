/**
 * @input  StyleIssue type from ./types
 * @output Shared utilities for all style detectors
 * @pos    lib/analyzers/style — Common helpers extracted from style-detectors
 */

import type { StyleIssue } from "./types"
import { isCJKText } from "../langs/text-utils"

/** StyleIssue without chapterId — detectors return this, dispatcher adds chapterId. */
export type PartialIssue = Omit<StyleIssue, "chapterId">

/** Strip quoted dialogue from text so detectors only analyze narration. */
export function stripDialogue(text: string): string {
  return text.replace(/["'\u201c\u201d「」『』][^"'\u201c\u201d「」『』]*["'\u201c\u201d「」『』]/g, "")
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
