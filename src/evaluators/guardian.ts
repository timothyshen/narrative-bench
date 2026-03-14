/**
 * Guardian Evaluator
 *
 * Runs guardian analysis against fixtures and scores precision/recall.
 * Measures: precision, recall, false-positive rate, latency.
 *
 * @input  GuardianFixture[]
 * @output BenchmarkResult with per-fixture scores
 * @pos    benchmarks/evaluators/ — benchmark evaluators
 */

import type {
  GuardianFixture,
  BenchmarkResult,
  FixtureResult,
  ExpectedIssue,
} from "../types.js"
import type { GuardianIssue } from "../types.js"
import { aggregateScores } from "../lib/score-aggregator.js"

// Tier 1: quick-check (local, no LLM cost)
import { runQuickCheck } from "../analyzers/quick-rules.js"

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

  // Run Tier 1 (quick check) against each chapter
  for (const chapter of fixture.chapters) {
    const characterNames = fixture.knowledgeBase
      .filter((e) => e.type === "character")
      .map((e) => e.title)

    const issues = runQuickCheck({
      content: chapter.content,
      chapterId: chapter.id,
      characterNames,
    })
    allIssues.push(...issues)
  }

  const latencyMs = Math.round(performance.now() - start)

  // Score against expectations
  const { precision, recall, falsePositiveRate, truePositives, falsePositives, falseNegatives } =
    scoreGuardianOutput(allIssues, fixture.expectedIssues, fixture.expectedNonIssues)

  const passed =
    precision >= 0.75 &&
    falsePositiveRate <= 0.25 &&
    (fixture.expectedIssues.length === 0 || recall >= 0.60)

  const details = [
    `TP=${truePositives} FP=${falsePositives} FN=${falseNegatives}`,
    `Issues flagged: ${allIssues.length}`,
    falsePositives > 0
      ? `False positives: ${allIssues
          .filter((i) => !matchesExpected(i, fixture.expectedIssues))
          .map((i) => `"${i.title}"`)
          .join(", ")}`
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
    },
    details,
    costTokens: 0, // Tier 1 is rule-based, no LLM cost
    latencyMs,
  }
}

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
  // True positives: expected issues that were found
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
      // This is a false positive — flagged something not in expected
    }
  }

  const falsePositives = actual.length - truePositives
  const falseNegatives = expectedIssues.length - truePositives

  const precision = actual.length === 0 && expectedIssues.length === 0
    ? 1 // No issues expected, none found = perfect
    : actual.length === 0
      ? 0
      : truePositives / actual.length

  const recall = expectedIssues.length === 0
    ? 1 // No issues expected = recall is trivially 1
    : truePositives / expectedIssues.length

  const falsePositiveRate = actual.length === 0
    ? 0
    : falsePositives / actual.length

  return { precision, recall, falsePositiveRate, truePositives, falsePositives, falseNegatives }
}

function issueMatchesExpected(actual: GuardianIssue, expected: ExpectedIssue): boolean {
  // Category must match
  if (expected.category && actual.category !== expected.category) return false

  // Severity must match
  if (expected.severity && actual.severity !== expected.severity) return false

  // Description pattern: fuzzy match
  if (expected.descriptionPattern) {
    const pattern = new RegExp(expected.descriptionPattern, "i")
    const matchesTitle = pattern.test(actual.title)
    const matchesDesc = pattern.test(actual.description)
    if (!matchesTitle && !matchesDesc) return false
  }

  return true
}

function matchesExpected(issue: GuardianIssue, expectedIssues: ExpectedIssue[]): boolean {
  return expectedIssues.some((e) => issueMatchesExpected(issue, e))
}
