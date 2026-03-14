/**
 * Analyze Why — Literary Quality Reverse-Engineering
 *
 * Runs all local analyzers on a fixture, collects signal data,
 * then uses LLM to synthesize a structured "Why This Is Written Well"
 * literary analysis report.
 *
 * Usage:
 *   pnpm run bench:why                              # Analyze all fixtures
 *   pnpm run bench:why -- --fixture hamlet           # Analyze specific fixture
 *   pnpm run bench:why -- --locale zh                # Output report in Chinese
 *
 * @input  CLI args, analysis fixtures
 * @output Structured literary analysis report to console + benchmarks/reports/
 * @pos    benchmarks/ — literary analysis reverse-engineering
 */

import { config } from "dotenv"
config({ path: ".env.local" })

import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { generateText } from "ai"
import { createModel } from "./lib/model-factory.js"
import { loadFixtures } from "./lib/fixture-loader.js"
import { classifyChapter } from "./analyzers/chapter/chapter-classifier.js"
import { detectActStructure } from "./analyzers/plot/act-structure.js"
import { trackForeshadowing } from "./analyzers/plot/foreshadowing-tracker.js"
import { detectIncitingIncident, detectMidpoint } from "./analyzers/plot/incident-detector.js"
import type { AnalysisFixture, FixtureChapter, Chapter } from "./types.js"
import type { ChapterClassification } from "./analyzers/chapter/types.js"

// ── CLI ──

const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

const fixtureFilter = getArg("fixture")
const outputLocale = getArg("locale") ?? "auto"

// ── Types ──

interface AnalysisSignals {
  fixture: AnalysisFixture
  chapters: ChapterSignal[]
  actStructure: ActSignal
  incitingIncident: string
  midpoint: string
  foreshadowing: string[]
  expectedQualities: string[]
  expectedArcs: string[]
  expectedCausalChains: string[]
}

interface ChapterSignal {
  title: string
  type: string
  openingTechnique: string
  suspenseLevel: number
  tensionCurve: string
  hookStrength: number
  hasClimax: boolean
  hasEndingHook: boolean
  threads: { main: number; character: number; relationship: number; temporal: number }
  warnings: string[]
}

interface ActSignal {
  hasThreeAct: boolean
  assessment: string
  acts: Array<{ type: string; startIndex: number; confidence: number }>
}

// ── Helpers ──

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

// ── Signal Collection ──

function collectSignals(fixture: AnalysisFixture): AnalysisSignals {
  const locale = fixture.locale
  const chapters = toChapters(fixture.chapters)

  // 1. Per-chapter classification
  const chapterSignals: ChapterSignal[] = fixture.chapters.map(ch => {
    try {
      const c: ChapterClassification = classifyChapter(ch.content, locale)
      return {
        title: ch.title,
        type: c.chapterType,
        openingTechnique: c.openingTechnique,
        suspenseLevel: c.suspenseLevel,
        tensionCurve: c.pacing.tensionCurve,
        hookStrength: c.structure.hookStrength,
        hasClimax: c.structure.hasClimax,
        hasEndingHook: c.structure.hasEndingHook,
        threads: c.suspenseThreads,
        warnings: c.cliffhangerWarnings,
      }
    } catch {
      return {
        title: ch.title,
        type: "unknown",
        openingTechnique: "unknown",
        suspenseLevel: 0,
        tensionCurve: "flat",
        hookStrength: 0,
        hasClimax: false,
        hasEndingHook: false,
        threads: { main: 0, character: 0, relationship: 0, temporal: 0 },
        warnings: [],
      }
    }
  })

  // 2. Act structure
  let actSignal: ActSignal
  try {
    const act = detectActStructure(chapters)
    actSignal = {
      hasThreeAct: act.hasThreeActStructure,
      assessment: act.assessment,
      acts: act.acts.map(a => ({
        type: a.actType,
        startIndex: a.startIndex,
        confidence: a.confidence,
      })),
    }
  } catch {
    actSignal = { hasThreeAct: false, assessment: "error", acts: [] }
  }

  // 3. Inciting incident
  let incidentStr = "Not detected"
  try {
    const incident = detectIncitingIncident(chapters)
    if (incident) {
      incidentStr = `Chapter ${incident.chapterIndex} "${incident.chapterTitle}" (likelihood: ${incident.likelihood.toFixed(2)}, signals: ${incident.signals.join(", ")})`
    }
  } catch { /* skip */ }

  // 4. Midpoint
  let midpointStr = "Not detected"
  try {
    const mid = detectMidpoint(chapters)
    if (mid) {
      midpointStr = `Chapter ${mid.chapterIndex} "${mid.chapterTitle}" (type: ${mid.eventType}, confidence: ${mid.confidence.toFixed(2)})`
    }
  } catch { /* skip */ }

  // 5. Foreshadowing
  let foreshadowingList: string[] = []
  try {
    const echoes = trackForeshadowing(chapters)
    foreshadowingList = echoes.map(e =>
      `"${e.element}" introduced in "${e.introChapterTitle}" → ${e.echoes.length} echo(es), payoff: ${e.hasPayoff ? "yes" : "no"}, span: ${e.gapSize} chapters`
    )
  } catch { /* skip */ }

  // 6. Fixture expected data (ground truth from human annotation)
  const expectedQualities = fixture.expectedQualities.map(q =>
    `[${q.dimension}] ${q.quality}`
  )

  const expectedArcs = fixture.expectedArcs.map(a =>
    `${a.entity} (${a.arcType}): ${a.beats.length} beats → ${a.beats.join(" → ")}`
  )

  const expectedCausalChains = fixture.expectedCausalChains.map(c =>
    `"${c.label}": ${c.links.map(l => `${l.event} → ${l.consequence}`).join("; ")}`
  )

  return {
    fixture,
    chapters: chapterSignals,
    actStructure: actSignal,
    incitingIncident: incidentStr,
    midpoint: midpointStr,
    foreshadowing: foreshadowingList,
    expectedQualities,
    expectedArcs,
    expectedCausalChains,
  }
}

