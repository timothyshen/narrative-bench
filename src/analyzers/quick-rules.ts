/**
 * Quick Rules - Pattern-based consistency detection
 *
 * Fast, rule-based checks that don't require AI or vector search.
 * Used for real-time conflict detection during writing.
 *
 * @input  Chapter content, characters, timeline events
 * @output Array of detected issues
 * @pos    Guardian quick-check rule engine
 */

import type { GuardianIssue, GuardianSeverity, GuardianCategory, GuardianConfidence, GuardianLane } from "../types.js"
import { isCJKText } from "./langs/text-utils"

// Guardian-specific CJK constants (inlined from locale-utils migration)
const CJK_ACTION_VERBS = "说|走|跑|看|笑|去|来|站|坐|吃|喝|答|问|喊|叫|想|听"
const CJK_ATTRIBUTION_VERBS = "说|问|回答|低声说|喊道|道|叫道|喊|答|答道|笑道|叹道|怒道|哭道"
const CJK_TEMPORAL_MARKERS = [
  { pattern: /昨天/, key: "yesterday" },
  { pattern: /今天/, key: "today" },
  { pattern: /明天/, key: "tomorrow" },
  { pattern: /昨晚/, key: "last_night" },
  { pattern: /今早|今天早上/, key: "this_morning" },
  { pattern: /三天前/, key: "three_days_ago" },
  { pattern: /一周前|上周/, key: "a_week_ago" },
]

// ============================================================
// TYPES
// ============================================================

export interface QuickCheckInput {
  content: string
  chapterId: string
  characterNames: string[]
  deadCharacters?: string[]
  locale?: string
  timelineEvents?: Array<{
    id: string
    title: string
    date?: string
    description?: string
  }>
}

// ============================================================
// I18N — Static translation map for rule messages
// ============================================================

interface RuleStrings {
  deadCharacter: { title: (n: string) => string; description: (n: string) => string; suggestion: string }
  temporalRepeated: { title: (m: string) => string; description: (m: string, c: number) => string; suggestion: string }
  mixedTenses: { title: string; description: string; suggestion: string }
  nameTypo: { title: (p: string) => string; description: (p: string, k: string) => string; suggestion: (k: string, p: string) => string }
  dialogueAttribution: { title: string; description: string; suggestion: string }
}

const RULE_I18N: Record<string, RuleStrings> = {
  en: {
    deadCharacter: {
      title: (n) => `${n} appears after death`,
      description: (n) => `Character "${n}" who is marked as deceased appears to be active in this scene.`,
      suggestion: "Verify if this is a flashback or memory, or update the character's status.",
    },
    temporalRepeated: {
      title: (m) => `Repeated temporal reference: "${m}"`,
      description: (m, c) => `The phrase "${m}" appears ${c} times in this chapter, which may indicate timeline confusion.`,
      suggestion: "Review the timeline to ensure events are properly sequenced.",
    },
    mixedTenses: {
      title: "Mixed tenses in narrative",
      description: "This chapter mixes past perfect, simple past, and present tense significantly.",
      suggestion: "Review narrative tense consistency. Dialogue may use different tenses, but narration should be consistent.",
    },
    nameTypo: {
      title: (p) => `Possible typo: "${p}"`,
      description: (p, k) => `"${p}" is similar to character name "${k}". This might be a typo.`,
      suggestion: (k, p) => `Verify if you meant "${k}" or if "${p}" is a different entity.`,
    },
    dialogueAttribution: {
      title: "Long dialogue exchange without attribution",
      description: "Multiple lines of dialogue without clear speaker attribution may confuse readers.",
      suggestion: "Add dialogue tags or action beats to clarify who is speaking.",
    },
  },
  zh: {
    deadCharacter: {
      title: (n) => `${n} 在死亡后出现`,
      description: (n) => `已标记为死亡的角色「${n}」似乎在此场景中活跃。`,
      suggestion: "确认这是否为回忆或闪回，或更新角色状态。",
    },
    temporalRepeated: {
      title: (m) => `重复的时间表述：「${m}」`,
      description: (m, c) => `「${m}」在本章出现了 ${c} 次，可能存在时间线混乱。`,
      suggestion: "检查时间线，确保事件顺序正确。",
    },
    mixedTenses: {
      title: "叙述时态混乱",
      description: "本章混用了过去完成时、一般过去时和现在时。",
      suggestion: "检查叙述时态一致性。对话可以使用不同时态，但叙述应保持一致。",
    },
    nameTypo: {
      title: (p) => `可能的拼写错误：「${p}」`,
      description: (p, k) => `「${p}」与角色名「${k}」相似，可能是笔误。`,
      suggestion: (k, p) => `确认您是否指的是「${k}」，还是「${p}」是另一个实体。`,
    },
    dialogueAttribution: {
      title: "长段对话缺少归属标记",
      description: "多行对话没有明确的说话人标记，可能会让读者困惑。",
      suggestion: "添加对话标签或动作描写来明确说话人。",
    },
  },
}

