/**
 * Plot Structure Evaluator
 *
 * Runs plot analysis detectors (act structure, foreshadowing, inciting
 * incident, midpoint) against analysis fixtures. Uses FixtureChapter
 * adapted to Chapter type for compatibility with plot analyzers.
 *
 * @input  AnalysisFixture[]
 * @output BenchmarkResult scoring structural detection quality
 * @pos    benchmarks/evaluators/ — benchmark evaluators
 */

import type {
  AnalysisFixture,
  BenchmarkResult,
  FixtureResult,
  FixtureChapter,
} from "../types.js"
import type { Chapter } from "../types.js"
import { aggregateScores } from "../lib/score-aggregator.js"
import { detectActStructure } from "../analyzers/plot/act-structure.js"
import { trackForeshadowing } from "../analyzers/plot/foreshadowing-tracker.js"
import { detectIncitingIncident, detectMidpoint } from "../analyzers/plot/incident-detector.js"
import { judgePlotStructure } from "../judges/llm-judge.js"

interface PlotEvaluatorOptions {
  version?: string
  /** Use LLM-as-Judge for semantic evaluation (costs tokens) */
  useLLM?: boolean
}

/**
 * Convert fixture chapters to the Chapter type expected by plot analyzers.
 * The key difference is `order` vs `orderIndex` and the content being
 * plain text in fixtures vs potentially HTML in the editor.
 */
function toChapters(fixtureChapters: FixtureChapter[]): Chapter[] {
  const now = Date.now()
  return fixtureChapters.map(fc => ({
    id: fc.id,
    title: fc.title,
    content: fc.content,
    wordCount: fc.content.split(/\s+/).length,
    order: fc.orderIndex,
    createdAt: now,
    updatedAt: now,
  }))
}

/**
 * Evaluate plot structure detectors against analysis fixtures.
 *
 * Scoring dimensions:
 * - actStructureDetection: can the system detect 3-act structure in well-structured stories?
 * - incitingIncidentDetection: is an inciting incident found in the first 25%?
 * - foreshadowingSanity: foreshadowing tracker runs and finds echoes in multi-chapter text
 * - executionSanity: all detectors run without error
 */
export async function evaluatePlot(
  fixtures: AnalysisFixture[],
  options: PlotEvaluatorOptions = {}
): Promise<BenchmarkResult> {
  const { version = "dev" } = options
  const fixtureResults: FixtureResult[] = []

  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture, options.useLLM)
    fixtureResults.push(result)
  }

  return {
    evaluator: "plot-structure",
    version,
    timestamp: Date.now(),
    fixtures: fixtureResults,
    aggregate: aggregateScores(fixtureResults),
  }
}

