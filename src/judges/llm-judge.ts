/**
 * LLM-as-Judge for Benchmark Evaluators
 *
 * Lightweight LLM call wrapper for semantic evaluation.
 * Bypasses auth/quota — for local benchmark use only.
 *
 * @input  Text + evaluation criteria
 * @output Structured judgment (boolean/score)
 * @pos    benchmarks/lib/ — benchmark infrastructure
 */

import { generateObject } from "ai"
import { createModel } from "../lib/model-factory.js"
import { z } from "zod"
import type { LanguageModel } from "ai"

// ── Shared model instance (lazy singleton) ──

let _model: LanguageModel | null = null

function getModel(): LanguageModel {
  if (!_model) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not set — required for --llm benchmark mode")
    }
    _model = createModel()
  }
  return _model
}

/** Token usage accumulator for cost reporting */
let _totalTokens = 0
export function getTotalTokens(): number { return _totalTokens }
export function resetTokens(): void { _totalTokens = 0 }

// ══════════════════════════════════════════════════════════
// Quality Detection Judge
// ══════════════════════════════════════════════════════════

const QualityJudgmentSchema = z.object({
  qualities: z.array(z.object({
    index: z.number(),
    present: z.boolean(),
    confidence: z.number().min(0).max(1),
  })),
})

/**
 * Judge whether a text exhibits expected literary qualities.
 * Replaces keyword matching with semantic understanding.
 *
 * @returns score 0-100 (percentage of qualities found)
 */
export async function judgeQualityDetection(
  fullText: string,
  qualities: Array<{ dimension: string; quality: string; evidence: string }>,
): Promise<{ score: number; details: string }> {
  if (qualities.length === 0) return { score: 100, details: "no qualities to check" }

  // Truncate text to fit token budget (~8k tokens for text + prompt)
  const excerpt = fullText.slice(0, 16000)

  const qualityList = qualities
    .map((q, i) => `[${i}] (${q.dimension}) ${q.quality}`)
    .join("\n")

  const result = await generateObject({
    model: getModel(),
    schema: QualityJudgmentSchema,
    system: "You are a literary analysis judge. Given a text and a list of expected literary qualities, determine which qualities are present in the text. Be generous — if the text demonstrates the quality even indirectly, mark it as present.",
    prompt: `## Text (excerpt)\n${excerpt}\n\n## Expected Qualities\n${qualityList}\n\nFor each quality, judge whether it is present in the text. Return the index, present (boolean), and confidence (0-1).`,
    temperature: 0.1,
  })

  _totalTokens += result.usage?.totalTokens ?? 0

  const found = result.object.qualities.filter(q => q.present).length
  const score = Math.round((found / qualities.length) * 100)
  const missed = result.object.qualities
    .filter(q => !q.present)
    .map(q => `[${q.index}]`)
    .join(", ")

  return {
    score,
    details: `${found}/${qualities.length} qualities found${missed ? ` (missed: ${missed})` : ""}`,
  }
}

// ══════════════════════════════════════════════════════════
// Arc Mapping Judge
// ══════════════════════════════════════════════════════════

const ArcJudgmentSchema = z.object({
  arcs: z.array(z.object({
    entity: z.string(),
    beatsFound: z.number(),
    totalBeats: z.number(),
    orderCorrect: z.boolean(),
  })),
})

/**
 * Judge whether character arcs and their beats are present in the text.
 * Replaces keyword extraction with semantic arc tracing.
 */
export async function judgeArcMapping(
  fullText: string,
  arcs: Array<{ entity: string; arcType: string; beats: string[] }>,
): Promise<{ score: number; details: string }> {
  if (arcs.length === 0) return { score: 100, details: "no arcs to check" }

  const excerpt = fullText.slice(0, 16000)

  const arcList = arcs
    .map((a, i) => `Arc ${i}: ${a.entity} (${a.arcType})\nBeats:\n${a.beats.map((b, j) => `  ${j}. ${b}`).join("\n")}`)
    .join("\n\n")

  const result = await generateObject({
    model: getModel(),
    schema: ArcJudgmentSchema,
    system: "You are a literary analysis judge. Given a text and expected character arcs with their beats (turning points), determine how many beats are present in the text and whether they appear in the correct order. A beat is 'found' if the text describes or references the event/change described in the beat, even using different words.",
    prompt: `## Text (excerpt)\n${excerpt}\n\n## Expected Arcs\n${arcList}\n\nFor each arc, count how many beats are present in the text and whether they appear in chronological order.`,
    temperature: 0.1,
  })

  _totalTokens += result.usage?.totalTokens ?? 0

  let totalBeats = 0
  let foundBeats = 0
  let orderCorrect = 0

  for (const arc of result.object.arcs) {
    totalBeats += arc.totalBeats
    foundBeats += arc.beatsFound
    if (arc.orderCorrect) orderCorrect++
  }

  const coverageScore = totalBeats > 0 ? (foundBeats / totalBeats) * 100 : 100
  const orderScore = arcs.length > 0 ? (orderCorrect / arcs.length) * 100 : 100
  const score = Math.round(coverageScore * 0.6 + orderScore * 0.4)

  const arcDetails = result.object.arcs
    .map(a => `${a.entity}:${a.beatsFound}/${a.totalBeats}${a.orderCorrect ? "✓" : "✗"}`)
    .join(" ")

  return { score, details: arcDetails }
}

// ══════════════════════════════════════════════════════════
// Plot Structure Judge
// ══════════════════════════════════════════════════════════

