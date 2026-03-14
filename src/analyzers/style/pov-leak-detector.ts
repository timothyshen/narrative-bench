/**
 * @input  Plain text, locale string
 * @output PartialIssue[] — POV leak detection in 3rd-person limited narration
 * @pos    lib/analyzers/style — POV consistency detector (split from style-detectors)
 *
 * Heuristic:
 * 1. Determine the POV character (most frequently named character in the chapter)
 * 2. Find thought-attribution verbs ("X thought", "X knew", "X felt")
 * 3. If the subject of the thought verb is NOT the POV character, flag it
 */

import type { PartialIssue } from "./detector-utils"
import { resolveIsCJK, countSubstring, extractContext } from "./detector-utils"
import { getLanguage } from "../langs/registry"

// ── Thought-attribution verbs ──
const EN_THOUGHT_VERBS = [
  "thought", "wondered", "knew", "realized", "felt",
  "sensed", "suspected", "believed", "hoped", "feared",
  "recalled", "remembered", "imagined", "considered",
]

const ZH_THOUGHT_VERBS = [
  "想到", "心想", "觉得", "意识到", "感到", "感觉",
  "知道", "明白", "猜测", "怀疑", "相信", "希望",
  "担心", "害怕", "回忆", "想起", "暗想", "寻思",
]

// ── Sentence-start words to skip in name extraction ──
const SENTENCE_START_WORDS = new Set([
  "The", "This", "That", "These", "Those", "Then", "There", "Here",
  "When", "Where", "What", "Which", "Who", "How", "But", "And", "Yet",
  "Now", "After", "Before", "Once", "While", "Just", "Still", "Even",
  "Only", "Some", "Most", "Each", "Every", "Such", "Much", "Many",
  "More", "Also", "Both", "All", "Any", "Its",
])

// ── Pronoun subjects (skip these, they likely refer to POV character) ──
const PRONOUN_SUBJECTS = new Set([
  "he", "she", "they", "it", "someone", "one", "everyone", "nobody",
])

/**
 * Detect POV leaks: in 3rd-person limited narration, flag when the narrator
 * accesses the internal thoughts/feelings of a character who is NOT the POV character.
 */
export function detectPOVLeak(
  text: string,
  locale: string,
): PartialIssue[] {
  const lang = getLanguage(text)
  const isCJK = resolveIsCJK(locale, text)

  const { first, third } = lang.style.countPronouns(text)
  const total = first + third
  if (total === 0 || first > third) return []

  return isCJK ? detectPOVLeakZH(text) : detectPOVLeakEN(text)
}

function detectPOVLeakEN(text: string): PartialIssue[] {
  const issues: PartialIssue[] = []

  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g
  const nameCounts = new Map<string, number>()
  for (const match of text.matchAll(namePattern)) {
    const name = match[1]
    if (SENTENCE_START_WORDS.has(name)) continue
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
  }

  if (nameCounts.size < 2) return []

  const sorted = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])
  const povCharacter = sorted[0][0]
  const povLower = povCharacter.toLowerCase()

  for (const verb of EN_THOUGHT_VERBS) {
    const pattern = new RegExp(
      `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+${verb}\\b`,
      "g"
    )
    for (const match of text.matchAll(pattern)) {
      const subject = match[1]
      if (subject.toLowerCase() === povLower) continue
      if (PRONOUN_SUBJECTS.has(subject.toLowerCase())) continue
      if (SENTENCE_START_WORDS.has(subject)) continue

      issues.push({
        type: "pov_leak",
        severity: "medium",
        location: extractContext(text, match.index! - 20, match.index! + match[0].length + 30),
        suggestion: `In 3rd-person limited (POV: ${povCharacter}), avoid showing ${subject}'s internal thoughts directly`,
      })
    }
  }

  return issues.slice(0, 5)
}

function detectPOVLeakZH(text: string): PartialIssue[] {
  const issues: PartialIssue[] = []

  const chars = [...text].filter(c => /[\u4e00-\u9fff]/.test(c))
  const nameCounts = new Map<string, number>()

  const seen = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) {
    const two = chars[i] + chars[i + 1]
    if (!seen.has(two)) {
      seen.add(two)
      nameCounts.set(two, countSubstring(text, two))
    }
    if (i < chars.length - 2) {
      const three = chars[i] + chars[i + 1] + chars[i + 2]
      if (!seen.has(three)) {
        seen.add(three)
        nameCounts.set(three, countSubstring(text, three))
      }
    }
  }

  const likelyNames = [...nameCounts.entries()]
    .filter(([_, count]) => count >= 3 && count <= 200)
    .sort((a, b) => b[1] - a[1])

  if (likelyNames.length < 2) return []

  const povCharacter = likelyNames[0][0]

  for (const verb of ZH_THOUGHT_VERBS) {
    const pattern = new RegExp(`([\u4e00-\u9fff]{2,3})${verb}`, "g")
    for (const match of text.matchAll(pattern)) {
      const subject = match[1]
      if (subject === povCharacter) continue

      const subjectCount = nameCounts.get(subject) || 0
      if (subjectCount < 2) continue

      issues.push({
        type: "pov_leak",
        severity: "medium",
        location: extractContext(text, match.index! - 10, match.index! + match[0].length + 20),
        suggestion: `第三人称有限视角（视角人物：${povCharacter}），应避免直接展示${subject}的内心想法`,
      })
    }
  }

  return issues.slice(0, 5)
}
