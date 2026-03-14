/**
 * @creader/benchmark — Unified Type Definitions
 *
 * All types for fixtures, evaluators, scores, and reports.
 * Self-contained — no external dependencies.
 */

// ============================================================
// DOMAIN PRIMITIVES (inlined from host project)
// ============================================================

export type ContentType =
  | "novel"
  | "autobiography"
  | "worldbook"
  | "encyclopedia"
  | "academic"
  | "thread"

export interface Chapter {
  id: string
  title: string
  content: string
  wordCount: number
  order: number
  createdAt?: number
  updatedAt?: number
}

export type GuardianSeverity = "error" | "warning" | "info"
export type GuardianConfidence = "high" | "medium" | "low"
export type GuardianLane = "issue" | "suggestion"
export type GuardianCategory =
  | "character"
  | "plot"
  | "style"
  | "timeline"
  | "entity"
  | "worldbuilding"
  | "proofreading"

export interface GuardianIssue {
  id: string
  severity: GuardianSeverity
  category: GuardianCategory
  title: string
  description: string
  suggestion?: string
  evidence?: string[]
  chapterId?: string
  entityId?: string
  fingerprint: string
  tier: 1 | 2
  timestamp: number
  confidence: GuardianConfidence
  detector: string
  lane: GuardianLane
  textPosition?: { start: number; end: number }
}

// ============================================================
// UNIFIED RESULT FORMAT
// ============================================================

export interface BenchmarkResult {
  evaluator: EvaluatorType
  version: string
  timestamp: number
  fixtures: FixtureResult[]
  aggregate: AggregateScore
}

export type EvaluatorType =
  | "guardian"
  | "inline-writing"
  | "extraction"
  | "context-retrieval"
  | "analysis"
  | "style-prose"
  | "chapter-suspense"
  | "plot-structure"

export interface FixtureResult {
  id: string
  name: string
  passed: boolean
  scores: Record<string, number>
  details: string
  costTokens: number
  latencyMs: number
}

export interface AggregateScore {
  overallScore: number
  passRate: number
  avgLatencyMs: number
  totalCostTokens: number
  regressions: string[]
}

// ============================================================
// GUARDIAN FIXTURES
// ============================================================

export interface GuardianFixture {
  id: string
  name: string
  description: string
  locale: "en" | "zh"
  contentType: ContentType
  chapters: FixtureChapter[]
  knowledgeBase: FixtureKBEntry[]
  expectedIssues: ExpectedIssue[]
  expectedNonIssues: string[]
  tags: string[]
}

export interface ExpectedIssue {
  category: string
  severity: "error" | "warning" | "info"
  descriptionPattern: string
}

// ============================================================
// EXTRACTION FIXTURES
// ============================================================

export interface ExtractionFixture {
  id: string
  name: string
  description: string
  locale: "en" | "zh"
  contentType: ContentType
  chapter: FixtureChapter
  existingKB: FixtureKBEntry[]
  expectedEntities: ExpectedEntity[]
  expectedAbsent: string[]
  tags: string[]
}

export interface ExpectedEntity {
  type: "character" | "location" | "event" | "relationship" | "worldbuilding"
  name: string
  shouldMatchExisting?: string
}

// ============================================================
// ANALYSIS FIXTURES
// ============================================================

export interface AnalysisFixture {
  id: string
  name: string
  description: string
  locale: "en" | "zh"
  contentType: ContentType
  chapters: FixtureChapter[]
  knowledgeBase: FixtureKBEntry[]
  expectedQualities: ExpectedQuality[]
  expectedAbsentFlaws: string[]
  expectedArcs: ExpectedArc[]
  expectedCausalChains: CausalChain[]
  tags: string[]
}

export interface ExpectedQuality {
  dimension: "character" | "plot" | "style" | "theme" | "structure" | "dialogue"
  quality: string
  evidence: string
}

export interface ExpectedArc {
  entity: string
  arcType: "rise" | "fall" | "rise-fall" | "fall-rise" | "flat" | "circular"
  beats: string[]
}

export interface CausalChain {
  label: string
  links: CausalLink[]
}

export interface CausalLink {
  event: string
  chapter?: string
  consequence: string
}

// ============================================================
// CONTEXT RETRIEVAL FIXTURES
// ============================================================

export interface ContextRetrievalFixture {
  id: string
  name: string
  description: string
  locale: "en" | "zh"
  query: string
  intent: string
  availableChunks: FixtureChunk[]
  expectedRetrievedIds: string[]
  expectedAbsentIds: string[]
  tags: string[]
}

export interface FixtureChunk {
  id: string
  content: string
  metadata: Record<string, unknown>
}

// ============================================================
// SHARED FIXTURE PRIMITIVES
// ============================================================

export interface FixtureChapter {
  id: string
  title: string
  content: string
  orderIndex: number
}

export interface FixtureKBEntry {
  id: string
  title: string
  type: "character" | "location" | "event" | "worldbuilding"
  content: string
  metadata?: Record<string, unknown>
}

// ============================================================
// BASELINE & COMPARISON
// ============================================================

export interface Baseline {
  version: string
  createdAt: number
  results: BenchmarkResult[]
}

export interface RegressionReport {
  baselineVersion: string
  currentVersion: string
  regressions: {
    evaluator: EvaluatorType
    metric: string
    baselineValue: number
    currentValue: number
    delta: number
  }[]
  improvements: {
    evaluator: EvaluatorType
    metric: string
    baselineValue: number
    currentValue: number
    delta: number
  }[]
}
