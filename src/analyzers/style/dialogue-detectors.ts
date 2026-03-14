/**
 * @input  Plain text, locale string
 * @output PartialIssue[] — dialogue-specific style issues
 * @pos    lib/analyzers/style — Dialogue quality detectors (split from style-detectors)
 *
 * Detectors:
 * - Unattributed dialogue: 4+ consecutive lines without speaker ID
 * - Dialogue order: reaction beat before verbal response
 * - Adverb dialogue tags: "他愤怒地说" instead of action beats
 * - Info-dump dialogue: "As you know" exposition
 * - Purposeless dialogue: greeting sequences with no purpose
 * - Verbose dialogue: unrealistically long dialogue lines
 */

import type { PartialIssue } from "./detector-utils"
import { resolveIsCJK, extractContext } from "./detector-utils"

// ── Reaction verbs (dialogue order) ──
const EN_REACTION_VERBS = [
  "blinked", "frowned", "flinched", "winced", "gasped", "sighed",
  "shuddered", "stiffened", "hesitated", "stammered", "stuttered",
  "gulped", "swallowed", "grimaced", "squinted", "recoiled",
  "flushed", "blanched", "paled", "stared", "gaped", "scoffed",
  "snorted", "chuckled", "groaned", "cringed", "balked", "froze",
]

const ZH_REACTION_VERBS = [
  "皱眉", "眨眼", "一愣", "一怔", "吃惊", "僵住", "脸红",
  "倒吸一口气", "愣住", "呆住", "吞了口唾沫", "打了个寒颤",
]

// ── Adverb + speech verb patterns ──
const ZH_ADVERB_TAG_PATTERN = /[」"\u201d]['"]?\s*([\u4e00-\u9fff]{2,3})([\u4e00-\u9fff]{1,3}地)((?:说|道|问|回答|答道|叫道|喊道|嚷道|吼道|低声说|轻声说|沉声道))/g

