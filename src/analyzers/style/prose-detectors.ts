/**
 * @input  Plain text, locale string
 * @output PartialIssue[] — prose quality style issues
 * @pos    lib/analyzers/style — Prose quality detectors (split from style-detectors)
 *
 * Detectors:
 * - Weasel words: hedging language that weakens assertions
 * - Clichés: overused phrases in narration
 * - Sentence monotony: 3+ consecutive sentences of similar length
 * - Paragraph wall: paragraphs exceeding 500 CJK chars / 300 EN words
 * - Modifier chain: "的的的" chains in ZH / nested prepositional phrases in EN
 * - Telling not showing: direct emotion statements instead of behavioral showing
 * - Background overload: >70% exposition density in opening 20% of chapter
 */

import { splitSentences } from "../langs/text-utils"
import type { PartialIssue } from "./detector-utils"
import { resolveIsCJK, stripDialogue, countSubstring, extractContext } from "./detector-utils"

// ── Weasel words ──
const EN_WEASEL_WORDS = [
  "very", "really", "extremely", "quite", "somewhat",
  "somehow", "practically", "basically", "virtually",
  "arguably", "apparently", "seemingly", "reportedly",
  "relatively", "fairly",
]

const ZH_WEASEL_WORDS = [
  "非常", "真的", "有点", "似乎", "大概", "基本上",
  "相对来说", "据说", "可能", "差不多",
]

// ── Clichés ──
const EN_CLICHE_PATTERNS: RegExp[] = [
  "dark and stormy",
  "a bolt from the blue",
  "at the end of the day",
  "crystal clear",
  "in the nick of time",
  "dead as a doornail",
  "fit as a fiddle",
  "right as rain",
  "the tip of the iceberg",
  "a sigh of relief",
  "sent shivers down",
  "butterflies in (?:his|her|their|my) stomach",
  "blood ran cold",
  "the last straw",
  "a needle in a haystack",
  "hit the nail on the head",
  "easier said than done",
  "a matter of time",
  "beat around the bush",
  "an ear-to-ear grin",
  "a deafening silence",
  "bated breath",
  "his\\b.*\\bjaw dropped",
  "eyes went wide",
  "let out a breath (?:he|she|they) didn'?t know",
].map(p => new RegExp(p, "i"))

const ZH_CLICHES = [
  "一股暖流涌上心头",
  "不可置信地瞪大了眼睛",
  "鸦雀无声",
  "三下五除二",
  "天旋地转",
  "如释重负",
  "心如刀割",
  "眼前一黑",
  "浑身一震",
  "一脸震惊",
  "不由自主地",
  "愣在原地",
]

// ── Emotion/attribute words (telling not showing) ──
const ZH_EMOTIONS = [
  "愤怒", "高兴", "伤心", "紧张", "害怕", "兴奋", "失望",
  "焦虑", "恐惧", "痛苦", "疲惫", "孤独", "绝望", "悲伤", "沮丧",
]

const EN_EMOTIONS = [
  "angry", "happy", "sad", "nervous", "scared", "excited", "disappointed",
  "anxious", "afraid", "lonely", "desperate", "exhausted",
]

// ── Action verbs (background overload) ──
const ZH_ACTION_VERBS = [
  "跑", "打", "推", "拉", "跳", "抓", "踢", "砸", "切", "撕",
]

const EN_ACTION_VERBS = [
  "ran", "run", "runs", "running",
  "hit", "hits", "hitting",
  "pushed", "push", "pushes", "pushing",
  "pulled", "pull", "pulls", "pulling",
  "jumped", "jump", "jumps", "jumping",
  "grabbed", "grab", "grabs", "grabbing",
  "kicked", "kick", "kicks", "kicking",
  "smashed", "smash", "smashes",
  "cut", "cuts", "cutting",
  "threw", "throw", "throws", "throwing",
]

// ══════════════════════════════════════════════════════════
// Weasel Words
// ══════════════════════════════════════════════════════════

/**
 * Detect weasel words — hedging language that weakens assertions.
 * Only flags when density exceeds a threshold to avoid false positives.
 */
