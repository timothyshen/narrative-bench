/**
 * Quality Evaluation Helpers
 *
 * Pure functions for regex-based quality scoring.
 */

import { MIN_PHRASE_LENGTH, REPETITION_THRESHOLD } from "./patterns.js"

// =============================================================================
// TYPES (inlined — no external dependency)
// =============================================================================

export type IssueSeverity = "critical" | "warning" | "suggestion"

export type IssueType =
  | "hallucination"
  | "inconsistency"
  | "character_voice_drift"
  | "pacing_issue"
  | "show_dont_tell"
  | "repetition"
  | "anachronism"
  | "formatting"
  | "tone_mismatch"
  | "missing_context"
  | "overexplanation"

export interface QualityIssue {
  type: IssueType
  severity: IssueSeverity
  message: string
  snippet?: string
  location?: { start: number; end: number }
  suggestion?: string
}

export interface QualityEvaluationResult {
  score: number
  issues: QualityIssue[]
  summary: string
  evaluationTimeMs: number
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function extractSnippet(text: string, index: number, matchLength: number): string {
  const contextLength = 30
  const start = Math.max(0, index - contextLength)
  const end = Math.min(text.length, index + matchLength + contextLength)

  let snippet = text.slice(start, end)
  if (start > 0) snippet = "..." + snippet
  if (end < text.length) snippet = snippet + "..."

  return snippet
}

export function findRepetitions(text: string): { phrase: string; count: number }[] {
  const words = text.toLowerCase().split(/\s+/)
  const phraseCount = new Map<string, number>()

  for (let phraseLength = 3; phraseLength <= 5; phraseLength++) {
    for (let i = 0; i <= words.length - phraseLength; i++) {
      const phrase = words.slice(i, i + phraseLength).join(" ")
      if (phrase.length >= MIN_PHRASE_LENGTH) {
        const count = phraseCount.get(phrase) ?? 0
        phraseCount.set(phrase, count + 1)
      }
    }
  }

  return Array.from(phraseCount.entries())
    .filter(([, count]) => count >= REPETITION_THRESHOLD)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

export function calculateScore(issues: QualityIssue[], textLength: number): number {
  let score = 100

  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 15
        break
      case "warning":
        score -= 5
        break
      case "suggestion":
        score -= 2
        break
    }
  }

  const expectedIssues = Math.max(1, textLength / 500)
  const issueRatio = issues.length / expectedIssues

  if (issueRatio < 1) {
    score = Math.min(100, score + (1 - issueRatio) * 10)
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function generateSummary(issues: QualityIssue[], score: number): string {
  if (issues.length === 0) {
    return "No quality issues detected. The response looks good."
  }

  const criticalCount = issues.filter((i) => i.severity === "critical").length
  const warningCount = issues.filter((i) => i.severity === "warning").length
  const suggestionCount = issues.filter((i) => i.severity === "suggestion").length

  const parts: string[] = []

  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical issue${criticalCount > 1 ? "s" : ""}`)
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`)
  }
  if (suggestionCount > 0) {
    parts.push(`${suggestionCount} suggestion${suggestionCount > 1 ? "s" : ""}`)
  }

  const issueTypes = [...new Set(issues.map((i) => i.type))]
  const typeDescription =
    issueTypes.length === 1
      ? issueTypes[0].replace(/_/g, " ")
      : `${issueTypes.length} issue types`

  return `Found ${parts.join(", ")} (${typeDescription}). Score: ${score}/100`
}
