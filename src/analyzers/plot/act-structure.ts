/**
 * Act Structure Detector
 *
 * @input  Chapter[] from editor
 * @output ActStructure — three-act structure detection
 * @pos    lib/analyzers/plot — Macro story structure analysis
 */

import type { Chapter } from "../../types.js"
import { htmlToPlainText } from "../utils.js"
import { isCJKText } from "../langs/text-utils"
import type { ActStructure, ActBoundary } from "./types"

// ── Word lists ──

const ZH_ACTION = /[冲打追逃战杀爆攻守挡]/g
const ZH_CONFLICT = /(?:冲突|对峙|反对|争吵|威胁|背叛|敌人|危险)/g
const ZH_REVELATION = /(?:真相|发现|原来|揭示|秘密|谎言)/g
const ZH_SETUP = /(?:第一次|初次|来到|新的|开始|名叫|是一个)/g

const EN_ACTION = /\b(?:fought|chased|fled|attacked|defended|escaped|ran|charged)\b/gi
const EN_CONFLICT = /\b(?:conflict|confronted|opposed|argued|threatened|betrayed|enemy|danger)\b/gi
const EN_REVELATION = /\b(?:truth|discovered|realized|revealed|secret|lie)\b/gi
const EN_SETUP = /\b(?:first time|arrived|new|began|named|was a)\b/gi

interface ChapterDensity {
  action: number
  conflict: number
  revelation: number
  setup: number
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern)
  return matches ? matches.length : 0
}

function computeDensity(plainText: string): ChapterDensity {
  const len = Math.max(plainText.length, 1)
  const scale = 1000 / len
  const cjk = isCJKText(plainText)

  if (cjk) {
    return {
      action: countMatches(plainText, ZH_ACTION) * scale,
      conflict: countMatches(plainText, ZH_CONFLICT) * scale,
      revelation: countMatches(plainText, ZH_REVELATION) * scale,
      setup: countMatches(plainText, ZH_SETUP) * scale,
    }
  }

  return {
    action: countMatches(plainText, EN_ACTION) * scale,
    conflict: countMatches(plainText, EN_CONFLICT) * scale,
    revelation: countMatches(plainText, EN_REVELATION) * scale,
    setup: countMatches(plainText, EN_SETUP) * scale,
  }
}

/**
 * Detect three-act structure from chapters.
 */
export function detectActStructure(chapters: Chapter[]): ActStructure {
  if (chapters.length === 0) {
    return { acts: [], hasThreeActStructure: false, assessment: "unclear" }
  }

  if (chapters.length < 3) {
    const acts: ActBoundary[] = [{
      startIndex: 0,
      startChapterId: chapters[0].id,
      actType: "setup",
      confidence: 0.3,
    }]
    return { acts, hasThreeActStructure: false, assessment: "unclear" }
  }

  // Pre-convert to plain text and compute density per chapter
  const densities = chapters.map(c => computeDensity(htmlToPlainText(c.content)))

  // Divide into 3 groups: ~25% / ~50% / ~25%
  const total = chapters.length
  const act1End = Math.max(1, Math.round(total * 0.25))
  const act3Start = Math.min(total - 1, Math.round(total * 0.75))

  // Compute average densities per act region
  const avg = (arr: ChapterDensity[], key: keyof ChapterDensity): number => {
    if (arr.length === 0) return 0
    return arr.reduce((sum, d) => sum + d[key], 0) / arr.length
  }

  const act1Densities = densities.slice(0, act1End)
  const act2Densities = densities.slice(act1End, act3Start)
  const act3Densities = densities.slice(act3Start)

  const act1Setup = avg(act1Densities, "setup")
  const act1Conflict = avg(act1Densities, "conflict")
  const act2Conflict = avg(act2Densities, "conflict")
  const act3Action = avg(act3Densities, "action")

  // 3-act pattern checks
  const setupDominant = act1Setup > act1Conflict
  const risingConflict = act2Conflict > act1Conflict
  const highClimax = act3Action >= avg(act1Densities, "action")

  let matchCount = 0
  if (setupDominant) matchCount++
  if (risingConflict) matchCount++
  if (highClimax) matchCount++

  const hasThreeActStructure = matchCount >= 2
  const assessment = matchCount === 3 ? "strong" : matchCount === 2 ? "weak" : "unclear"

  // Build act boundaries
  const baseConfidence = matchCount / 3

  const acts: ActBoundary[] = [
    {
      startIndex: 0,
      startChapterId: chapters[0].id,
      actType: "setup",
      confidence: setupDominant ? Math.min(1, baseConfidence + 0.2) : baseConfidence,
    },
    {
      startIndex: act1End,
      startChapterId: chapters[act1End].id,
      actType: "confrontation",
      confidence: risingConflict ? Math.min(1, baseConfidence + 0.2) : baseConfidence,
    },
    {
      startIndex: act3Start,
      startChapterId: chapters[act3Start].id,
      actType: "resolution",
      confidence: highClimax ? Math.min(1, baseConfidence + 0.2) : baseConfidence,
    },
  ]

  return { acts, hasThreeActStructure, assessment }
}