export function detectWeaselWords(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)
  const narration = stripDialogue(text)

  if (isCJK) {
    const charCount = [...narration].filter(c => /[\u4e00-\u9fff]/.test(c)).length
    if (charCount < 200) return []

    for (const word of ZH_WEASEL_WORDS) {
      const count = countSubstring(narration, word)
      if (count >= 3) {
        issues.push({
          type: "weasel_words",
          severity: count >= 6 ? "medium" : "low",
          location: `「${word}」在叙述中出现 ${count} 次`,
          suggestion: `「${word}」使用过多，会削弱叙述力度——考虑用更具体的表述替换`,
        })
      }
    }
  } else {
    const words = narration.split(/\s+/)
    if (words.length < 100) return []

    for (const weasel of EN_WEASEL_WORDS) {
      const pattern = new RegExp(`\\b${weasel}\\b`, "gi")
      const matches = [...narration.matchAll(pattern)]
      if (matches.length >= 3) {
        const firstMatch = matches[0]
        issues.push({
          type: "weasel_words",
          severity: matches.length >= 6 ? "medium" : "low",
          location: `"${weasel}" appears ${matches.length} times in narration — e.g. "${extractContext(narration, firstMatch.index! - 15, firstMatch.index! + weasel.length + 25)}"`,
          suggestion: `"${weasel}" weakens your prose — cut it or replace with something specific`,
        })
      }
    }
  }

  return issues.slice(0, 5)
}

// ══════════════════════════════════════════════════════════
// Cliché Detection
// ══════════════════════════════════════════════════════════

/**
 * Detect cliché phrases in narration.
 * Only flags high-confidence matches. Dialogue is excluded.
 */
export function detectCliches(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)
  const narration = stripDialogue(text)

  if (isCJK) {
    for (const cliche of ZH_CLICHES) {
      if (narration.includes(cliche)) {
        issues.push({
          type: "cliche",
          severity: "low",
          location: `「${cliche}」`,
          suggestion: `「${cliche}」是常见套语——试着用更独特的表达`,
        })
      }
    }
  } else {
    for (const pattern of EN_CLICHE_PATTERNS) {
      const match = pattern.exec(narration)
      if (match) {
        issues.push({
          type: "cliche",
          severity: "low",
          location: extractContext(narration, match.index - 10, match.index + match[0].length + 10),
          suggestion: `"${match[0]}" is a well-worn phrase — find a fresh way to express this`,
        })
      }
    }
  }

  return issues.slice(0, 5)
}

// ══════════════════════════════════════════════════════════
// Sentence Monotony
// ══════════════════════════════════════════════════════════

/**
 * Detect 3+ consecutive sentences of similar length (within ±15%).
 * Monotonous rhythm makes prose feel mechanical.
 */
export function detectSentenceMonotony(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)
  const sentences = splitSentences(text)
  if (sentences.length < 3) return []

  const measureLength = (s: string): number => {
    if (isCJK) {
      return [...s].filter(c => /[\u4e00-\u9fff]/.test(c)).length
    }
    return s.split(/\s+/).filter(w => w.length > 0).length
  }

  const lengths = sentences.map(measureLength)

  let runStart = 0
  for (let i = 1; i <= lengths.length; i++) {
    const prevLen = lengths[i - 1]
    const inRun = i < lengths.length
      && prevLen > 0
      && lengths[i] > 0
      && Math.abs(lengths[i] - prevLen) / prevLen <= 0.15

    if (!inRun) {
      const runLength = i - runStart
      if (runLength >= 3) {
        const avgLen = Math.round(lengths.slice(runStart, i).reduce((a, b) => a + b, 0) / runLength)
        const unit = isCJK ? "字" : "words"
        issues.push({
          type: "sentence_monotony",
          severity: runLength >= 5 ? "medium" : "low",
          location: sentences[runStart].substring(0, 40) + "...",
          suggestion: isCJK
            ? `连续 ${runLength} 句句子长度相近（约${avgLen}${unit}），缺乏节奏变化——试着交替使用长短句`
            : `${runLength} consecutive sentences of similar length (~${avgLen} ${unit}) — vary sentence length for better rhythm`,
        })
      }
      runStart = i
    }
  }

  return issues.slice(0, 5)
}

// ══════════════════════════════════════════════════════════
// Paragraph Wall
// ══════════════════════════════════════════════════════════

/**
 * Detect paragraphs with >500 CJK chars or >300 EN words without a break.
 * Dialogue-heavy paragraphs are excluded.
 */