const EN_ADVERB_TAG_PATTERN = /["'\u201d]\s*(?:he|she|they|[A-Z]\w+)\s+(said|asked|replied|whispered|shouted|murmured|answered|exclaimed)\s+((?:very\s+)?\w+ly)\b/gi

// ── Info-dump patterns ──
const ZH_INFO_DUMP_PATTERNS = [
  /[「"\u201c][^」"\u201d]*正如你所知[^」"\u201d]*[」"\u201d]/g,
  /[「"\u201c][^」"\u201d]*你也知道[，,][^」"\u201d]*[」"\u201d]/g,
  /[「"\u201c][^」"\u201d]*我不用告诉你[^」"\u201d]*[」"\u201d]/g,
  /[「"\u201c][^」"\u201d]*众所周知[^」"\u201d]*[」"\u201d]/g,
  /[「"\u201c][^」"\u201d]*(?:你应该|你也)记得[^」"\u201d]*[」"\u201d]/g,
]

const EN_INFO_DUMP_PATTERNS = [
  /["'\u201c][^"'\u201d]*\bAs you (?:know|recall|remember)\b[^"'\u201d]*["'\u201d]/gi,
  /["'\u201c][^"'\u201d]*\bAs (?:we|I) (?:both|all) know\b[^"'\u201d]*["'\u201d]/gi,
  /["'\u201c][^"'\u201d]*\bI don't need to (?:tell|remind) you\b[^"'\u201d]*["'\u201d]/gi,
  /["'\u201c][^"'\u201d]*\bYou (?:of all people|already) know\b[^"'\u201d]*["'\u201d]/gi,
]

// ── Greeting sequences ──
const ZH_GREETINGS = [
  "你好", "早上好", "晚上好", "吃了吗", "最近怎么样",
  "好久不见", "你好吗", "挺好的", "还行", "一般般",
]

const EN_GREETINGS = [
  "hello", "hi", "hey", "good morning", "good evening",
  "how are you", "i'm fine", "i'm good", "not bad",
  "long time no see", "nice to see you",
]

// ══════════════════════════════════════════════════════════
// Unattributed Dialogue
// ══════════════════════════════════════════════════════════

/**
 * Detect 4+ consecutive dialogue lines without speaker attribution.
 */
export function detectUnattributedDialogue(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)

  const lines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0)

  const enDialogueLine = /^["'\u201c].*["'\u201d]$/
  const zhDialogueLineOpen = /^[「『\u201c]/
  const zhDialogueLineClose = /[」』\u201d]$/
  const enAttribution = /\b(said|asked|replied|whispered|shouted|yelled|muttered|called|cried|exclaimed|answered|murmured|growled|sighed|laughed|snapped)\b/i
  const zhAttribution = /(?:说|道|问|回答|答|笑道|叹道|怒道|哭道|喊道|叫道|低声说|轻声说|沉声道)/

  let consecutiveUnattributed = 0
  let firstUnattributedLine = ""

  const emitIfNeeded = () => {
    if (consecutiveUnattributed >= 4) {
      issues.push({
        type: "unattributed_dialogue",
        severity: consecutiveUnattributed >= 6 ? "high" : "medium",
        location: `${consecutiveUnattributed} consecutive dialogue lines without speaker: "${firstUnattributedLine}..."`,
        suggestion: isCJK
          ? `连续 ${consecutiveUnattributed} 句对白没有说话人标识，读者可能分不清谁在说话`
          : `${consecutiveUnattributed} consecutive dialogue lines without speaker tags — readers may lose track of who is speaking`,
      })
    }
    consecutiveUnattributed = 0
  }

  for (const line of lines) {
    const isDialogue = isCJK
      ? (zhDialogueLineOpen.test(line) && zhDialogueLineClose.test(line))
      : enDialogueLine.test(line)

    if (!isDialogue) {
      emitIfNeeded()
      continue
    }

    const hasAttribution = isCJK
      ? zhAttribution.test(line)
      : enAttribution.test(line)

    if (hasAttribution) {
      emitIfNeeded()
    } else {
      if (consecutiveUnattributed === 0) {
        firstUnattributedLine = line.substring(0, 60)
      }
      consecutiveUnattributed++
    }
  }

  emitIfNeeded()
  return issues
}

// ══════════════════════════════════════════════════════════
// Dialogue Order (reaction beat before verbal response)
// ══════════════════════════════════════════════════════════

/**
 * Detect dialogue ordering issues: reaction beat placed before the verbal response.
 *
 * Anti-pattern: Name reacted. "Dialogue?"
 * Correct: "Dialogue?" Name reacted.
 */
export function detectDialogueOrder(
  text: string,
  locale: string,
): PartialIssue[] {
  return resolveIsCJK(locale, text) ? detectDialogueOrderZH(text) : detectDialogueOrderEN(text)
}

function detectDialogueOrderEN(text: string): PartialIssue[] {
  const issues: PartialIssue[] = []

  const verbPattern = EN_REACTION_VERBS.join("|")
  const pattern = new RegExp(
    `\\b([A-Z][a-z]+)\\s+(${verbPattern})\\.\\s*["'\u201c]([^"'\u201d]{3,60})["'\u201d]`,
    "g"
  )

  for (const match of text.matchAll(pattern)) {
    const dialogue = match[3]
    if (!/[?!]/.test(dialogue) && !/^(What|Why|How|No|But|Wait|Huh|Really|Excuse|That|You|We|I\s)/i.test(dialogue)) {
      continue
    }

    issues.push({
      type: "dialogue_order",
      severity: "medium",
      location: extractContext(text, match.index!, match.index! + match[0].length),
      suggestion: `Place the dialogue before the reaction — "${dialogue.substring(0, 30)}..." should come before "${match[1]} ${match[2]}" (hear → respond → react)`,
    })
  }

  return issues.slice(0, 5)
}

function detectDialogueOrderZH(text: string): PartialIssue[] {
  const issues: PartialIssue[] = []

  for (const verb of ZH_REACTION_VERBS) {
    const pattern = new RegExp(
      `([\u4e00-\u9fff]{2,3})${verb}[。.，,]\\s*[「\u201c"']([^」\u201d"']{3,40})[」\u201d"']`,
      "g"
    )
    for (const match of text.matchAll(pattern)) {
      const dialogue = match[2]
      if (!/[？！?!]/.test(dialogue) && !/^(什么|为什么|怎么|不|等|你|我|这)/.test(dialogue)) {
        continue
      }

      issues.push({
        type: "dialogue_order",
        severity: "medium",
        location: extractContext(text, match.index!, match.index! + match[0].length),
        suggestion: `将对白移到动作之前——角色应先说话再做出反应（听到→回应→反应）`,
      })
    }
  }

  return issues.slice(0, 5)
}

// ══════════════════════════════════════════════════════════
// Adverb Dialogue Tags
// ══════════════════════════════════════════════════════════

/**
 * Detect adverb-heavy dialogue tags.
 * Anti-pattern: "你骗了我，"他愤怒地说。
 * Better:       "你骗了我。"他的声音在颤抖。
 * Flags when 3+ adverb tags appear in a chapter.
 */
export function detectAdverbDialogueTags(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)

  if (isCJK) {
    const matches = [...text.matchAll(ZH_ADVERB_TAG_PATTERN)]
    if (matches.length < 3) return []

    for (const match of matches.slice(0, 5)) {
      issues.push({
        type: "adverb_dialogue_tag",
        severity: "low",
        location: extractContext(text, match.index! - 15, match.index! + match[0].length + 5),
        suggestion: `「${match[2]}${match[3]}」可以改用动作描写——用角色的肢体语言代替副词修饰（如：他的声音在颤抖）`,
      })
    }
  } else {
    const matches = [...text.matchAll(EN_ADVERB_TAG_PATTERN)]
    if (matches.length < 3) return []

    for (const match of matches.slice(0, 5)) {
      issues.push({
        type: "adverb_dialogue_tag",
        severity: "low",
        location: extractContext(text, match.index! - 15, match.index! + match[0].length + 5),
        suggestion: `"${match[1]} ${match[2]}" — replace the adverb with an action beat that shows the emotion`,
      })
    }
  }

  return issues
}

// ══════════════════════════════════════════════════════════
// Info-Dump Dialogue
// ══════════════════════════════════════════════════════════

/**
 * Detect info-dump dialogue — characters expositing to each other.
 * "As you know" / "正如你所知" exposition in dialogue.
 */
export function detectInfoDumpDialogue(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)
  const patterns = isCJK ? ZH_INFO_DUMP_PATTERNS : EN_INFO_DUMP_PATTERNS

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const dialogue = match[0].substring(1, Math.min(match[0].length - 1, 60))
      issues.push({
        type: "info_dump_dialogue",
        severity: "medium",
        location: extractContext(text, match.index!, match.index! + match[0].length),
        suggestion: isCJK
          ? `角色之间的信息倾倒——不要让角色互相陈述已知信息，应通过情节自然揭示：「${dialogue}…」`
          : `Info-dump in dialogue — characters shouldn't tell each other things they already know. Reveal information through action instead`,
      })
    }
  }

  return issues.slice(0, 3)
}

// ══════════════════════════════════════════════════════════
// Purposeless Dialogue
// ══════════════════════════════════════════════════════════

/**
 * Detect purposeless small-talk dialogue sequences.
 * Flags when 3+ consecutive dialogue lines are pure greetings/pleasantries.
 */
export function detectPurposelessDialogue(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)
  const greetings = isCJK ? ZH_GREETINGS : EN_GREETINGS

  const dialoguePattern = isCJK
    ? /[「"\u201c]([^」"\u201d]{1,50})[」"\u201d]/g
    : /["'\u201c]([^"'\u201d]{1,50})["'\u201d]/g

  const dialogueLines: Array<{ content: string; index: number }> = []
  for (const match of text.matchAll(dialoguePattern)) {
    dialogueLines.push({ content: match[1].trim(), index: match.index! })
  }

  let consecutiveGreetings = 0
  let firstGreetingIdx = 0

  for (let i = 0; i < dialogueLines.length; i++) {
    const line = dialogueLines[i].content.toLowerCase()
    const isGreeting = greetings.some(g => line.includes(g))
      || (isCJK ? /^[嗯啊哦是的好吧行]{1,4}[。，！]?$/.test(line) : /^(?:yes|no|ok|okay|sure|yeah|yep|nah|right)\b/i.test(line))

    if (isGreeting) {
      if (consecutiveGreetings === 0) firstGreetingIdx = dialogueLines[i].index
      consecutiveGreetings++
    } else {
      if (consecutiveGreetings >= 3) {
        issues.push({
          type: "purposeless_dialogue",
          severity: "medium",
          location: extractContext(text, firstGreetingIdx, firstGreetingIdx + 80),
          suggestion: isCJK
            ? `${consecutiveGreetings} 句连续寒暄/闲聊没有推动情节或揭示人物——每句对话必须有目的`
            : `${consecutiveGreetings} consecutive lines of small talk — every line of dialogue should advance plot, reveal character, or create conflict`,
        })
      }
      consecutiveGreetings = 0
    }
  }

  if (consecutiveGreetings >= 3) {
    issues.push({
      type: "purposeless_dialogue",
      severity: "medium",
      location: extractContext(text, firstGreetingIdx, firstGreetingIdx + 80),
      suggestion: isCJK
        ? `${consecutiveGreetings} 句连续寒暄/闲聊没有推动情节或揭示人物——每句对话必须有目的`
        : `${consecutiveGreetings} consecutive lines of small talk — every line of dialogue should advance plot, reveal character, or create conflict`,
    })
  }

  return issues.slice(0, 3)
}

