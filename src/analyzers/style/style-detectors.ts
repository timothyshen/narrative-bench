/**
 * @input  Chapter content (HTML)
 * @output StyleIssue[] — dispatches to language-specific style rules via registry
 * @pos    lib/analyzers/style — Style issue detection dispatcher (delegates to lang modules)
 *
 * Detections:
 * - Passive voice, overused words, repetition, weak verbs (Tier 1 — via lang modules)
 * - Language-specific custom issues (particle density, AI markers, etc.)
 * Core detectors (this file):
 * - Temporal confusion, punctuation, "there is" starters, lexical illusions
 *
 * Split files (re-exported here for backwards compatibility):
 * - ./dialogue-detectors.ts: unattributed dialogue, dialogue order, adverb tags, info-dump, purposeless, verbose
 * - ./prose-detectors.ts: weasel words, clichés, monotony, paragraph wall, modifier chain, telling not showing, background overload
 * - ./pov-leak-detector.ts: POV leak (Lane C — LLM-only)
 * - ./detector-utils.ts: shared helpers (PartialIssue, stripDialogue, countSubstring, extractContext, resolveIsCJK)
 */

import type { Chapter } from "../../types.js"
import { htmlToPlainText } from "../utils.js"
import type { StyleIssue, StyleIssueType } from "./types"
import { getLanguage } from "../langs/registry"
// Re-export PartialIssue for consumers (guardian register-detectors, etc.)
export type { PartialIssue } from "./detector-utils"
import type { PartialIssue } from "./detector-utils"
import { resolveIsCJK, countSubstring, extractContext, stripDialogue } from "./detector-utils"

// ── Dialogue detectors ──
import {
  detectUnattributedDialogue,
  detectDialogueOrder,
  detectAdverbDialogueTags,
  detectInfoDumpDialogue,
  detectPurposelessDialogue,
  detectVerboseDialogue,
} from "./dialogue-detectors"

// ── Prose quality detectors ──
import {
  detectWeaselWords,
  detectCliches,
  detectSentenceMonotony,
  detectParagraphWall,
  detectModifierChain,
  detectTellingNotShowing,
  detectBackgroundOverload,
} from "./prose-detectors"

// ── POV leak detector ──
import { detectPOVLeak } from "./pov-leak-detector"

// Re-export all detectors so existing consumers don't break
export {
  detectUnattributedDialogue,
  detectDialogueOrder,
  detectAdverbDialogueTags,
  detectInfoDumpDialogue,
  detectPurposelessDialogue,
  detectVerboseDialogue,
  detectWeaselWords,
  detectCliches,
  detectSentenceMonotony,
  detectParagraphWall,
  detectModifierChain,
  detectTellingNotShowing,
  detectBackgroundOverload,
  detectPOVLeak,
}

// ══════════════════════════════════════════════════════════
// Dictionaries (all module-level constants)
// ══════════════════════════════════════════════════════════

// ── Temporal markers ──
const EN_TEMPORAL_MARKERS = [
  "yesterday", "tomorrow", "today", "tonight",
  "last night", "last week", "last month", "last year",
  "next week", "next month", "next year",
  "the next morning", "the next day", "the following day",
  "the day before", "the night before",
  "moments later", "hours later", "days later",
  "a week ago", "years ago", "long ago",
]

const ZH_TEMPORAL_MARKERS = [
  "昨天", "今天", "明天", "昨夜", "今晚", "明早",
  "上周", "下周", "上个月", "下个月", "去年", "明年",
  "第二天", "次日", "翌日", "前一天", "那天晚上",
  "几天后", "数日后", "不久后", "片刻后",
  "多年前", "很久以前", "当年",
]