export function detectParagraphWall(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)

  let paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)
  if (paragraphs.length <= 1) {
    paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0)
  }

  const dialogueMarkerPattern = /["'\u201c\u201d「」『』]/g

  for (const para of paragraphs) {
    const dialogueMarks = (para.match(dialogueMarkerPattern) || []).length
    if (dialogueMarks > para.length * 0.03) continue

    const length = isCJK
      ? [...para].filter(c => /[\u4e00-\u9fff]/.test(c)).length
      : para.split(/\s+/).filter(w => w.length > 0).length

    const mediumThreshold = isCJK ? 500 : 300
    const highThreshold = isCJK ? 800 : 500
    const unit = isCJK ? "字" : "words"

    if (length >= mediumThreshold) {
      issues.push({
        type: "paragraph_wall",
        severity: length >= highThreshold ? "high" : "medium",
        location: para.substring(0, 60) + "...",
        suggestion: isCJK
          ? `本段有 ${length} ${unit}，读者可能感到疲劳——考虑在逻辑转折处分段`
          : `This paragraph is ${length} ${unit} — consider breaking at logical transitions`,
      })
    }
  }

  return issues.slice(0, 5)
}

// ══════════════════════════════════════════════════════════
// Modifier Chain
// ══════════════════════════════════════════════════════════

/**
 * Detect "的的的" chains in ZH / nested prepositional phrases in EN.
 * Long modifier chains are hard to parse and should be simplified.
 */
export function detectModifierChain(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)

  if (isCJK) {
    const pattern = /([\u4e00-\u9fff]+的){3,}/g
    for (const match of text.matchAll(pattern)) {
      const deCount = countSubstring(match[0], "的")
      issues.push({
        type: "modifier_chain",
        severity: deCount >= 4 ? "medium" : "low",
        location: extractContext(text, match.index!, match.index! + match[0].length),
        suggestion: `连续 ${deCount} 个「的」字修饰链过长——精简为直接表达`,
      })
    }
  } else {
    const pattern = /\b(?:\w+\s+of\s+(?:the\s+)?){3,}\w+\b/gi
    for (const match of text.matchAll(pattern)) {
      issues.push({
        type: "modifier_chain",
        severity: "low",
        location: extractContext(text, match.index!, match.index! + match[0].length),
        suggestion: "Nested modifier chain — simplify the sentence structure",
      })
    }
  }

  return issues.slice(0, 5)
}

// ══════════════════════════════════════════════════════════
// Telling Not Showing
// ══════════════════════════════════════════════════════════

/**
 * Detect direct emotion/attribute statements instead of behavioral showing.
 * "He was very angry" → "His fists clenched at his sides."
 * Only checks narration. Threshold: 3+ occurrences.
 */
export function detectTellingNotShowing(
  text: string,
  locale: string,
): PartialIssue[] {
  const isCJK = resolveIsCJK(locale, text)
  const narration = stripDialogue(text)
  const matches: Array<{ match: string; index: number }> = []

  if (isCJK) {
    const emotionGroup = ZH_EMOTIONS.join("|")
    const pattern = new RegExp(
      `((?:他|她|它|他们|她们|[\u4e00-\u9fff]{2,4}))(?:很|非常|十分|极其|无比)(${emotionGroup})`,
      "g"
    )
    for (const m of narration.matchAll(pattern)) {
      matches.push({ match: m[0], index: m.index! })
    }
  } else {
    const emotionGroup = EN_EMOTIONS.join("|")
    const pattern = new RegExp(
      `\\b((?:He|She|They)\\s+(?:was|were|felt|seemed|looked))\\s+(?:very\\s+)?(${emotionGroup})\\b`,
      "gi"
    )
    for (const m of narration.matchAll(pattern)) {
      matches.push({ match: m[0], index: m.index! })
    }
  }

  if (matches.length < 3) return []

  const issues: PartialIssue[] = []
  for (const { match, index } of matches.slice(0, 5)) {
    issues.push({
      type: "telling_not_showing",
      severity: "low",
      location: extractContext(narration, index - 10, index + match.length + 20),
      suggestion: isCJK
        ? `「${match}」是直接陈述情绪——用身体语言和动作展示：如「他的手在颤抖」`
        : `"${match}" tells emotion directly — show through physical action instead`,
    })
  }

  return issues
}

