/**
 * Chapter Suspense Evaluator
 *
 * Runs the chapter classifier (suspenseLevel, suspenseThreads,
 * cliffhangerWarnings) against analysis fixtures and validates
 * structural detection quality.
 *
 * @input  AnalysisFixture[]
 * @output BenchmarkResult scoring suspense detection sanity
 * @pos    benchmarks/evaluators/ — benchmark evaluators
 */

import type {
  AnalysisFixture,
  BenchmarkResult,
  FixtureResult,
} from "../types.js"
import { aggregateScores } from "../lib/score-aggregator.js"
import { classifyChapter } from "../analyzers/chapter/chapter-classifier.js"
import { judgeSuspenseOverload } from "../judges/llm-judge.js"

interface ChapterEvaluatorOptions {
  version?: string
  /** Use LLM-as-Judge for semantic evaluation (costs tokens) */
  useLLM?: boolean
}

/**
 * Evaluate chapter classifier against analysis fixtures.
 *
 * Scoring dimensions:
 * - suspenseDetection: chapters with clear drama should have suspense > 0
 * - threadCoverage: at least some suspense thread should be non-zero
 * - classificationSanity: classifier runs without errors and produces valid types
 * - noFalseCliffhanger: literary masterworks should not trigger cliffhanger warnings
 */
export async function evaluateChapter(
  fixtures: AnalysisFixture[],
  options: ChapterEvaluatorOptions = {}
): Promise<BenchmarkResult> {
  const { version = "dev" } = options
  const fixtureResults: FixtureResult[] = []

  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, options.useLLM)
    fixtureResults.push(result)
  }

  return {
    evaluator: "chapter-suspense",
    version,
    timestamp: Date.now(),
    fixtures: fixtureResults,
    aggregate: aggregateScores(fixtureResults),
  }
}

async function evaluateFixture(fixture: AnalysisFixture, useLLM?: boolean): Promise<FixtureResult> {
  const start = performance.now()
  const locale = fixture.locale

  const classifications = fixture.chapters.map(ch => {
    try {
      return { result: classifyChapter(ch.content, locale), error: false }
    } catch {
      return { result: null, error: true }
    }
  })

  const latencyMs = Math.round(performance.now() - start)

  const totalChapters = classifications.length
  const errors = classifications.filter(c => c.error).length
  const valid = classifications.filter(c => !c.error && c.result !== null)

  // 1. Classification sanity: all chapters classified without error
  const classificationSanity = totalChapters > 0
    ? Math.round(((totalChapters - errors) / totalChapters) * 100)
    : 0

  // 2. Suspense detection: literary texts with drama should have
  //    at least some chapters with suspense > 0
  const chaptersWithSuspense = valid.filter(c => c.result!.suspenseLevel > 0).length
  const suspenseDetection = valid.length > 0
    ? Math.round((chaptersWithSuspense / valid.length) * 100)
    : 0

  // 3. Thread coverage: at least one thread category should be non-zero
  //    across the full text
  const threadTotals = { main: 0, character: 0, relationship: 0, temporal: 0 }
  for (const c of valid) {
    const threads = c.result!.suspenseThreads
    threadTotals.main += threads.main
    threadTotals.character += threads.character
    threadTotals.relationship += threads.relationship
    threadTotals.temporal += threads.temporal
  }
  const nonZeroThreads = Object.values(threadTotals).filter(v => v > 0).length
  const threadCoverage = Math.round((nonZeroThreads / 4) * 100)

  // 4. No false cliffhanger warnings: literary masterworks should not
  //    trigger structural warnings (they are well-constructed)
  const totalWarnings = valid.reduce((sum, c) => sum + c.result!.cliffhangerWarnings.length, 0)
  let noFalseCliffhanger = totalWarnings === 0 ? 100 : Math.max(0, 100 - totalWarnings * 25)

  // LLM override: if warnings exist, ask LLM to judge if they're genuine
  if (useLLM && totalWarnings > 0) {
    let genuineWarnings = 0
    for (let i = 0; i < valid.length; i++) {
      const c = valid[i]
      if (c.result!.cliffhangerWarnings.length === 0) continue
      try {
        const chapter = fixture.chapters[i]
        const judgment = await judgeSuspenseOverload(chapter.content, chapter.title)
        if (!judgment.isGenuine) genuineWarnings += c.result!.cliffhangerWarnings.length
      } catch {
        // LLM failed — keep original penalty for this chapter
        genuineWarnings += c.result!.cliffhangerWarnings.length
      }
    }
    // Only penalize warnings the LLM confirms as genuine structural issues
    noFalseCliffhanger = genuineWarnings === 0 ? 100 : Math.max(0, 100 - genuineWarnings * 25)
  }

  const allScores = {
    classificationSanity,
    suspenseDetection,
    threadCoverage,
    noFalseCliffhanger,
  }

  const avgScore = Object.values(allScores).reduce((a, b) => a + b, 0) / Object.keys(allScores).length
  const passed = avgScore >= 60

  // Build details
  const chapterTypes = valid.map(c => c.result!.chapterType)
  const suspenseLevels = valid.map(c => c.result!.suspenseLevel)
  const warningsList = valid.flatMap(c => c.result!.cliffhangerWarnings)

  const details = [
    `Types: [${chapterTypes.join(", ")}]`,
    `Suspense: [${suspenseLevels.join(", ")}]`,
    `Threads: main=${threadTotals.main} char=${threadTotals.character} rel=${threadTotals.relationship} temp=${threadTotals.temporal}`,
    warningsList.length > 0 ? `Warnings: ${warningsList.join(", ")}` : "No warnings",
  ].join(" | ")

  return {
    id: fixture.id,
    name: `[chapter] ${fixture.name}`,
    passed,
    scores: allScores,
    details,
    costTokens: 0,
    latencyMs,
  }
}
