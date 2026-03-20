/**
 * Prompt Regression Evaluator
 *
 * Compares a new prompt template against baseline accepted interactions.
 * Uses regex-based quality scoring to detect quality regressions.
 *
 * @input  PromptRegressionCase[] (prompt + accepted text + new text)
 * @output BenchmarkResult with per-case quality comparison
 */

import { evaluatePromptQuality } from "../analyzers/prompt-quality/evaluation.js"
import { aggregateScores } from "../lib/score-aggregator.js"
import type { BenchmarkResult, FixtureResult } from "../types.js"

export interface PromptRegressionCase {
  id: string
  prompt: string
  acceptedText: string
  newText: string
}

export interface PromptRegressionOptions {
  version?: string
  /** Quality score drop threshold to flag as regression (default: 10) */
  regressionThreshold?: number
}

/**
 * Evaluate prompt regression by comparing quality scores.
 *
 * For each case:
 * 1. Score the original accepted text (baseline quality)
 * 2. Score the new generated text (candidate quality)
 * 3. Flag regressions where candidate score drops below threshold
 */
export async function evaluatePromptRegression(
  cases: PromptRegressionCase[],
  options: PromptRegressionOptions = {}
): Promise<BenchmarkResult> {
  const { version = "dev", regressionThreshold = 10 } = options

  const fixtureResults: FixtureResult[] = []
  let totalCandidateScore = 0
  let regressionCount = 0
  const regressions: string[] = []

  for (const evalCase of cases) {
    const caseStart = Date.now()
    const evalContext = { templateId: "prompt-regression", locale: "en" as const }
    const baselineEval = await evaluatePromptQuality(evalCase.acceptedText, evalContext)
    const candidateEval = await evaluatePromptQuality(evalCase.newText, evalContext)

    const baselineScore = baselineEval.score
    const candidateScore = candidateEval.score
    const delta = candidateScore - baselineScore

    totalCandidateScore += candidateScore

    const passed = delta >= -regressionThreshold

    if (!passed) {
      regressionCount++
      regressions.push(`${evalCase.id}: ${baselineScore} → ${candidateScore}`)
    }

    fixtureResults.push({
      id: evalCase.id,
      name: evalCase.id,
      passed,
      scores: {
        baselineScore,
        candidateScore,
        delta,
      },
      details: !passed
        ? `Regression: ${baselineScore} → ${candidateScore} (delta: ${delta.toFixed(1)})`
        : `OK: ${baselineScore} → ${candidateScore}`,
      costTokens: 0,
      latencyMs: Date.now() - caseStart,
    })
  }

  return {
    evaluator: "prompt-regression",
    version,
    timestamp: Date.now(),
    aggregate: aggregateScores(fixtureResults),
    fixtures: fixtureResults,
  }
}
