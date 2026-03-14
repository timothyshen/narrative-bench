/**
 * Inciting Incident & Midpoint Detector
 *
 * @input  Chapter[] from editor
 * @output IncitingIncident | null, Midpoint | null
 * @pos    lib/analyzers/plot — Key story beat detection
 */

import type { Chapter } from "../../types.js"
import { htmlToPlainText } from "../utils.js"
import { isCJKText } from "../langs/text-utils"
import type { IncitingIncident, Midpoint } from "./types"

// ── Disruption signals ──

const ZH_DISRUPTION: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /突然/g, label: "突然" },
  { pattern: /忽然/g, label: "忽然" },
  { pattern: /意外/g, label: "意外" },
  { pattern: /从未/g, label: "从未" },
  { pattern: /陌生人/g, label: "陌生人" },
  { pattern: /闯入/g, label: "闯入" },
  { pattern: /打破/g, label: "打破" },
  { pattern: /改变了一切/g, label: "改变了一切" },
]

const EN_DISRUPTION: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bsuddenly\b/gi, label: "suddenly" },
  { pattern: /\bunexpected\b/gi, label: "unexpected" },
  { pattern: /\bnever before\b/gi, label: "never before" },
  { pattern: /\bstranger\b/gi, label: "stranger" },
  { pattern: /\bburst in\b/gi, label: "burst in" },
  { pattern: /\bshattered\b/gi, label: "shattered" },
  { pattern: /\beverything changed\b/gi, label: "everything changed" },
]

// ── Midpoint signals ──

interface SignalCategory {
  type: Midpoint["eventType"]
  patterns: Array<{ pattern: RegExp; label: string }>
}

const ZH_MIDPOINT: SignalCategory[] = [
  {
    type: "revelation",
    patterns: [
      { pattern: /真相/g, label: "真相" },
      { pattern: /原来/g, label: "原来" },
      { pattern: /发现了/g, label: "发现了" },
      { pattern: /揭露/g, label: "揭露" },
    ],
  },
  {
    type: "betrayal",
    patterns: [
      { pattern: /背叛/g, label: "背叛" },
      { pattern: /出卖/g, label: "出卖" },
      { pattern: /叛变/g, label: "叛变" },
    ],
  },
  {
    type: "goal_reset",
    patterns: [
      { pattern: /新的目标/g, label: "新的目标" },
      { pattern: /计划改变/g, label: "计划改变" },
      { pattern: /不得不/g, label: "不得不" },
    ],
  },
  {
    type: "escalation",
    patterns: [
      { pattern: /升级/g, label: "升级" },
      { pattern: /恶化/g, label: "恶化" },
      { pattern: /更危险/g, label: "更危险" },
    ],
  },
]

const EN_MIDPOINT: SignalCategory[] = [
  {
    type: "revelation",
    patterns: [
      { pattern: /\btruth\b/gi, label: "truth" },
      { pattern: /\brealized\b/gi, label: "realized" },
      { pattern: /\bdiscovered\b/gi, label: "discovered" },
      { pattern: /\brevealed\b/gi, label: "revealed" },
    ],
  },
  {
    type: "betrayal",
    patterns: [
      { pattern: /\bbetrayed\b/gi, label: "betrayed" },
      { pattern: /\bsold out\b/gi, label: "sold out" },
      { pattern: /\bturned against\b/gi, label: "turned against" },
    ],
  },
  {
    type: "goal_reset",
    patterns: [
      { pattern: /\bnew plan\b/gi, label: "new plan" },
      { pattern: /\bchanged course\b/gi, label: "changed course" },
      { pattern: /\bhad to\b/gi, label: "had to" },
    ],
  },
  {
    type: "escalation",
    patterns: [
      { pattern: /\bescalated\b/gi, label: "escalated" },
      { pattern: /\bworsened\b/gi, label: "worsened" },
      { pattern: /\bmore dangerous\b/gi, label: "more dangerous" },
    ],
  },
]

function countSignalMatches(
  text: string,
  signals: Array<{ pattern: RegExp; label: string }>
): { score: number; matched: string[] } {
  const matched: string[] = []
  let score = 0
  for (const signal of signals) {
    signal.pattern.lastIndex = 0
    const matches = text.match(signal.pattern)
    if (matches) {
      score += matches.length
      matched.push(signal.label)
    }
  }
  return { score, matched }
}

const MIN_DISRUPTION_THRESHOLD = 1

/**
 * Detect the inciting incident in the first 25% of chapters.
 */
export function detectIncitingIncident(chapters: Chapter[]): IncitingIncident | null {
  if (chapters.length === 0) return null

  const searchEnd = Math.max(1, Math.ceil(chapters.length * 0.25))
  const searchChapters = chapters.slice(0, searchEnd)

  let bestScore = 0
  let bestIndex = -1
  let bestSignals: string[] = []

  for (let i = 0; i < searchChapters.length; i++) {
    const plain = htmlToPlainText(searchChapters[i].content)
    const cjk = isCJKText(plain)
    const signals = cjk ? ZH_DISRUPTION : EN_DISRUPTION
    const len = Math.max(plain.length, 1)
    const { score: rawScore, matched } = countSignalMatches(plain, signals)
    // Normalize by text length (per 1000 chars)
    const score = (rawScore / len) * 1000

    if (rawScore >= MIN_DISRUPTION_THRESHOLD && score > bestScore) {
      bestScore = score
      bestIndex = i
      bestSignals = matched
    }
  }

  if (bestIndex === -1) return null

  const chapter = searchChapters[bestIndex]
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterIndex: bestIndex,
    likelihood: Math.min(1, bestScore / 10),
    signals: bestSignals,
  }
}

/**
 * Detect the midpoint event in chapters at 40-60% of the story.
 */
export function detectMidpoint(chapters: Chapter[]): Midpoint | null {
  if (chapters.length < 3) return null

  const startIdx = Math.floor(chapters.length * 0.4)
  const endIdx = Math.ceil(chapters.length * 0.6)
  const searchChapters = chapters.slice(startIdx, endIdx)

  if (searchChapters.length === 0) return null

  let bestScore = 0
  let bestIndex = -1
  let bestType: Midpoint["eventType"] = "unknown"
  let bestSignals: string[] = []

  for (let i = 0; i < searchChapters.length; i++) {
    const plain = htmlToPlainText(searchChapters[i].content)
    const cjk = isCJKText(plain)
    const categories = cjk ? ZH_MIDPOINT : EN_MIDPOINT

    let chapterBestScore = 0
    let chapterBestType: Midpoint["eventType"] = "unknown"
    let chapterSignals: string[] = []

    for (const cat of categories) {
      const { score, matched } = countSignalMatches(plain, cat.patterns)
      if (score > chapterBestScore) {
        chapterBestScore = score
        chapterBestType = cat.type
        chapterSignals = matched
      }
    }

    if (chapterBestScore > bestScore) {
      bestScore = chapterBestScore
      bestIndex = i
      bestType = chapterBestType
      bestSignals = chapterSignals
    }
  }

  if (bestIndex === -1 || bestScore < MIN_DISRUPTION_THRESHOLD) return null

  const absoluteIndex = startIdx + bestIndex
  const chapter = searchChapters[bestIndex]

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterIndex: absoluteIndex,
    eventType: bestType,
    confidence: Math.min(1, bestScore / 5),
    signals: bestSignals,
  }
}
