/**
 * Style Prose Quality Evaluator
 *
 * Runs the new Tier 2 style detectors (sentence_monotony, paragraph_wall,
 * modifier_chain, telling_not_showing, background_overload) against analysis
 * fixtures and validates that well-written literary text does NOT trigger
 * false positives, while also verifying basic sanity (detectors execute
 * without errors, return reasonable counts).
 *
 * @input  AnalysisFixture[]
 * @output BenchmarkResult scoring false-positive resistance and sanity
 * @pos    benchmarks/evaluators/ — benchmark evaluators
 */

import type {
  AnalysisFixture,
  BenchmarkResult,
  FixtureResult,
} from "../types.js"
import { aggregateScores } from "../lib/score-aggregator.js"
import {
  detectSentenceMonotony,
  detectParagraphWall,
  detectModifierChain,
  detectTellingNotShowing,
  detectBackgroundOverload,
} from "../analyzers/style/style-detectors.js"

interface StyleEvaluatorOptions {
  version?: string
}

const DETECTORS = [
  { name: "sentence_monotony", fn: detectSentenceMonotony },
  { name: "paragraph_wall", fn: detectParagraphWall },
  { name: "modifier_chain", fn: detectModifierChain },
  { name: "telling_not_showing", fn: detectTellingNotShowing },
  { name: "background_overload", fn: detectBackgroundOverload },
] as const

/**
 * Evaluate style detectors against analysis fixtures.
 *
 * Scoring dimensions:
 * - falsePositiveResistance: well-written text should produce few/no issues
 * - executionSanity: all detectors run without error and return arrays
 */
export async function evaluateStyle(
  fixtures: AnalysisFixture[],
  options: StyleEvaluatorOptions = {}
): Promise<BenchmarkResult> {
  const { version = "dev" } = options
  const fixtureResults: FixtureResult[] = []

  for (const fixture of fixtures) {
    const result = evaluateFixture(fixture)
    fixtureResults.push(result)
  }

  return {
    evaluator: "style-prose",
    version,
    timestamp: Date.now(),
    fixtures: fixtureResults,
    aggregate: aggregateScores(fixtureResults),
  }
}

function evaluateFixture(fixture: AnalysisFixture): FixtureResult {
  const start = performance.now()

  const locale = fixture.locale

  // Run each detector on each chapter and accumulate results
  const detectorCounts: Record<string, number> = {}
  let executionErrors = 0
  let totalDetectorRuns = 0

  for (const chapter of fixture.chapters) {
    const text = chapter.content

    for (const detector of DETECTORS) {
      totalDetectorRuns++
      try {
        const issues = detector.fn(text, locale)
        detectorCounts[detector.name] = (detectorCounts[detector.name] || 0) + issues.length
      } catch {
        executionErrors++
        detectorCounts[detector.name] = detectorCounts[detector.name] || 0
      }
    }
  }

  const latencyMs = Math.round(performance.now() - start)

  // --- Scoring ---

  // 1. Execution sanity: all detectors should run without error (0-100)
  const executionSanity = totalDetectorRuns > 0
    ? Math.round(((totalDetectorRuns - executionErrors) / totalDetectorRuns) * 100)
    : 0

  // 2. False-positive resistance: literary masterworks should produce
  //    very few issues. Score drops for each issue found.
  //    Allow up to 2 issues per detector before penalizing.
  const totalIssues = Object.values(detectorCounts).reduce((a, b) => a + b, 0)
  const tolerancePerDetector = 2
  const tolerance = DETECTORS.length * tolerancePerDetector * fixture.chapters.length
  const falsePositiveResistance = Math.max(
    0,
    Math.round(100 - ((Math.max(0, totalIssues - tolerance) / (tolerance || 1)) * 100))
  )

  const allScores = {
    executionSanity,
    falsePositiveResistance,
  }

  const avgScore = Object.values(allScores).reduce((a, b) => a + b, 0) / Object.keys(allScores).length
  const passed = avgScore >= 60

  // Build details string
  const countParts = DETECTORS.map(d => `${d.name}=${detectorCounts[d.name] || 0}`)
  const details = `Detections: ${countParts.join(", ")} | Errors: ${executionErrors}/${totalDetectorRuns}`

  return {
    id: fixture.id,
    name: `[style] ${fixture.name}`,
    passed,
    scores: allScores,
    details,
    costTokens: 0,
    latencyMs,
  }
}
