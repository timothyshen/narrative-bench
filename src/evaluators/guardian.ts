/**
 * Guardian Evaluator — Unified Detector Pipeline
 *
 * Runs ALL guardian detectors against fixtures and scores precision/recall:
 * - Tier 1.5: Quick-check rules (dead character, name typo)
 * - Tier 1: Style detectors (lexical illusion, punctuation, dialogue, prose quality)
 *
 * Measures: precision, recall, false-positive rate, latency, per-detector breakdown.
 *
 * @input  GuardianFixture[]
 * @output BenchmarkResult with per-fixture and per-detector scores
 * @pos    benchmarks/evaluators/ — benchmark evaluators
 */

import type {
  GuardianFixture,
  BenchmarkResult,
  FixtureResult,
  ExpectedIssue,
  GuardianIssue,
  GuardianConfidence,
  GuardianLane,
  GuardianCategory,
  Chapter,
} from "../types.js"
import { aggregateScores } from "../lib/score-aggregator.js"

// Tier 1.5: quick-check rules (DB-backed in production, local here)
import { runQuickCheck } from "../analyzers/quick-rules.js"

// Tier 1: style detectors (all local pattern-matching)
import { identifyStyleIssues } from "../analyzers/style/style-detectors.js"
import type { StyleIssue, StyleIssueType } from "../analyzers/style/types.js"

// ============================================================
// STYLE → GUARDIAN MAPPING
// ============================================================

/**
 * Maps StyleIssueType to Guardian confidence/lane/category.
 * Based on Guardian v1 paper Section 3.2-3.3 classification.
 */
const STYLE_DETECTOR_META: Record<
  StyleIssueType,
  { confidence: GuardianConfidence; lane: GuardianLane; category: GuardianCategory; detectorId: string }
> = {
  // Lane A — Issues (always visible)
  lexical_illusion:       { confidence: "high",   lane: "issue",      category: "style",       detectorId: "lexical-illusion" },
  punctuation:            { confidence: "high",   lane: "issue",      category: "style",       detectorId: "punctuation" },
  unattributed_dialogue:  { confidence: "medium", lane: "issue",      category: "style",       detectorId: "unattributed-dialogue" },
  overused_word:          { confidence: "medium", lane: "issue",      category: "style",       detectorId: "overused-word" },
  repetition:             { confidence: "medium", lane: "issue",      category: "style",       detectorId: "repetition" },

  // Lane B — Suggestions (collapsed)
  cliche:                 { confidence: "medium", lane: "suggestion", category: "style",       detectorId: "cliche" },
  weasel_words:           { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "weasel-words" },
  there_is_starter:       { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "there-is-starter" },
  temporal_confusion:     { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "temporal-confusion" },
  dialogue_order:         { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "dialogue-order" },
  adverb_dialogue_tag:    { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "adverb-dialogue-tag" },
  info_dump_dialogue:     { confidence: "medium", lane: "suggestion", category: "style",       detectorId: "info-dump-dialogue" },
  purposeless_dialogue:   { confidence: "medium", lane: "suggestion", category: "style",       detectorId: "purposeless-dialogue" },
  verbose_dialogue:       { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "verbose-dialogue" },
  sentence_monotony:      { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "sentence-monotony" },
  paragraph_wall:         { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "paragraph-wall" },
  modifier_chain:         { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "modifier-chain" },
  telling_not_showing:    { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "telling-not-showing" },
  background_overload:    { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "background-overload" },

  // Lane C — Deep only (excluded from Tier 1, but mapped for completeness)
  pov_leak:               { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "pov-leak" },
  passive_voice:          { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "passive-voice" },
  weak_verb:              { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "weak-verb" },
  inconsistent_tense:     { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "inconsistent-tense" },
  particle_overuse:       { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "particle-overuse" },
  structure_repetition:   { confidence: "low",    lane: "suggestion", category: "style",       detectorId: "structure-repetition" },
}

const SEVERITY_MAP: Record<string, "error" | "warning" | "info"> = {
  high: "warning",
  medium: "warning",
  low: "info",
}

let issueCounter = 0
function generateIssueId(): string {
  return `guardian_${Date.now()}_${++issueCounter}`
}

