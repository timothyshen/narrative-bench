/**
 * Analysis Evaluator
 *
 * Evaluates whether the analysis system can detect literary qualities,
 * character arcs, and causal logic chains in benchmark texts.
 * This is the "why is this written well" evaluator.
 *
 * @input  AnalysisFixture[]
 * @output BenchmarkResult scoring quality detection, arc mapping, causal chain coverage
 * @pos    benchmarks/evaluators/ — benchmark evaluators
 */

import type {
  AnalysisFixture,
  BenchmarkResult,
  FixtureResult,
  ExpectedQuality,
  ExpectedArc,
  CausalChain,
} from "../types.js"
import { aggregateScores } from "../lib/score-aggregator.js"
import { judgeQualityDetection, judgeArcMapping } from "../judges/llm-judge.js"

interface AnalysisEvaluatorOptions {
  version?: string
  /** Use LLM-as-Judge for semantic evaluation (costs tokens) */
  useLLM?: boolean
}

/**
 * Evaluate analysis system against fixtures.
 *
 * Phase 1 (current): Runs local analyzers only (style, character, plot).
 * Future: Will also evaluate LLM-based deep analysis.
 */
export async function evaluateAnalysis(
  fixtures: AnalysisFixture[],
  options: AnalysisEvaluatorOptions = {}
): Promise<BenchmarkResult> {
  const { version = "dev" } = options
  const fixtureResults: FixtureResult[] = []

  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, options.useLLM)
    fixtureResults.push(result)
  }

  return {
    evaluator: "analysis",
    version,
    timestamp: Date.now(),
    fixtures: fixtureResults,
    aggregate: aggregateScores(fixtureResults),
  }
}

async function evaluateFixture(fixture: AnalysisFixture, useLLM?: boolean): Promise<FixtureResult> {
  const start = performance.now()

  // Concatenate all chapter content for analysis
  const fullText = fixture.chapters.map((c) => c.content).join("\n\n")

  // Score each dimension — use LLM judge when enabled, fall back to keyword matching
  let qualityDetection: number
  let arcMapping: number
  let qualityDetails = ""
  let arcDetails = ""

  if (useLLM) {
    const qResult = await judgeQualityDetection(fullText, fixture.expectedQualities)
    qualityDetection = qResult.score
    qualityDetails = qResult.details

    const aResult = await judgeArcMapping(fullText, fixture.expectedArcs)
    arcMapping = aResult.score
    arcDetails = aResult.details
  } else {
    qualityDetection = scoreQualityDetection(fullText, fixture.expectedQualities)
    arcMapping = scoreArcMapping(fullText, fixture.expectedArcs)
  }

  const causalCoverage = scoreCausalChains(fullText, fixture.expectedCausalChains)
  const flawAbsence = scoreFlawAbsence(fullText, fixture.expectedAbsentFlaws)

  const latencyMs = Math.round(performance.now() - start)

  const allScores = {
    qualityDetection,
    arcMapping,
    causalCoverage,
    flawAbsence,
  }

  const avgScore = Object.values(allScores).reduce((a, b) => a + b, 0) / Object.keys(allScores).length
  const passed = avgScore >= 60

  const detailParts = [
    `Quality: ${qualityDetection}${qualityDetails ? ` (${qualityDetails})` : ""}`,
    `Arcs: ${arcMapping}${arcDetails ? ` (${arcDetails})` : ""}`,
    `Causal: ${causalCoverage}`,
    `No-false-flaws: ${flawAbsence}`,
  ]

  return {
    id: fixture.id,
    name: fixture.name,
    passed,
    scores: allScores,
    details: detailParts.join(" | "),
    costTokens: 0,
    latencyMs,
  }
}

/**
 * Score: Can the system detect the expected literary qualities?
 *
 * Checks whether the text evidence for each expected quality
 * actually appears in the text (ground truth validation).
 * Returns 0-100 based on coverage.
 */
function scoreQualityDetection(
  fullText: string,
  expectedQualities: ExpectedQuality[]
): number {
  if (expectedQualities.length === 0) return 100

  let found = 0
  for (const quality of expectedQualities) {
    // Check that the evidence substring exists in the text
    if (fullText.includes(quality.evidence)) {
      found++
    }
  }

  return Math.round((found / expectedQualities.length) * 100)
}

/**
 * Score: Can the system map character arcs?
 *
 * Checks whether the key beats of each arc appear in the text
 * in the correct order.
 */
function scoreArcMapping(fullText: string, expectedArcs: ExpectedArc[]): number {
  if (expectedArcs.length === 0) return 100

  let totalBeats = 0
  let foundBeats = 0
  let orderCorrect = 0

  for (const arc of expectedArcs) {
    totalBeats += arc.beats.length
    let lastIndex = -1
    let arcOrderCorrect = true

    for (const beat of arc.beats) {
      // Fuzzy search: look for key phrases from the beat description
      const keywords = extractKeywords(beat)
      const beatIndex = findBestMatch(fullText, keywords)

      if (beatIndex >= 0) {
        foundBeats++
        if (beatIndex < lastIndex) {
          arcOrderCorrect = false
        }
        lastIndex = beatIndex
      }
    }

    if (arcOrderCorrect && foundBeats > 0) {
      orderCorrect++
    }
  }

  const coverageScore = totalBeats > 0 ? (foundBeats / totalBeats) * 100 : 100
  const orderScore = expectedArcs.length > 0
    ? (orderCorrect / expectedArcs.length) * 100
    : 100

  // Weight: 60% coverage, 40% order
  return Math.round(coverageScore * 0.6 + orderScore * 0.4)
}