// ══════════════════════════════════════════════════════════
// Verbose Dialogue
// ══════════════════════════════════════════════════════════

/**
 * Detect verbose dialogue lines — unrealistically long speeches.
 * Flags lines exceeding ~100 CJK chars or ~60 EN words without interruption.
 */
export function detectVerboseDialogue(
  text: string,
  locale: string,
): PartialIssue[] {
  const issues: PartialIssue[] = []
  const isCJK = resolveIsCJK(locale, text)

  const dialoguePattern = isCJK
    ? /[「"\u201c]([^」"\u201d]+)[」"\u201d]/g
    : /["'\u201c]([^"'\u201d]+)["'\u201d]/g

  let verboseCount = 0

  for (const match of text.matchAll(dialoguePattern)) {
    const content = match[1]
    const length = isCJK
      ? [...content].filter(c => /[\u4e00-\u9fff]/.test(c)).length
      : content.split(/\s+/).length

    const threshold = isCJK ? 100 : 60

    if (length > threshold) {
      verboseCount++
      if (verboseCount <= 3) {
        const preview = content.substring(0, 40)
        issues.push({
          type: "verbose_dialogue",
          severity: length > threshold * 2 ? "medium" : "low",
          location: extractContext(text, match.index!, match.index! + Math.min(match[0].length, 80)),
          suggestion: isCJK
            ? `这段对话有 ${length} 字——真实对话更简洁。考虑拆分为多轮对话，或用动作打断：「${preview}…」`
            : `This dialogue line is ${length} words — real speech is more concise. Break it into exchanges or interrupt with action beats`,
        })
      }
    }
  }

  return issues
}