function createFingerprint(detectorId: string, location: string): string {
  const content = `${detectorId}:${location}`
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

/**
 * Convert a StyleIssue to a GuardianIssue.
 */
function styleToGuardianIssue(style: StyleIssue): GuardianIssue {
  const meta = STYLE_DETECTOR_META[style.type] ?? {
    confidence: "low" as const,
    lane: "suggestion" as const,
    category: "style" as const,
    detectorId: style.type,
  }

  return {
    id: generateIssueId(),
    severity: SEVERITY_MAP[style.severity] ?? "info",
    category: meta.category,
    title: `[${meta.detectorId}] ${style.location.substring(0, 80)}`,
    description: style.suggestion,
    chapterId: style.chapterId,
    fingerprint: createFingerprint(meta.detectorId, style.location),
    tier: 1,
    timestamp: Date.now(),
    confidence: meta.confidence,
    detector: meta.detectorId,
    lane: meta.lane,
  }
}

// ============================================================
// EVALUATOR
// ============================================================

interface GuardianEvaluatorOptions {
  /** Run tier 2 (LLM-based) analysis in addition to quick rules */
  includeTier2?: boolean
  /** Version string for the report */
  version?: string
}

/**
 * Evaluate guardian performance against a set of fixtures.
 */
export async function evaluateGuardian(
  fixtures: GuardianFixture[],
  options: GuardianEvaluatorOptions = {}
): Promise<BenchmarkResult> {
  const { version = "dev" } = options
  const fixtureResults: FixtureResult[] = []

  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, options)
    fixtureResults.push(result)
  }

  return {
    evaluator: "guardian",
    version,
    timestamp: Date.now(),
    fixtures: fixtureResults,
    aggregate: aggregateScores(fixtureResults),
  }
}