// ── Introductory adverbs requiring a following comma ──
const EN_INTRODUCTORY_WORDS = [
  "However", "Therefore", "Meanwhile", "Furthermore", "Moreover",
  "Nevertheless", "Consequently", "Nonetheless", "Additionally",
  "Unfortunately", "Fortunately", "Interestingly", "Surprisingly",
  "Importantly", "Instead", "Otherwise", "Regardless", "Afterwards",
  "Similarly", "Likewise", "Accordingly", "Subsequently",
]

// ── Lexical illusion — intentional word repeats to skip ──
const INTENTIONAL_REPEATS = new Set([
  "ha", "haha", "no", "so", "bye", "tsk", "shh", "now", "there",
  "go", "very", "come", "wait", "oh", "well",
  "哈", "不", "好", "是", "来", "快", "嗯",
])

// ══════════════════════════════════════════════════════════
// Main dispatcher
// ══════════════════════════════════════════════════════════

/**
 * All Tier 2 detectors run from Tier 1 local analysis.
 * Lane C detectors (POV leak) are excluded — they only run via Tier 2 LLM deep analysis
 * because the name-frequency heuristic is too fragile without full-chapter LLM context.
 */
type DetectorFn = (text: string, locale: string) => PartialIssue[]

const TIER_2_DETECTORS: DetectorFn[] = [
  detectUnattributedDialogue,
  detectTemporalConfusion,
  // detectPOVLeak — Lane C: skipped from Tier 1 (fragile without LLM context)
  detectPunctuation,
  detectDialogueOrder,
  detectWeaselWords,
  detectCliches,
  detectThereIsStarters,
  detectLexicalIllusions,
  detectAdverbDialogueTags,
  detectInfoDumpDialogue,
  detectPurposelessDialogue,
  detectVerboseDialogue,
  detectSentenceMonotony,
  detectParagraphWall,
  detectModifierChain,
  detectTellingNotShowing,
  detectBackgroundOverload,
]

/**
 * Identify style issues in chapters.
 * Auto-detects content language and dispatches to the appropriate language module.
 *
 * @param properNouns — names to exclude from overused-word checks
 * @param locale — explicit locale override (otherwise auto-detected per chapter)
 */
export function identifyStyleIssues(chapters: Chapter[], properNouns?: Set<string>, locale?: string): StyleIssue[] {
  const issues: StyleIssue[] = []

  for (const chapter of chapters) {
    const plainContent = htmlToPlainText(chapter.content)
    const lang = getLanguage(locale ?? plainContent)
    const style = lang.style
    const i18n = lang.i18n

    // Tier 1: language-module detectors
    // Lane C detectors (passive voice, weak verbs) are skipped — they are style
    // preferences, not errors, and produce too many false positives in Tier 1.
    // They run via Tier 2 LLM deep analysis where context provides better judgment.

    for (const d of style.detectOverusedWords(plainContent, properNouns)) {
      issues.push({
        type: "overused_word",
        severity: d.count > 10 ? "high" : "medium",
        chapterId: chapter.id,
        location: i18n.overusedWordLocation(d.word, d.count),
        suggestion: i18n.overusedWordSuggestion(d.word),
      })
    }

    for (const d of style.detectRepetition(plainContent)) {
      issues.push({
        type: "repetition",
        severity: "medium",
        chapterId: chapter.id,
        location: d.location,
        suggestion: i18n.repetitionSuggestion,
      })
    }

    if (style.detectCustomIssues) {
      for (const d of style.detectCustomIssues(plainContent)) {
        issues.push({
          type: d.type as StyleIssueType,
          severity: d.severity as StyleIssue["severity"],
          location: d.location,
          suggestion: d.suggestion,
          chapterId: chapter.id,
        })
      }
    }

    // Tier 2: pattern-based detectors
    for (const detector of TIER_2_DETECTORS) {
      for (const d of detector(plainContent, lang.locale)) {
        issues.push({ ...d, chapterId: chapter.id })
      }
    }
  }

  return issues
}

// ══════════════════════════════════════════════════════════
// Tier 2 Detectors (core — kept in this file)
// ══════════════════════════════════════════════════════════