function getRuleStrings(locale?: string): RuleStrings {
  return RULE_I18N[locale ?? "en"] ?? RULE_I18N.en
}

export interface QuickRule {
  id: string
  name: string
  category: GuardianCategory
  severity: GuardianSeverity
  confidence: GuardianConfidence
  lane: GuardianLane
  check: (input: QuickCheckInput) => QuickRuleMatch[]
}

export interface QuickRuleMatch {
  title: string
  description: string
  suggestion?: string
  evidence?: string[]
  position?: { start: number; end: number }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findAllMatches(content: string, pattern: RegExp): Array<{ match: string; index: number }> {
  const matches: Array<{ match: string; index: number }> = []
  let match
  while ((match = pattern.exec(content)) !== null) {
    matches.push({ match: match[0], index: match.index })
  }
  return matches
}

// ============================================================
// RULES
// ============================================================

/**
 * Rule: Dead character appearing in scene
 * Detects when a character marked as dead is mentioned as if alive
 */
const deadCharacterRule: QuickRule = {
  id: "dead-character-appearance",
  name: "Dead Character Appearance",
  category: "character",
  severity: "error",
  confidence: "high",
  lane: "issue",
  check: (input) => {
    const issues: QuickRuleMatch[] = []
    const { content, deadCharacters = [], locale } = input
    const t = getRuleStrings(locale)

    for (const name of deadCharacters) {
      // Look for active verbs with the character's name
      const activePatterns = [
        new RegExp(`${escapeRegex(name)}\\s+(said|says|walked|walks|ran|runs|looked|looks|smiled|smiles|laughed|went|goes|came|comes|stood|stands)`, "gi"),
        new RegExp(`${escapeRegex(name)}\\s+was\\s+(walking|running|talking|standing|sitting|eating|drinking)`, "gi"),
        new RegExp(`"[^"]*"\\s*${escapeRegex(name)}\\s+(said|replied|asked|answered)`, "gi"),
      ]

      // CJK patterns: character name followed by action verbs or dialogue attribution
      if (isCJKText(content)) {
        activePatterns.push(
          new RegExp(`${escapeRegex(name)}(?:${CJK_ACTION_VERBS})`, "g"),
          new RegExp(`[「『""][^「」『』""]*[」』""]\\s*${escapeRegex(name)}\\s*(?:${CJK_ATTRIBUTION_VERBS})`, "g"),
        )
      }

      for (const pattern of activePatterns) {
        const matches = findAllMatches(content, pattern)
        for (const m of matches) {
          issues.push({
            title: t.deadCharacter.title(name),
            description: t.deadCharacter.description(name),
            suggestion: t.deadCharacter.suggestion,
            evidence: [m.match],
            position: { start: m.index, end: m.index + m.match.length },
          })
        }
      }
    }

    return issues
  },
}

/**
 * Rule: Timeline temporal conflicts
 * Detects conflicting temporal references like "yesterday" appearing twice
 */
const temporalConflictRule: QuickRule = {
  id: "temporal-conflict",
  name: "Temporal Conflict",
  category: "timeline",
  severity: "warning",
  confidence: "low",
  lane: "suggestion",
  check: (input) => {
    const issues: QuickRuleMatch[] = []
    const { content, locale } = input
    const t = getRuleStrings(locale)

    // Count temporal references
    const temporalMarkers: Record<string, number> = {}
    const patterns: Array<{ pattern: RegExp; key: string }> = [
      { pattern: /\byesterday\b/gi, key: "yesterday" },
      { pattern: /\btoday\b/gi, key: "today" },
      { pattern: /\btomorrow\b/gi, key: "tomorrow" },
      { pattern: /\blast\s+night\b/gi, key: "last night" },
      { pattern: /\bthis\s+morning\b/gi, key: "this morning" },
      { pattern: /\bthree\s+days\s+ago\b/gi, key: "three days ago" },
      { pattern: /\ba\s+week\s+ago\b/gi, key: "a week ago" },
    ]

    // Add CJK temporal markers for Chinese text
    if (isCJKText(content)) {
      for (const marker of CJK_TEMPORAL_MARKERS) {
        patterns.push({ pattern: new RegExp(marker.pattern.source, "g"), key: marker.key })
      }
    }

    for (const { pattern, key } of patterns) {
      const matches = content.match(pattern)
      if (matches) {
        temporalMarkers[key] = (temporalMarkers[key] || 0) + matches.length
      }
    }

    // Check for excessive use of same temporal marker (might indicate conflict)
    for (const [marker, count] of Object.entries(temporalMarkers)) {
      if (count > 3) {
        issues.push({
          title: t.temporalRepeated.title(marker),
          description: t.temporalRepeated.description(marker, count),
          suggestion: t.temporalRepeated.suggestion,
        })
      }
    }

    // Check for conflicting past/present
    const pastPerfect = content.match(/\bhad\s+\w+ed\b/gi) || []
    const simplePast = content.match(/\b(was|were|did|went|came|said)\b/gi) || []
    const present = content.match(/\b(is|are|am|do|does|go|goes|come|comes|say|says)\b/gi) || []

    // If significant mix of tenses in narrative
    if (pastPerfect.length > 5 && simplePast.length > 10 && present.length > 10) {
      issues.push({
        title: t.mixedTenses.title,
        description: t.mixedTenses.description,
        suggestion: t.mixedTenses.suggestion,
      })
    }

    return issues
  },
}

/**
 * Rule: Character name typos
 * Detects potential typos in character names
 */
const characterNameTypoRule: QuickRule = {
  id: "character-name-typo",
  name: "Character Name Typo",
  category: "character",
  severity: "warning",
  confidence: "medium",
  lane: "issue",
  check: (input) => {
    const issues: QuickRuleMatch[] = []
    const { content, characterNames, locale } = input
    const t = getRuleStrings(locale)
    const isCJK = isCJKText(content)

    // Simple Levenshtein distance for short strings
    function levenshtein(a: string, b: string): number {
      if (a.length === 0) return b.length
      if (b.length === 0) return a.length

      const matrix: number[][] = []
      for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
      }
      for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
      }

      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1]
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            )
          }
        }
      }
      return matrix[b.length][a.length]
    }

    // Common English words that should never be flagged as character name typos.
    // These frequently match short names (3-4 chars) at Levenshtein ≤ 2.
    const COMMON_WORDS = new Set([
      "the", "this", "that", "them", "they", "then", "than", "thus",
      "his", "her", "him", "has", "had", "have", "here", "hers",
      "for", "from", "four", "form", "fore", "fort", "fork",
      "was", "were", "with", "will", "what", "when", "where", "who", "whom",
      "not", "nor", "now", "new", "next",
      "but", "been", "both", "back", "body",
      "all", "also", "any", "and", "are",
      "out", "our", "own", "over", "once", "only",
      "she", "said", "some", "such", "still",
      "six", "ten", "two", "one", "its",
      "did", "does", "done", "down",
      "how", "just", "like", "made", "make",
      "may", "more", "most", "much", "must",
      "can", "come", "came", "could",
      "too", "told", "took", "time", "turn",
      "way", "well", "went", "work", "would",
      "yet", "you", "your",
      "man", "men", "old", "get", "got", "let", "put", "run", "say", "saw", "see", "set",
    ])

    if (isCJK) {
      // CJK name typo detection: only check names ≥ 3 characters.
      // For 2-char Chinese names (e.g. 莉莉), Levenshtein on surrounding
      // bigrams produces massive false positives ("是莉", "莉是", etc.)
      // because single-char edits match normal text boundaries.
      //
      // IMPORTANT: We scan the ORIGINAL text (preserving punctuation and
      // particles) so that candidates like "的宝玉" — which is a grammar
      // particle followed by a real name — are not flagged.  The previous
      // approach stripped non-CJK chars first, creating artificial n-grams
      // that collide with real names at Levenshtein distance 1.
      //
      // We also build a set of known name substrings (e.g. "宝玉" from
      // "贾宝玉") so that partial-name references aren't flagged either.
      const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/
      const longNames = characterNames.filter(n => [...n].filter(c => CJK_RE.test(c)).length >= 3)

      // Build a set of known name suffixes (length ≥ 2) from character names.
      // Chinese characters are often referred to by the last 2 chars of their
      // 3-char name (e.g. 贾宝玉 → 宝玉).  When a candidate like "的宝玉"
      // contains such a suffix, it's a particle + short name, not a typo.
      // But "欧阳朗" — where the last char differs from 欧阳明 — doesn't
      // contain any known suffix, so it correctly gets flagged.
      const knownSuffixes = new Set<string>()
      for (const name of characterNames) {
        const nameChars = [...name]
        // Add all suffixes of length ≥ 2 (e.g. for 贾宝玉: 宝玉, 贾宝玉)
        for (let start = 0; start < nameChars.length; start++) {
          const suffix = nameChars.slice(start).join("")
          if (suffix.length >= 2) knownSuffixes.add(suffix)
        }
      }

      const seen = new Set<string>()
      for (const known of longNames) {
        const knownChars = [...known]
        const nameLen = knownChars.length
        const contentChars = [...content]

        // Slide over the original content (not stripped) looking for
        // CJK n-grams of the same length as the known name.
        for (let i = 0; i <= contentChars.length - nameLen; i++) {
          const candidate = contentChars.slice(i, i + nameLen).join("")

          // Every character in the candidate must be CJK
          if (!candidate.split("").every(c => CJK_RE.test(c))) continue

          if (candidate === known || seen.has(candidate)) continue
          if (characterNames.includes(candidate)) continue
          // Skip if candidate contains a known name suffix (≥ 2 chars).
          // E.g. "的宝玉" contains suffix "宝玉" of name "贾宝玉" → not a typo.
          // But "欧阳朗" does not contain any known suffix → check it.
          let containsKnownSuffix = false
          for (const suffix of knownSuffixes) {
            if (candidate.includes(suffix)) {
              containsKnownSuffix = true
              break
            }
          }
          if (containsKnownSuffix) continue

          const dist = levenshtein(candidate, known)
          if (dist === 1) {
            seen.add(candidate)
            const firstMatch = findAllMatches(content, new RegExp(escapeRegex(candidate), "g"))
            const pos = firstMatch[0]
            issues.push({
              title: t.nameTypo.title(candidate),
              description: t.nameTypo.description(candidate, known),
              suggestion: t.nameTypo.suggestion(known, candidate),
              position: pos ? { start: pos.index, end: pos.index + candidate.length } : undefined,
            })
          }
        }
      }
    } else {
      // For Latin text: find capitalized words
      const matches = content.match(/\b[A-Z][a-z]{2,}\b/g) || []
      const potentialNames = [...new Set(matches)]

      for (const potential of potentialNames) {
        if (characterNames.some((n) => n.toLowerCase() === potential.toLowerCase())) {
          continue
        }
        // Skip common English words — they match short names at low distance
        if (COMMON_WORDS.has(potential.toLowerCase())) {
          continue
        }

        for (const known of characterNames) {
          // Adaptive threshold: short names (≤ 4 chars) require distance 1,
          // longer names allow distance 2.  This prevents "The"→"Tim" (dist 2)
          // while still catching "Jonh"→"John" (dist 1) for short names.
          const maxDistance = known.length <= 4 ? 1 : 2
          const distance = levenshtein(potential.toLowerCase(), known.toLowerCase())
          if (distance > 0 && distance <= maxDistance && potential.length >= 3) {
            issues.push({
              title: t.nameTypo.title(potential),
              description: t.nameTypo.description(potential, known),
              suggestion: t.nameTypo.suggestion(known, potential),
            })
            break
          }
        }
      }
    }

    return issues
  },
}