// ══════════════════════════════════════════════════════════
// Background Overload
// ══════════════════════════════════════════════════════════

/**
 * Detect info-dump in the opening section (first 20% of chapter).
 * Calculates "exposition density" and flags when > 70%.
 */
export function detectBackgroundOverload(
  text: string,
  locale: string,
): PartialIssue[] {
  const isCJK = resolveIsCJK(locale, text)
  const sentences = splitSentences(text)
  if (sentences.length < 5) return []

  const openingCount = Math.max(3, Math.ceil(sentences.length * 0.2))
  const opening = sentences.slice(0, openingCount)

  const dialoguePattern = /["'\u201c\u201d「」『』]/
  const actionVerbs = isCJK ? ZH_ACTION_VERBS : EN_ACTION_VERBS
  const enVerbPatterns = isCJK ? [] : actionVerbs.map(v => new RegExp(`\\b${v}\\b`, "i"))

  let expositionCount = 0
  for (const sentence of opening) {
    const hasDialogue = dialoguePattern.test(sentence)
    const hasAction = isCJK
      ? actionVerbs.some(v => sentence.includes(v))
      : enVerbPatterns.some(p => p.test(sentence))

    if (!hasDialogue && !hasAction) {
      expositionCount++
    }
  }

  const density = expositionCount / opening.length
  if (density <= 0.7) return []

  const pct = Math.round(density * 100)

  return [{
    type: "background_overload",
    severity: "medium",
    location: opening[0].substring(0, 60) + "...",
    suggestion: isCJK
      ? `开头 20% 中有 ${pct}% 是背景铺垫——考虑通过行动和对话自然展示信息`
      : `${pct}% of the opening is exposition — reveal background through action and dialogue`,
  }]
}

// ══════════════════════════════════════════════════════════
// Pacing Rhythm (ported from the product's l2.pacing-rhythm, guardian-v3 sync 2026-07)
// ══════════════════════════════════════════════════════════

/**
 * Detect pacing problems from paragraph-length runs and dialogue density:
 * long runs of very short paragraphs (breathless), runs of very long
 * paragraphs (dragging), and talking-heads chapters (>=75% dialogue).
 */
export function detectPacingRhythm(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)

  let paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)
  if (paragraphs.length <= 1) {
    paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0)
  }
  if (paragraphs.length < 6) return issues

  const lengthOf = (para: string): number =>
    isCJK
      ? [...para].filter(c => /[一-鿿]/.test(c)).length
      : para.split(/\s+/).filter(w => w.length > 0).length

  const shortThreshold = isCJK ? 30 : 15
  const longThreshold = isCJK ? 200 : 120

  // ── Pacing runs ──────────────────────────────────────────────
  let shortRun = 0
  let longRun = 0
  let worstShortRun = { count: 0, startIdx: 0 }
  let worstLongRun = { count: 0, startIdx: 0 }

  paragraphs.forEach((p, i) => {
    const len = lengthOf(p)
    if (len < shortThreshold) {
      shortRun++
      longRun = 0
      if (shortRun > worstShortRun.count) {
        worstShortRun = { count: shortRun, startIdx: i - shortRun + 1 }
      }
    } else if (len >= longThreshold) {
      longRun++
      shortRun = 0
      if (longRun > worstLongRun.count) {
        worstLongRun = { count: longRun, startIdx: i - longRun + 1 }
      }
    } else {
      shortRun = 0
      longRun = 0
    }
  })

  if (worstShortRun.count >= 5) {
    const preview = (paragraphs[worstShortRun.startIdx] || "").slice(0, 50)
    issues.push({
      type: "pacing_rhythm",
      severity: worstShortRun.count >= 8 ? "medium" : "low",
      location: `${worstShortRun.count} short paragraphs starting near "${preview}..."`,
      suggestion: isCJK
        ? `连续 ${worstShortRun.count} 段过短，节奏过快 — 适合动作段落，普通叙事可合并一些短句增加呼吸感`
        : `${worstShortRun.count} very short paragraphs in a row — fine for action, but consider merging in normal narration to give the reader room to breathe`,
    })
  }

  if (worstLongRun.count >= 3) {
    const preview = (paragraphs[worstLongRun.startIdx] || "").slice(0, 50)
    issues.push({
      type: "pacing_rhythm",
      severity: worstLongRun.count >= 5 ? "medium" : "low",
      location: `${worstLongRun.count} long paragraphs starting near "${preview}..."`,
      suggestion: isCJK
        ? `连续 ${worstLongRun.count} 段偏长，读者注意力易流失 — 考虑在转场或情绪变化处分段`
        : `${worstLongRun.count} long paragraphs in a row can drag — break at emotional shifts or scene transitions`,
    })
  }

  // ── Dialogue ratio ───────────────────────────────────────────
  const dialogueQuotePattern = isCJK ? /[「」『』]/ : /^\s*["“”]/
  const dialogueParagraphs = paragraphs.filter(p => dialogueQuotePattern.test(p))
  const ratio = dialogueParagraphs.length / paragraphs.length

  if (ratio >= 0.75 && paragraphs.length >= 10) {
    issues.push({
      type: "pacing_rhythm",
      severity: "low",
      location: `${Math.round(ratio * 100)}% of paragraphs are dialogue`,
      suggestion: isCJK
        ? `章节 ${Math.round(ratio * 100)}% 的段落是对话 — 适度穿插动作、内心活动或环境描写能提升沉浸感`
        : `${Math.round(ratio * 100)}% of paragraphs are dialogue — interleave action, inner thought, or setting to avoid a 'talking-heads' feel`,
    })
  }

  return issues
}