const PlotJudgmentSchema = z.object({
  incitingIncident: z.object({
    found: z.boolean(),
    description: z.string(),
    chapterIndex: z.number(),
    confidence: z.number().min(0).max(1),
  }),
  midpoint: z.object({
    found: z.boolean(),
    description: z.string(),
    chapterIndex: z.number(),
    eventType: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  foreshadowing: z.array(z.object({
    element: z.string(),
    setupChapter: z.number(),
    payoffChapter: z.number(),
    hasPayoff: z.boolean(),
  })).max(10),
})

/**
 * Judge plot structure elements (inciting incident, midpoint, foreshadowing)
 * using LLM semantic understanding instead of signal-word matching.
 */
export async function judgePlotStructure(
  chapters: Array<{ title: string; content: string }>,
): Promise<{
  incidentScore: number
  incidentDetails: string
  midpointScore: number
  midpointDetails: string
  foreshadowingScore: number
  foreshadowingDetails: string
}> {
  // Build chapter summaries for the prompt
  const chapterSummaries = chapters
    .map((ch, i) => `[Chapter ${i}] ${ch.title}\n${ch.content.slice(0, 800)}`)
    .join("\n\n---\n\n")

  const excerpt = chapterSummaries.slice(0, 20000)

  const result = await generateObject({
    model: getModel(),
    schema: PlotJudgmentSchema,
    system: `You are a literary structure analyst. Given chapter summaries of a story (or literary analysis of a story), identify:
1. The inciting incident — the event that disrupts the status quo and launches the main conflict (should be in the first 25% of chapters)
2. The midpoint — a major revelation, betrayal, or escalation that shifts the story direction (should be around 40-60% of chapters)
3. Foreshadowing — elements introduced early that pay off later

Important: The text may be literary analysis ABOUT a story rather than the story itself. In that case, identify these elements as described in the analysis.`,
    prompt: `## Chapters\n${excerpt}\n\nTotal chapters: ${chapters.length}. Identify the inciting incident, midpoint, and any foreshadowing elements.`,
    temperature: 0.1,
  })

  _totalTokens += result.usage?.totalTokens ?? 0

  const { incitingIncident, midpoint, foreshadowing } = result.object

  // Score inciting incident
  let incidentScore = 0
  let incidentDetails = ""
  if (incitingIncident.found) {
    const positionOk = incitingIncident.chapterIndex < Math.max(1, Math.ceil(chapters.length * 0.25))
    incidentScore = positionOk
      ? Math.round(incitingIncident.confidence * 100)
      : Math.round(incitingIncident.confidence * 50)
    incidentDetails = `ch=${incitingIncident.chapterIndex} "${incitingIncident.description.slice(0, 60)}" conf=${incitingIncident.confidence.toFixed(2)}`
  } else {
    incidentScore = 30
    incidentDetails = "not found"
  }

  // Score midpoint
  let midpointScore = 0
  let midpointDetails = ""
  if (midpoint.found) {
    midpointScore = Math.round(midpoint.confidence * 100)
    midpointDetails = `ch=${midpoint.chapterIndex} type=${midpoint.eventType} conf=${midpoint.confidence.toFixed(2)}`
  } else if (chapters.length < 3) {
    midpointScore = 100
    midpointDetails = "skipped (< 3 chapters)"
  } else {
    midpointScore = 30
    midpointDetails = "not found"
  }

  // Score foreshadowing
  let foreshadowingScore = 0
  let foreshadowingDetails = ""
  if (foreshadowing.length > 0) {
    const withPayoff = foreshadowing.filter(f => f.hasPayoff).length
    foreshadowingScore = Math.min(100, 50 + Math.round((withPayoff / foreshadowing.length) * 50))
    foreshadowingDetails = `echoes=${foreshadowing.length} withPayoff=${withPayoff}`
  } else if (chapters.length < 2) {
    foreshadowingScore = 100
    foreshadowingDetails = "skipped (single chapter)"
  } else {
    foreshadowingScore = 40
    foreshadowingDetails = "no echoes found"
  }

  return {
    incidentScore, incidentDetails,
    midpointScore, midpointDetails,
    foreshadowingScore, foreshadowingDetails,
  }
}

// ══════════════════════════════════════════════════════════
// Chapter Suspense Judge
// ══════════════════════════════════════════════════════════

const SuspenseJudgmentSchema = z.object({
  isGenuinelyHighSuspense: z.boolean(),
  reasoning: z.string(),
})

/**
 * Judge whether "overloaded suspense" warnings are genuine structural
 * issues or just natural high-drama content.
 */
export async function judgeSuspenseOverload(
  chapterContent: string,
  chapterTitle: string,
): Promise<{ isGenuine: boolean; reasoning: string }> {
  const excerpt = chapterContent.slice(0, 4000)

  const result = await generateObject({
    model: getModel(),
    schema: SuspenseJudgmentSchema,
    system: "You are a literary pacing analyst. Determine whether a chapter's high suspense level is a genuine quality of the writing (natural dramatic tension) or a structural problem (forced cliffhangers, artificial tension). Literary masterworks naturally have high tension in dramatic scenes — this is NOT a flaw.",
    prompt: `## Chapter: ${chapterTitle}\n${excerpt}\n\nIs this chapter's high suspense level a natural quality of good dramatic writing, or a structural problem?`,
    temperature: 0.1,
  })

  _totalTokens += result.usage?.totalTokens ?? 0

  return {
    isGenuine: result.object.isGenuinelyHighSuspense,
    reasoning: result.object.reasoning,
  }
}