/**
 * Detect temporal marker overuse within a single chapter.
 * Flags when the same temporal marker appears 3+ times, or when
 * 5+ different temporal markers cluster in a short text.
 */
export function detectTemporalConfusion(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)
  const markers = isCJK ? ZH_TEMPORAL_MARKERS : EN_TEMPORAL_MARKERS
  const textLower = text.toLowerCase()

  const found: Array<{ marker: string; count: number }> = []

  for (const marker of markers) {
    const search = isCJK ? marker : marker.toLowerCase()
    const count = countSubstring(textLower, search)
    if (count > 0) {
      found.push({ marker, count })
    }
  }

  // Flag individual markers used 3+ times
  for (const { marker, count } of found) {
    if (count >= 3) {
      issues.push({
        type: "temporal_confusion",
        severity: count >= 5 ? "high" : "medium",
        location: `"${marker}" appears ${count} times in this chapter`,
        suggestion: isCJK
          ? `「${marker}」在本章出现 ${count} 次，考虑用具体时间或其他表达替换`
          : `"${marker}" appears ${count} times — consider varying temporal references or using specific dates`,
      })
    }
  }

  // Flag excessive temporal marker density (many different markers)
  const textLength = isCJK
    ? [...text].filter(c => /[\u4e00-\u9fff]/.test(c)).length
    : text.split(/\s+/).length
  const totalOccurrences = found.reduce((sum, f) => sum + f.count, 0)
  const markersPerThousand = (totalOccurrences / textLength) * 1000

  if (found.length >= 5 && markersPerThousand > 10) {
    const topMarkers = found
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map(f => `"${f.marker}"(${f.count})`)
      .join(", ")
    issues.push({
      type: "temporal_confusion",
      severity: "medium",
      location: `${found.length} different temporal markers: ${topMarkers}`,
      suggestion: isCJK
        ? `本章使用了 ${found.length} 种时间标记，时间线可能让读者困惑`
        : `${found.length} different temporal markers in one chapter may confuse the reader's sense of time`,
    })
  }

  return issues
}

// ══════════════════════════════════════════════════════════
// Punctuation & Comma Placement
// ══════════════════════════════════════════════════════════

/**
 * Detect punctuation ordering and comma placement issues.
 */
export function detectPunctuation(
  text: string,
  locale: string,
): PartialIssue[] {
  const isCJK = resolveIsCJK(locale, text)
  const issues = isCJK ? detectPunctuationZH(text) : detectPunctuationEN(text)
  return issues.slice(0, 8)
}

function detectPunctuationEN(text: string): PartialIssue[] {
  const issues: PartialIssue[] = []
  const narration = stripDialogue(text)

  // 1. Missing comma after introductory adverbs
  for (const word of EN_INTRODUCTORY_WORDS) {
    const pattern = new RegExp(`(?:^|[.!?]\\s+)${word}\\s+[a-z]`, "gm")
    for (const match of narration.matchAll(pattern)) {
      issues.push({
        type: "punctuation",
        severity: "low",
        location: extractContext(text, match.index!, match.index! + word.length + 30),
        suggestion: `Add a comma after "${word}" — introductory words are followed by a comma`,
      })
    }
  }

  // 2. Comma before restrictive "that"
  for (const match of text.matchAll(/\w,\s+that\s+(?!is\b|said\b|being\b)/gi)) {
    issues.push({
      type: "punctuation",
      severity: "low",
      location: extractContext(text, match.index!, match.index! + match[0].length + 20),
      suggestion: "Remove the comma before \"that\" — restrictive clauses don't use a comma",
    })
  }

  // 3. Space before punctuation
  for (const match of text.matchAll(/\w\s+([,;:!?.])\s/g)) {
    if (match[1] === "." && /\.\./.test(text.substring(match.index!, match.index! + 10))) continue
    issues.push({
      type: "punctuation",
      severity: "medium",
      location: extractContext(text, match.index!, match.index! + match[0].length + 10),
      suggestion: `Remove the space before "${match[1]}"`,
    })
  }

  // 4. Doubled punctuation
  for (const match of text.matchAll(/([,;:])\1/g)) {
    issues.push({
      type: "punctuation",
      severity: "medium",
      location: extractContext(text, match.index! - 10, match.index! + match[0].length + 10),
      suggestion: `Remove the duplicate "${match[1]}" — likely a typo`,
    })
  }

  // 5. Comma after coordinating conjunction at sentence start
  for (const match of text.matchAll(/(?:^|[.!?]\s+)(But|And|Yet|Or|So),\s/gm)) {
    issues.push({
      type: "punctuation",
      severity: "low",
      location: extractContext(text, match.index!, match.index! + match[0].length + 20),
      suggestion: `Remove the comma after "${match[1]}" — coordinating conjunctions at the start of a sentence don't take a comma`,
    })
  }

  return issues
}

