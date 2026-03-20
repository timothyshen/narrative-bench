/**
 * Prompt Quality Evaluation
 *
 * Regex-based quality scoring for AI-generated narrative text.
 * Checks for AI-isms, show-don't-tell violations, and repetition.
 * No LLM cost — runs locally.
 */

import {
  AI_ISMS_EN,
  AI_ISMS_ZH,
  TELLING_PATTERNS_EN,
  TELLING_PATTERNS_ZH,
} from "./patterns.js"
import {
  escapeRegExp,
  extractSnippet,
  findRepetitions,
  calculateScore,
  generateSummary,
} from "./helpers.js"
import type { QualityIssue, QualityEvaluationResult } from "./helpers.js"

export type { QualityIssue, QualityEvaluationResult }

export async function evaluatePromptQuality(
  responseText: string,
  context: { templateId: string; locale: "en" | "zh" }
): Promise<QualityEvaluationResult> {
  const startTime = performance.now()
  const issues: QualityIssue[] = []

  if (responseText.length < 50) {
    return {
      score: 100,
      issues: [],
      summary: "Response too short for detailed evaluation",
      evaluationTimeMs: Math.round(performance.now() - startTime),
    }
  }

  const isZh = context.locale === "zh"

  // Check for AI-isms
  const aiIsms = isZh ? AI_ISMS_ZH : AI_ISMS_EN
  for (const phrase of aiIsms) {
    const regex = new RegExp(escapeRegExp(phrase), "gi")
    const matches = responseText.match(regex)
    if (matches) {
      for (const match of matches) {
        const index = responseText.toLowerCase().indexOf(match.toLowerCase())
        issues.push({
          type: "overexplanation",
          severity: "warning",
          message: `AI-ism detected: "${match}"`,
          snippet: extractSnippet(responseText, index, match.length),
          location: {
            start: index,
            end: index + match.length,
          },
          suggestion: "Consider using more natural, varied language",
        })
      }
    }
  }

  // Check for show-don't-tell violations
  const tellingPatterns = isZh ? TELLING_PATTERNS_ZH : TELLING_PATTERNS_EN
  for (const pattern of tellingPatterns) {
    const matches = responseText.matchAll(pattern)
    for (const match of matches) {
      if (match.index !== undefined) {
        issues.push({
          type: "show_dont_tell",
          severity: "suggestion",
          message: `Show, don't tell: "${match[0]}"`,
          snippet: extractSnippet(responseText, match.index, match[0].length),
          location: {
            start: match.index,
            end: match.index + match[0].length,
          },
          suggestion: "Show the emotion through actions or physical sensations instead",
        })
      }
    }
  }

  // Check for repetitive patterns
  const repetitions = findRepetitions(responseText)
  for (const rep of repetitions) {
    issues.push({
      type: "repetition",
      severity: rep.count > 3 ? "warning" : "suggestion",
      message: `Repeated phrase (${rep.count}x): "${rep.phrase}"`,
      snippet: rep.phrase,
      suggestion: "Vary the language to avoid repetition",
    })
  }

  const score = calculateScore(issues, responseText.length)
  const summary = generateSummary(issues, score)

  return {
    score,
    issues,
    summary,
    evaluationTimeMs: Math.round(performance.now() - startTime),
  }
}