async function evaluateFixture(fixture: AnalysisFixture, useLLM?: boolean): Promise<FixtureResult> {
  const start = performance.now()

  const chapters = toChapters(fixture.chapters)
  let executionErrors = 0
  const totalDetectors = 4

  // 1. Act structure detection (always local — works well)
  let actScore = 0
  let actDetails = ""
  try {
    const actResult = detectActStructure(chapters)
    if (actResult.hasThreeActStructure) {
      actScore = actResult.assessment === "strong" ? 100 : 75
    } else if (actResult.acts.length > 0) {
      actScore = 40 // Found some structure but not full 3-act
    }
    actDetails = `acts=${actResult.acts.length} 3-act=${actResult.hasThreeActStructure} assessment=${actResult.assessment}`
  } catch {
    executionErrors++
    actDetails = "ERROR"
  }

  // 2-4. Inciting incident, midpoint, foreshadowing — LLM or local
  let incidentScore = 0
  let incidentDetails = ""
  let midpointScore = 0
  let midpointDetails = ""
  let foreshadowingScore = 0
  let foreshadowingDetails = ""

  if (useLLM) {
    // LLM-as-Judge: semantic plot structure analysis
    try {
      const llmResult = await judgePlotStructure(
        fixture.chapters.map(ch => ({ title: ch.title, content: ch.content }))
      )
      incidentScore = llmResult.incidentScore
      incidentDetails = `[LLM] ${llmResult.incidentDetails}`
      midpointScore = llmResult.midpointScore
      midpointDetails = `[LLM] ${llmResult.midpointDetails}`
      foreshadowingScore = llmResult.foreshadowingScore
      foreshadowingDetails = `[LLM] ${llmResult.foreshadowingDetails}`
    } catch (e) {
      executionErrors += 3
      const errMsg = e instanceof Error ? e.message.slice(0, 50) : "unknown"
      incidentDetails = `LLM ERROR: ${errMsg}`
      midpointDetails = `LLM ERROR: ${errMsg}`
      foreshadowingDetails = `LLM ERROR: ${errMsg}`
    }
  } else {
    // Local detection (Tier 1)
    try {
      const incident = detectIncitingIncident(chapters)
      if (incident) {
        const positionOk = incident.chapterIndex < Math.max(1, Math.ceil(chapters.length * 0.25))
        incidentScore = positionOk
          ? Math.round(incident.likelihood * 100)
          : Math.round(incident.likelihood * 50)
        incidentDetails = `ch=${incident.chapterIndex} likelihood=${incident.likelihood.toFixed(2)} signals=[${incident.signals.join(",")}]`
      } else {
        incidentScore = 30
        incidentDetails = "not found"
      }
    } catch {
      executionErrors++
      incidentDetails = "ERROR"
    }

    try {
      const midpoint = detectMidpoint(chapters)
      if (midpoint) {
        midpointScore = Math.round(midpoint.confidence * 100)
        midpointDetails = `ch=${midpoint.chapterIndex} type=${midpoint.eventType} confidence=${midpoint.confidence.toFixed(2)}`
      } else if (chapters.length < 3) {
        midpointScore = 100
        midpointDetails = "skipped (< 3 chapters)"
      } else {
        midpointScore = 30
        midpointDetails = "not found"
      }
    } catch {
      executionErrors++
      midpointDetails = "ERROR"
    }

    try {
      const echoes = trackForeshadowing(chapters)
      if (echoes.length > 0) {
        const withPayoff = echoes.filter(e => e.hasPayoff).length
        foreshadowingScore = Math.min(100, 50 + Math.round((withPayoff / echoes.length) * 50))
        foreshadowingDetails = `echoes=${echoes.length} withPayoff=${withPayoff}`
      } else if (chapters.length < 2) {
        foreshadowingScore = 100
        foreshadowingDetails = "skipped (single chapter)"
      } else {
        foreshadowingScore = 40
        foreshadowingDetails = "no echoes found"
      }
    } catch {
      executionErrors++
      foreshadowingDetails = "ERROR"
    }
  }

  const latencyMs = Math.round(performance.now() - start)

  // Execution sanity score
  const executionSanity = Math.round(((totalDetectors - executionErrors) / totalDetectors) * 100)

  const allScores = {
    actStructureDetection: actScore,
    incitingIncidentDetection: incidentScore,
    midpointDetection: midpointScore,
    foreshadowingSanity: foreshadowingScore,
    executionSanity,
  }

  const avgScore = Object.values(allScores).reduce((a, b) => a + b, 0) / Object.keys(allScores).length
  const passed = avgScore >= 50

  const details = [
    `Act: ${actDetails}`,
    `Incident: ${incidentDetails}`,
    `Midpoint: ${midpointDetails}`,
    `Foreshadowing: ${foreshadowingDetails}`,
    `Errors: ${executionErrors}/${totalDetectors}`,
  ].join(" | ")

  return {
    id: fixture.id,
    name: `[plot] ${fixture.name}`,
    passed,
    scores: allScores,
    details,
    costTokens: 0,
    latencyMs,
  }
}