function detectPunctuationZH(text: string): PartialIssue[] {
  const issues: PartialIssue[] = []
  const fullWidthMap: Record<string, string> = {
    ",": "，", ";": "；", ":": "：", "!": "！", "?": "？", ".": "。",
  }

  for (const match of text.matchAll(/([\u4e00-\u9fff\u3400-\u4dbf])([,;:!?.])/g)) {
    const charBefore = text[match.index! - 1]
    if (charBefore && /\d/.test(charBefore)) continue

    const hw = match[2]
    const fw = fullWidthMap[hw]
    if (!fw) continue

    issues.push({
      type: "punctuation",
      severity: "medium",
      location: extractContext(text, match.index!, match.index! + match[0].length + 5),
      suggestion: `使用全角标点「${fw}」替代半角「${hw}」`,
    })
  }

  return issues
}

// ══════════════════════════════════════════════════════════
// "There is/are" Starters
// ══════════════════════════════════════════════════════════

/**
 * Detect sentences starting with "There is/are/was/were" — a weak opener.
 */
export function detectThereIsStarters(
  text: string,
  locale: string,
): PartialIssue[] {
  if (resolveIsCJK(locale, text)) return []

  const narration = stripDialogue(text)

  const sentences = narration.split(/[.!?]+/).filter((s: string) => s.trim().length > 10)
  if (sentences.length < 5) return []

  const pattern = /(?:^|[.!?]\s+)(There\s+(?:is|are|was|were|had\s+been|has\s+been))\s+/gm
  const matches = [...narration.matchAll(pattern)]

  const density = matches.length / sentences.length
  if (matches.length < 3 && density < 0.1) return []

  const issues: PartialIssue[] = []
  for (const match of matches.slice(0, 3)) {
    const start = match.index! + (match[0].length - match[0].trimStart().length)
    issues.push({
      type: "there_is_starter",
      severity: "low",
      location: extractContext(narration, start, start + 60),
      suggestion: `"${match[1]}" delays the real subject — rewrite to lead with the subject and a strong verb`,
    })
  }

  return issues
}

// ══════════════════════════════════════════════════════════
// Lexical Illusions (repeated words)
// ══════════════════════════════════════════════════════════

/**
 * Detect lexical illusions — accidentally repeated words ("the the", "and and").
 */
export function detectLexicalIllusions(
  text: string,
  _locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []

  const normalized = text.replace(/\s+/g, " ")

  for (const match of normalized.matchAll(/\b(\w+)\s+\1\b/gi)) {
    const word = match[1].toLowerCase()
    if (INTENTIONAL_REPEATS.has(word)) continue
    if (word.length < 2) continue

    issues.push({
      type: "lexical_illusion",
      severity: "medium",
      location: extractContext(normalized, match.index! - 10, match.index! + match[0].length + 10),
      suggestion: `"${match[1]}" is repeated — likely a typo`,
    })
  }

  return issues.slice(0, 10)
}