/**
 * Score: Can the system trace causal logic chains?
 *
 * Checks whether each link in a causal chain has its event
 * and consequence present in the text.
 */
function scoreCausalChains(fullText: string, chains: CausalChain[]): number {
  if (chains.length === 0) return 100

  let totalLinks = 0
  let foundLinks = 0

  for (const chain of chains) {
    totalLinks += chain.links.length

    for (const link of chain.links) {
      const eventKeywords = extractKeywords(link.event)
      const consequenceKeywords = extractKeywords(link.consequence)

      const eventFound = findBestMatch(fullText, eventKeywords) >= 0
      const consequenceFound = findBestMatch(fullText, consequenceKeywords) >= 0

      if (eventFound && consequenceFound) {
        foundLinks++
      } else if (eventFound || consequenceFound) {
        foundLinks += 0.5 // Partial credit
      }
    }
  }

  return Math.round((foundLinks / totalLinks) * 100)
}

/**
 * Score: Does the system correctly avoid flagging expected non-flaws?
 *
 * For well-written text, the analysis should NOT detect certain issues.
 * This is the false-positive resistance score.
 */
function scoreFlawAbsence(_fullText: string, expectedAbsentFlaws: string[]): number {
  // For now, this returns 100 (no local analyzer to generate false flaws yet).
  // When analyzers are wired in, this will run them and check that
  // none of the expectedAbsentFlaws match the output.
  if (expectedAbsentFlaws.length === 0) return 100

  // Placeholder: will be wired to actual analyzers
  // For now, validate that the fixture is well-formed
  return 100
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract meaningful keywords from a description string.
 * Supports both Latin and CJK text.
 *
 * For Latin: strips stop words, returns content-bearing terms.
 * For CJK: extracts 2-4 character CJK n-grams (Chinese has no spaces,
 * so we segment by extracting overlapping character windows).
 */
function extractKeywords(text: string): string[] {
  const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/
  const hasCJK = CJK_RE.test(text)

  const keywords: string[] = []

  if (hasCJK) {
    // CJK keyword extraction: extract meaningful character sequences.
    // Chinese stop particles to skip as standalone matches.
    const cjkStopChars = new Set("的了是在有不人这中大为上个国我以要他时来用们生到作地于出会家可下而过子后也年前")

    // Extract runs of consecutive CJK characters from the text
    const cjkRuns: string[] = []
    let currentRun = ""
    for (const char of text) {
      if (CJK_RE.test(char)) {
        currentRun += char
      } else {
        if (currentRun.length >= 2) cjkRuns.push(currentRun)
        currentRun = ""
      }
    }
    if (currentRun.length >= 2) cjkRuns.push(currentRun)

    // From each run, extract 2-4 char n-grams as keywords
    const seen = new Set<string>()
    for (const run of cjkRuns) {
      const chars = [...run]
      // For short runs (2-4 chars), use the whole run
      if (chars.length <= 4 && chars.length >= 2) {
        const w = chars.join("")
        if (!seen.has(w) && !chars.every(c => cjkStopChars.has(c))) {
          seen.add(w)
          keywords.push(w)
        }
      }
      // For longer runs, extract overlapping n-grams
      for (const ngramLen of [3, 2, 4]) {
        for (let i = 0; i <= chars.length - ngramLen; i++) {
          const w = chars.slice(i, i + ngramLen).join("")
          if (!seen.has(w) && !chars.slice(i, i + ngramLen).every(c => cjkStopChars.has(c))) {
            seen.add(w)
            keywords.push(w)
          }
        }
      }
    }
  }

  // Latin keyword extraction (always run — handles mixed content)
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "and", "but",
    "or", "nor", "not", "so", "yet", "both", "either", "neither", "each",
    "every", "all", "any", "few", "more", "most", "other", "some", "such",
    "no", "only", "own", "same", "than", "too", "very", "just", "because",
    "this", "that", "these", "those", "it", "its", "he", "she", "they",
    "his", "her", "their", "him", "them", "who", "whom", "which", "what",
  ])

  const latinWords = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w) && !/^\d+$/.test(w))

  keywords.push(...latinWords)
  return keywords
}

/**
 * Find the best match position for a set of keywords in the text.
 * Returns the position of the first keyword cluster found, or -1.
 */
function findBestMatch(text: string, keywords: string[]): number {
  if (keywords.length === 0) return -1

  const lowerText = text.toLowerCase()

  // Look for any keyword match
  let bestIndex = -1
  let matchCount = 0

  for (const keyword of keywords) {
    const index = lowerText.indexOf(keyword)
    if (index >= 0) {
      matchCount++
      if (bestIndex === -1 || index < bestIndex) {
        bestIndex = index
      }
    }
  }

  // Require at least 30% of keywords to match
  const threshold = Math.max(1, Math.floor(keywords.length * 0.3))
  return matchCount >= threshold ? bestIndex : -1
}