// ── LLM Synthesis ──

function buildSignalReport(signals: AnalysisSignals): string {
  const { fixture, chapters, actStructure, incitingIncident, midpoint, foreshadowing, expectedQualities, expectedArcs, expectedCausalChains } = signals

  const chapterTable = chapters.map((ch, i) =>
    `  [${i}] "${ch.title}" — type: ${ch.type}, opening: ${ch.openingTechnique}, suspense: ${ch.suspenseLevel}/5, tension: ${ch.tensionCurve}, hook: ${ch.hookStrength}/100, climax: ${ch.hasClimax}, ending_hook: ${ch.hasEndingHook}${ch.warnings.length > 0 ? `, warnings: ${ch.warnings.join(",")}` : ""}`
  ).join("\n")

  const threadTotals = chapters.reduce(
    (acc, ch) => ({
      main: acc.main + ch.threads.main,
      character: acc.character + ch.threads.character,
      relationship: acc.relationship + ch.threads.relationship,
      temporal: acc.temporal + ch.threads.temporal,
    }),
    { main: 0, character: 0, relationship: 0, temporal: 0 }
  )

  return `# Signal Data for "${fixture.name}"
Locale: ${fixture.locale} | Content Type: ${fixture.contentType} | Chapters: ${chapters.length}

## Chapter-Level Analysis
${chapterTable}

## Suspense Thread Totals
Main plot: ${threadTotals.main} | Character: ${threadTotals.character} | Relationship: ${threadTotals.relationship} | Temporal: ${threadTotals.temporal}

## Macro Structure
Act Structure: ${actStructure.hasThreeAct ? "3-act" : "non-standard"} (${actStructure.assessment})
${actStructure.acts.map(a => `  Act "${a.type}" starts at chapter ${a.startIndex} (confidence: ${a.confidence.toFixed(2)})`).join("\n")}

Inciting Incident: ${incitingIncident}
Midpoint: ${midpoint}

## Foreshadowing Elements
${foreshadowing.length > 0 ? foreshadowing.map(f => `  - ${f}`).join("\n") : "  None detected by local tracker"}

## Human-Annotated Literary Qualities
${expectedQualities.map(q => `  - ${q}`).join("\n")}

## Human-Annotated Character/Entity Arcs
${expectedArcs.map(a => `  - ${a}`).join("\n")}

## Human-Annotated Causal Chains
${expectedCausalChains.map(c => `  - ${c}`).join("\n")}

## Chapter Content Summaries (first 500 chars each)
${fixture.chapters.map((ch, i) => `[${i}] "${ch.title}": ${ch.content.slice(0, 500).replace(/\n/g, " ")}`).join("\n\n")}
`
}