/**
 * Rule: Dialogue attribution confusion
 * Detects when dialogue attribution might be unclear
 */
const dialogueAttributionRule: QuickRule = {
  id: "dialogue-attribution",
  name: "Dialogue Attribution",
  category: "style",
  severity: "info",
  confidence: "medium",
  lane: "issue",
  check: (input) => {
    const issues: QuickRuleMatch[] = []
    const { content } = input

    // Find sequences of dialogue without clear attribution
    const isCJK = isCJKText(content)

    // Match both English quotes and CJK dialogue delimiters
    const dialoguePattern = isCJK
      ? /(?:"[^"]+"|[「『""][^「」『』""]+[」』""])/g
      : /"[^"]+"/g
    const dialogues = content.match(dialoguePattern) || []

    // Attribution patterns: English verbs + CJK attribution verbs
    const attributionPattern = isCJK
      ? new RegExp(`(?:\\b(?:said|asked|replied|answered|whispered|shouted|muttered)\\b|(?:${CJK_ATTRIBUTION_VERBS}))`, "i")
      : /\b(said|asked|replied|answered|whispered|shouted|muttered)\b/i

    // Count consecutive dialogues
    let consecutiveCount = 0
    let lastEnd = -1

    for (const dialogue of dialogues) {
      const index = content.indexOf(dialogue, lastEnd + 1)
      const textBetween = content.slice(lastEnd + 1, index)

      // Check if there's attribution between dialogues
      const hasAttribution = attributionPattern.test(textBetween)

      if (!hasAttribution && lastEnd !== -1 && textBetween.trim().length < 30) {
        consecutiveCount++
      } else {
        consecutiveCount = 1
      }

      lastEnd = index + dialogue.length

      if (consecutiveCount >= 4) {
        const t = getRuleStrings(input.locale)
        issues.push({
          title: t.dialogueAttribution.title,
          description: t.dialogueAttribution.description,
          suggestion: t.dialogueAttribution.suggestion,
        })
        break
      }
    }

    return issues
  },
}