// ── Gesture gloss (ported from the product's l2.gesture-gloss, guardian-v3 sync 2026-07) ──
// A hallmark AI-prose tic (5A.6, anti-AI): a gesture/action followed by an interpretive clause that
// SPELLS OUT its meaning instead of trusting the reader — "She set the cup down, as if she'd already
// decided to leave." / "He nodded, like someone used to being obeyed." A single use is fine; the
// TIC is the overuse, so flag on repetition (the flaw-pattern logic). Local + deterministic.
const EN_GLOSS_PATTERNS: ReadonlyArray<RegExp> = [
  /,\s+as\s+if\b/gi,
  /,\s+as\s+though\b/gi,
  /,\s+like\s+(?:someone|somebody)\b/gi,
]
const CJK_GLOSS_PATTERN = /[，,]\s*(?:仿佛|好像|似乎|宛如|恍若|像是)/g
const GLOSS_MIN_COUNT = 3

/**
 * Raw count of gesture-gloss constructions (no threshold) + the offset of the first one. Exposed so
 * an experiment can measure the construction RATE — e.g. plain generation vs a structured-output
 * "reinforcement" field that commits the model to dropping the interpretive clause before it writes.
 */
export function countGestureGloss(text: string, locale: string): { count: number; firstAt: number } {
  const isCJK = resolveIsCJK(locale, text)
  const narration = stripDialogue(text)
  let count = 0
  let firstAt = -1
  if (isCJK) {
    for (const m of narration.matchAll(CJK_GLOSS_PATTERN)) {
      count += 1
      if (firstAt < 0) firstAt = m.index ?? -1
    }
  } else {
    for (const pattern of EN_GLOSS_PATTERNS) {
      for (const m of narration.matchAll(pattern)) {
        count += 1
        if (firstAt < 0 || (m.index ?? Infinity) < firstAt) firstAt = m.index ?? -1
      }
    }
  }
  return { count, firstAt }
}

export function detectGestureGloss(text: string, locale: string): PartialIssue[] {
  const isCJK = resolveIsCJK(locale, text)
  const { count, firstAt } = countGestureGloss(text, locale)

  if (count < GLOSS_MIN_COUNT) return []
  const narration = stripDialogue(text)
  const sample = firstAt >= 0 ? extractContext(narration, firstAt, firstAt + 60) : ""
  return [
    {
      type: "gesture_gloss",
      severity: count >= 5 ? "medium" : "low",
      location: isCJK
        ? `"动作 + 仿佛/好像…"的解释式从句在本章出现 ${count} 次,例如:${sample}`
        : `the "gesture, as if/like…" interpretive clause recurs ${count} times, e.g. ${sample}`,
      suggestion: isCJK
        ? `反复用"…,仿佛/好像…"把动作的含义直接说穿,会削弱信任感——多数地方让动作自己说话,删去解释从句`
        : `the "gesture, as if/like…" construction spells out a gesture's meaning instead of trusting the reader — a hallmark AI tell; cut the interpretive clause in most places and let the action stand`,
    },
  ]
}