async function synthesizeReport(signals: AnalysisSignals): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set — required for literary analysis synthesis")
  }

  const model = createModel()
  const signalReport = buildSignalReport(signals)
  const locale = signals.fixture.locale

  const lang = outputLocale === "auto"
    ? (locale === "zh" ? "Chinese" : "English")
    : (outputLocale === "zh" ? "Chinese" : "English")

  const result = await generateText({
    model,
    system: `You are a literary critic who reads computational analysis signals and reverse-engineers WHY a text works. You must be SPECIFIC — cite chapter numbers, quote signal data, reference exact metrics. Never write generic praise.

RULES:
- Every claim must reference a specific signal (chapter index, suspense level, type classification, arc beat, etc.)
- Compare chapters to each other — find the rhythm, the contrasts, the structural design
- When you see patterns in the data (e.g., suspense 0→5→0→4), explain what the author is doing and why
- The "Expected Qualities" are human annotations — your job is to show HOW the signals prove them
- Write for a novelist who wants to steal these techniques for their own work

Write in ${lang}. Be concrete, technical, and actionable.

Sections (use these exact headers):
## 核心洞察 — 一句话说清
(What makes this work structurally unique? One paragraph max.)

## 节奏设计 — 章节级分析
(Analyze the suspense/tension/type PATTERN across chapters. What rhythm does the author use? Where are the peaks and valleys? Why?)

## 结构骨架 — 三幕与关键节点
(Act structure, inciting incident, midpoint. How does the macro structure serve the themes?)

## 悬念编织 — 线索管理
(Suspense threads: main/character/relationship/temporal distribution. How does the author juggle multiple tension types?)

## 人物弧线 — 交错与对照
(Arc analysis: which arcs mirror each other? Which are inversions? What structural purpose does each serve?)

## 因果锁链 — 必然性的构建
(Causal chains: how does the author make the ending feel inevitable while keeping it surprising?)

## 给写作者的处方
(Specific, actionable craft lessons. "If you want X effect, do Y at Z position in your structure.")`,
    prompt: signalReport,
    temperature: 0.3,
    maxOutputTokens: 4000,
  })

  return result.text
}

// ── Main ──

async function main() {
  console.log("=== Analyze Why: Literary Quality Reverse-Engineering ===\n")

  const fixtures = loadFixtures("analysis")
  const filtered = fixtureFilter
    ? fixtures.filter(f => f.id.includes(fixtureFilter) || f.name.toLowerCase().includes(fixtureFilter.toLowerCase()))
    : fixtures

  if (filtered.length === 0) {
    console.log("No matching fixtures found.")
    console.log(`Available: ${fixtures.map(f => f.id).join(", ")}`)
    process.exit(1)
  }

  const reportsDir = join(import.meta.dirname ?? __dirname, "..", "reports")
  mkdirSync(reportsDir, { recursive: true })

  for (const fixture of filtered) {
    console.log(`\n${"═".repeat(60)}`)
    console.log(`Analyzing: ${fixture.name}`)
    console.log(`${"═".repeat(60)}\n`)

    // Phase 1: Collect signals
    console.log("Phase 1: Collecting analysis signals...")
    const signals = collectSignals(fixture)

    const typeDist = signals.chapters.reduce<Record<string, number>>((acc, ch) => {
      acc[ch.type] = (acc[ch.type] || 0) + 1
      return acc
    }, {})
    console.log(`  Chapters: ${signals.chapters.length}`)
    console.log(`  Types: ${Object.entries(typeDist).map(([k, v]) => `${k}=${v}`).join(", ")}`)
    console.log(`  Act structure: ${signals.actStructure.assessment}`)
    console.log(`  Foreshadowing elements: ${signals.foreshadowing.length}`)
    console.log(`  Expected qualities: ${signals.expectedQualities.length}`)
    console.log(`  Expected arcs: ${signals.expectedArcs.length}`)
    console.log(`  Expected causal chains: ${signals.expectedCausalChains.length}`)

    // Phase 2: LLM synthesis
    console.log("\nPhase 2: Synthesizing literary analysis report...\n")
    const report = await synthesizeReport(signals)

    // Output
    console.log(report)

    // Save
    const slug = fixture.id.replace(/[^a-z0-9-]/g, "-")
    const reportPath = join(reportsDir, `why-${slug}.md`)
    writeFileSync(reportPath, `# Why This Is Written Well: ${fixture.name}\n\n${report}`)
    console.log(`\nReport saved: ${reportPath}`)
  }
}

main().catch((e) => {
  console.error("analyze-why failed:", e)
  process.exit(1)
})