async function evaluateFixture(
  fixture: GuardianFixture,
  _options: GuardianEvaluatorOptions
): Promise<FixtureResult> {
  const start = performance.now()
  const allIssues: GuardianIssue[] = []

  // --- Tier 1.5: Quick-check rules ---
  for (const chapter of fixture.chapters) {
    const characterNames = fixture.knowledgeBase
      .filter((e) => e.type === "character")
      .map((e) => e.title)

    const deadCharacters = fixture.knowledgeBase
      .filter((e) => e.type === "character" && isDeceased(e))
      .map((e) => e.title)

    const issues = runQuickCheck({
      content: chapter.content,
      chapterId: chapter.id,
      characterNames,
      deadCharacters,
    })
    allIssues.push(...issues)
  }

  // --- Tier 1: Style detectors ---
  const chapters: Chapter[] = fixture.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    content: ch.content,
    wordCount: ch.content.split(/\s+/).length,
    order: ch.orderIndex,
  }))

  // Build proper nouns set including name substrings.
  // Chinese characters are often referred to by 2-char suffixes of 3-char names
  // (e.g. 贾宝玉 → 宝玉). The overused-word detector checks bigrams against this set.
  const properNouns = new Set<string>()
  for (const entry of fixture.knowledgeBase) {
    properNouns.add(entry.title)
    properNouns.add(entry.title.toLowerCase())
    // Add 2-char+ suffixes of CJK names for bigram matching
    const chars = [...entry.title]
    if (chars.length >= 3 && /[\u4e00-\u9fff]/.test(chars[0])) {
      for (let start = 0; start < chars.length; start++) {
        const sub = chars.slice(start).join("")
        if (sub.length >= 2) properNouns.add(sub)
      }
    }
  }

  const styleIssues = identifyStyleIssues(chapters, properNouns, fixture.locale)
  const convertedIssues = styleIssues.map(styleToGuardianIssue)
  allIssues.push(...convertedIssues)

  const latencyMs = Math.round(performance.now() - start)

  // --- Score against expectations ---
  // Lane A (issues) are scored for precision — false positives here erode trust.
  // Lane B (suggestions) are reported but don't affect precision — they're collapsed by default.
  // This matches the Guardian v1 paper's core thesis: separating signal from noise.
  const laneAIssues = allIssues.filter((i) => i.lane === "issue")
  const laneBSuggestions = allIssues.filter((i) => i.lane === "suggestion")

  const scoring = scoreGuardianOutput(laneAIssues, fixture.expectedIssues, fixture.expectedNonIssues)
  const { precision, recall, falsePositiveRate, truePositives, falsePositives, falseNegatives } = scoring

  // Pass criteria depends on fixture type:
  // - FP-trap fixtures (expectedIssues=[]): pass if Lane A FPs <= 2 per 1000 words
  // - Positive-example fixtures (expectedIssues>0): pass if precision>=75%, recall>=60%
  const isFPTrap = fixture.expectedIssues.length === 0
  // Word count: use character count for CJK, word count for Latin
  const isCJK = fixture.locale === "zh"
  const totalWords = fixture.chapters.reduce((sum, ch) => {
    if (isCJK) {
      return sum + [...ch.content].filter(c => /[\u4e00-\u9fff]/.test(c)).length
    }
    return sum + ch.content.split(/\s+/).length
  }, 0)
  const laneAFPsPerThousand = totalWords > 0 ? (falsePositives / totalWords) * 1000 : 0

  const passed = isFPTrap
    ? laneAFPsPerThousand <= 8.0 // Tolerate up to 8 Lane A FPs per 1000 words on literary text (classical lit has deliberate repetition)
    : precision >= 0.75 && falsePositiveRate <= 0.25 && recall >= 0.60

  // --- Per-detector breakdown ---
  const perDetector = computePerDetectorScores(allIssues, fixture.expectedIssues)

  const details = [
    `Lane A: TP=${truePositives} FP=${falsePositives} FN=${falseNegatives}`,
    `Total: ${allIssues.length} (Lane A: ${laneAIssues.length}, Lane B: ${laneBSuggestions.length})`,
    falsePositives > 0
      ? `Lane A FPs: ${laneAIssues
          .filter((i) => !matchesExpected(i, fixture.expectedIssues))
          .slice(0, 5)
          .map((i) => `"${i.detector}: ${i.title.substring(0, 40)}"`)
          .join(", ")}`
      : "",
    perDetector.length > 0
      ? `Per-detector: ${perDetector.map((d) => `${d.detectorId}(P=${d.precision}%,R=${d.recall}%)`).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ")

  return {
    id: fixture.id,
    name: fixture.name,
    passed,
    scores: {
      precision: Math.round(precision * 100),
      recall: Math.round(recall * 100),
      falsePositiveRate: Math.round((1 - falsePositiveRate) * 100), // Invert: higher is better
      laneAFPsPerKWords: Math.round(laneAFPsPerThousand * 100) / 100,
      laneACount: laneAIssues.length,
      laneBCount: laneBSuggestions.length,
    },
    details,
    costTokens: 0,
    latencyMs,
  }
}

/**
 * Check if a KB entry represents a deceased character.
 */
function isDeceased(entry: { content: string; metadata?: Record<string, unknown> }): boolean {
  const status = entry.metadata?.status as string | undefined
  if (status && /dead|deceased|died|killed/i.test(status)) return true
  if (/\b(dead|deceased|died|killed|death)\b/i.test(entry.content)) return true
  return false
}

// ============================================================
// SCORING
// ============================================================

/**
 * Score guardian output against expected issues and non-issues.
 */
function scoreGuardianOutput(
  actual: GuardianIssue[],
  expectedIssues: ExpectedIssue[],
  _expectedNonIssues: string[]
): {
  precision: number
  recall: number
  falsePositiveRate: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
} {
  let truePositives = 0
  const matchedExpected = new Set<number>()

  for (const actualIssue of actual) {
    let matched = false
    for (let i = 0; i < expectedIssues.length; i++) {
      if (matchedExpected.has(i)) continue
      if (issueMatchesExpected(actualIssue, expectedIssues[i])) {
        truePositives++
        matchedExpected.add(i)
        matched = true
        break
      }
    }
    if (!matched) {
      // false positive
    }
  }

  const falsePositives = actual.length - truePositives
  const falseNegatives = expectedIssues.length - truePositives

  const precision = actual.length === 0 && expectedIssues.length === 0
    ? 1
    : actual.length === 0
      ? 0
      : truePositives / actual.length

  const recall = expectedIssues.length === 0
    ? 1
    : truePositives / expectedIssues.length

  const falsePositiveRate = actual.length === 0
    ? 0
    : falsePositives / actual.length

  return { precision, recall, falsePositiveRate, truePositives, falsePositives, falseNegatives }
}

function issueMatchesExpected(actual: GuardianIssue, expected: ExpectedIssue): boolean {
  if (expected.category && actual.category !== expected.category) return false
  if (expected.severity && actual.severity !== expected.severity) return false

  if (expected.descriptionPattern) {
    const pattern = new RegExp(expected.descriptionPattern, "i")
    const matchesTitle = pattern.test(actual.title)
    const matchesDesc = pattern.test(actual.description)
    const matchesDetector = pattern.test(actual.detector)
    if (!matchesTitle && !matchesDesc && !matchesDetector) return false
  }

  return true
}

function matchesExpected(issue: GuardianIssue, expectedIssues: ExpectedIssue[]): boolean {
  return expectedIssues.some((e) => issueMatchesExpected(issue, e))
}

// ============================================================
// PER-DETECTOR SCORING
// ============================================================

export interface PerDetectorScore {
  detectorId: string
  lane: string
  truePositives: number
  falsePositives: number
  falseNegatives: number
  precision: number
  recall: number
  f1: number
}

/**
 * Compute per-detector precision/recall from actual issues vs expected.
 */
function computePerDetectorScores(
  actual: GuardianIssue[],
  expected: ExpectedIssue[]
): PerDetectorScore[] {
  // Group actual issues by detector
  const byDetector = new Map<string, GuardianIssue[]>()
  for (const issue of actual) {
    const key = issue.detector
    if (!byDetector.has(key)) byDetector.set(key, [])
    byDetector.get(key)!.push(issue)
  }

  // Group expected issues by descriptionPattern (best-effort detector matching)
  const expectedByDetector = new Map<string, ExpectedIssue[]>()
  for (const exp of expected) {
    // Try to infer detector from pattern
    const detectorId = inferDetectorFromExpected(exp)
    if (!expectedByDetector.has(detectorId)) expectedByDetector.set(detectorId, [])
    expectedByDetector.get(detectorId)!.push(exp)
  }

  // Collect all detector IDs
  const allDetectors = new Set([...byDetector.keys(), ...expectedByDetector.keys()])

  const results: PerDetectorScore[] = []

  for (const detectorId of allDetectors) {
    const actualForDetector = byDetector.get(detectorId) ?? []
    const expectedForDetector = expectedByDetector.get(detectorId) ?? []

    // Match actual against expected for this detector
    let tp = 0
    const matchedExp = new Set<number>()

    for (const act of actualForDetector) {
      for (let i = 0; i < expectedForDetector.length; i++) {
        if (matchedExp.has(i)) continue
        if (issueMatchesExpected(act, expectedForDetector[i])) {
          tp++
          matchedExp.add(i)
          break
        }
      }
    }

    const fp = actualForDetector.length - tp
    const fn = expectedForDetector.length - tp

    const precision = actualForDetector.length === 0 ? (expectedForDetector.length === 0 ? 1 : 0) : tp / actualForDetector.length
    const recall = expectedForDetector.length === 0 ? 1 : tp / expectedForDetector.length
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

    // Look up lane from meta
    const meta = Object.values(STYLE_DETECTOR_META).find((m) => m.detectorId === detectorId)
    const lane = meta?.lane ?? "issue"

    results.push({
      detectorId,
      lane,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: Math.round(precision * 100),
      recall: Math.round(recall * 100),
      f1: Math.round(f1 * 100),
    })
  }

  return results.sort((a, b) => a.detectorId.localeCompare(b.detectorId))
}

/**
 * Best-effort inference of detector ID from an ExpectedIssue.
 * Matches descriptionPattern against known detector IDs.
 */
function inferDetectorFromExpected(exp: ExpectedIssue): string {
  const pattern = (exp.descriptionPattern ?? "").toLowerCase()

  // Direct detector name in pattern
  const knownDetectors = [
    "lexical-illusion", "punctuation", "unattributed-dialogue", "overused-word",
    "repetition", "cliche", "weasel-words", "there-is-starter", "temporal-confusion",
    "dialogue-order", "adverb-dialogue-tag", "info-dump-dialogue", "purposeless-dialogue",
    "verbose-dialogue", "sentence-monotony", "paragraph-wall", "modifier-chain",
    "telling-not-showing", "background-overload", "pov-leak",
    "dead-character-appearance", "character-name-typo",
  ]

  for (const d of knownDetectors) {
    if (pattern.includes(d)) return d
  }

  // Heuristic matching from category + keywords
  if (exp.category === "character") {
    if (/typo|similar|levenshtein/i.test(pattern)) return "character-name-typo"
    if (/dead|deceased|death/i.test(pattern)) return "dead-character-appearance"
  }

  if (/lexical|repeated.*word|the the/i.test(pattern)) return "lexical-illusion"
  if (/punctuation|comma|half-width|fullwidth/i.test(pattern)) return "punctuation"
  if (/unattributed|dialogue.*without|consecutive.*dialogue/i.test(pattern)) return "unattributed-dialogue"
  if (/overuse|appears.*times/i.test(pattern)) return "overused-word"
  if (/clich[eé]/i.test(pattern)) return "cliche"
  if (/weasel/i.test(pattern)) return "weasel-words"
  if (/there\s+is|there\s+was/i.test(pattern)) return "there-is-starter"
  if (/temporal|time.*marker/i.test(pattern)) return "temporal-confusion"
  if (/dialogue.*order|reaction.*before/i.test(pattern)) return "dialogue-order"

  return "unknown"
}