// ============================================================
// RULE REGISTRY
// ============================================================

// temporalConflictRule and dialogueAttributionRule removed — covered by Tier 1
// detectTemporalConfusion and detectUnattributedDialogue respectively.
export const QUICK_RULES: QuickRule[] = [
  deadCharacterRule,
  characterNameTypoRule,
]

// ============================================================
// RUNNER
// ============================================================

function generateIssueId(): string {
  return `qr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Create a fingerprint for issue deduplication
 */
function createFingerprint(ruleId: string, title: string, description: string): string {
  // Simple hash based on rule and content
  const content = `${ruleId}:${title}:${description}`
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

/**
 * Run all quick rules against the input
 */
export function runQuickCheck(input: QuickCheckInput): GuardianIssue[] {
  const issues: GuardianIssue[] = []

  for (const rule of QUICK_RULES) {
    try {
      const matches = rule.check(input)
      for (const match of matches) {
        const fingerprint = createFingerprint(rule.id, match.title, match.description)
        issues.push({
          id: generateIssueId(),
          severity: rule.severity,
          category: rule.category,
          title: match.title,
          description: match.description,
          suggestion: match.suggestion,
          evidence: match.evidence,
          chapterId: input.chapterId,
          fingerprint,
          tier: 1,
          timestamp: Date.now(),
          textPosition: match.position,
          confidence: rule.confidence,
          detector: rule.id,
          lane: rule.lane,
        })
      }
    } catch (error) {
      console.warn(`[QuickRules] Rule ${rule.id} failed:`, error)
    }
  }

  return issues
}
