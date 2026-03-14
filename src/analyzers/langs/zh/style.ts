/**
 * @input  Chinese plain text content
 * @output Style detections: passive voice, overused words, repetition, weak verbs, particles, AI markers
 * @pos    lib/analyzers/langs/zh — Chinese style analysis rules (informed by chinese-novelist-skill)
 */

import type { StyleLanguageRules } from "../types"
import { splitSentences } from "../text-utils"

const STOP_WORDS = new Set([
  "的", "了", "是", "在", "我", "他", "她", "它", "们", "这", "那",
  "有", "被", "不", "也", "都", "就", "而", "但", "与", "对", "和",
  "把", "让", "给", "到", "从", "会", "能", "要", "着", "过", "上",
  "下", "中", "大", "小", "多", "少", "个", "些", "里", "很", "更",
])

const EXTENDED_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "一", "又", "还", "没", "吗", "呢", "吧", "啊", "呀", "哦",
  "来", "去", "说", "看", "想", "知", "道", "得", "地", "可",
  "以", "为", "如", "何", "什", "么", "怎", "样", "之", "其",
  "所", "已", "将", "才", "只", "便", "因", "于", "自", "向",
  "比", "若", "虽", "即", "然", "更", "再", "最",
  // Body/sensory — too common in fiction to flag individually
  "声", "音", "光", "色", "气", "面", "手", "眼", "心", "头",
  // Modifiers — extremely common in literary Chinese
  "微", "轻", "你", "您",
  // Common single-char verbs too generic to flag
  "问", "听", "走", "做", "见",
])

const PUNCTUATION = new Set([
  "，", "。", "！", "？", "；", "：", "、", "…",
  "\u201c", "\u201d", "\u2018", "\u2019", "「", "」", "『", "』",
  "（", "）", "【", "】", "—", "～",
])

const PASSIVE_PATTERNS = [
  /被.{1,10}[了过着]/,
  /受到.{1,10}[了过着的]/,
  /遭到.{1,10}[了过着的]/,
  /遭受.{1,10}[了过着的]/,
]

const PARTICLES: Record<string, { threshold: number; name: string }> = {
  "的": { threshold: 0.08, name: "的" },
  "了": { threshold: 0.05, name: "了" },
  "着": { threshold: 0.04, name: "着" },
  "过": { threshold: 0.04, name: "过" },
  "地": { threshold: 0.04, name: "地" },
  "得": { threshold: 0.04, name: "得" },
}

const PRONOUNS = {
  first: ["我", "我们", "咱", "咱们"],
  second: ["你", "您", "你们"],
  third: ["他", "她", "它", "他们", "她们", "它们"],
}

const ASPECT_MARKERS = {
  perfective: ["了", "过"],
  progressive: ["着", "正在"],
  future: ["将", "要", "会"],
}

const CJK_CHAR = /[\u4e00-\u9fff\u3400-\u4dbf]/

// AI writing telltale markers (from chinese-novelist-skill quality checklist)
// These words appear disproportionately in AI-generated Chinese text
const AI_MARKER_WORDS = [
  "此外", "然而", "强调", "值得注意的是", "总而言之", "综上所述",
  "不仅如此", "与此同时", "毫无疑问", "显而易见", "不言而喻",
  "引人注目", "令人瞩目", "至关重要", "不可或缺", "举足轻重",
]

// Four-character idiom pattern (成语/四字词语)
const FOUR_CHAR_IDIOM = /[\u4e00-\u9fff]{4}/g

function extractOpening(sentence: string): string | null {
  const cleaned = sentence.replace(/^[\s，。！？；：、…\u201c\u201d\u2018\u2019「」『』（）【】—～]+/, "")
  if (cleaned.length < 2) return null
  const pronounMatch = cleaned.match(/^(他|她|它|我|你|您|他们|她们|我们|你们)/)
  if (pronounMatch) return pronounMatch[1]
  const first = cleaned[0]
  return /[\u4e00-\u9fff]/.test(first) ? first : null
}

export const zhStyle: StyleLanguageRules = {
  stopWords: STOP_WORDS,

  detectPassiveVoice(text) {
    const locations: Array<{ location: string }> = []
    for (const base of PASSIVE_PATTERNS) {
      const regex = new RegExp(base.source, "g")
      for (const match of text.matchAll(regex)) {
        const start = Math.max(0, match.index! - 10)
        const end = Math.min(text.length, match.index! + match[0].length + 10)
        locations.push({ location: text.substring(start, end) })
      }
    }
    return locations.slice(0, 10)
  },

  detectOverusedWords(text, whitelist) {
    // Use 2-character bigrams only (not single characters).
    // Single-char frequency is meaningless in Chinese (e.g. 声, 你, 微 are common).
    const counts = new Map<string, number>()
    const chars = [...text].filter(c => CJK_CHAR.test(c))

    for (let i = 0; i < chars.length - 1; i++) {
      const bigram = chars[i] + chars[i + 1]
      if (EXTENDED_STOP_WORDS.has(chars[i]) && EXTENDED_STOP_WORDS.has(chars[i + 1])) continue
      counts.set(bigram, (counts.get(bigram) || 0) + 1)
    }

    // Dynamic threshold: scale with text length (min 8 occurrences)
    const threshold = Math.max(8, Math.floor(chars.length / 100))
    return Array.from(counts.entries())
      .filter(([word, count]) => {
        if (whitelist?.has(word)) return false
        if (PUNCTUATION.has(word)) return false
        return count >= threshold
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ word, count }))
  },

  detectRepetition(text) {
    const sentences = splitSentences(text)
    const repetitions: Array<{ location: string }> = []
    const seen = new Set<string>()

    for (let i = 0; i < sentences.length - 1; i++) {
      const chars = [...sentences[i]].filter(c => /[\u4e00-\u9fff]/.test(c))
      // Use 3-character sequences to reduce false positives.
      // 2-char bigrams create noise from character name boundaries
      // (e.g. "是莉" from "是莉莉", "莉是" from "莉莉是").
      for (let j = 0; j < chars.length - 2; j++) {
        const phrase = `${chars[j]}${chars[j + 1]}${chars[j + 2]}`
        if (chars.slice(j, j + 3).every(c => EXTENDED_STOP_WORDS.has(c))) continue
        if (seen.has(phrase)) continue
        if (sentences[i + 1].includes(phrase)) {
          repetitions.push({ location: `"${phrase}" repeated in consecutive sentences` })
          seen.add(phrase)
        }
      }
    }
    return repetitions.slice(0, 5)
  },

  detectWeakVerbs(text) {
    // In Chinese, 是/有/做 are fundamental grammatical constructs,
    // not "weak verbs" in the English sense. Only flag when they appear
    // excessively relative to text length, suggesting over-reliance.
    const textChars = [...text].filter(c => /[\u4e00-\u9fff]/.test(c)).length
    const weakVerbs = ["是", "有", "做"]
    const locations: Array<{ location: string }> = []
    // Only report if a single weak verb exceeds 3% of total text characters
    const threshold = Math.max(10, Math.floor(textChars * 0.03))
    for (const verb of weakVerbs) {
      const count = (text.match(new RegExp(verb, "g")) || []).length
      if (count >= threshold) {
        locations.push({
          location: `「${verb}」出现 ${count} 次（占文本 ${((count / textChars) * 100).toFixed(1)}%）`,
        })
      }
    }
    return locations.slice(0, 5)
  },

  detectCustomIssues(text) {
    const issues: Array<{ type: string; severity: string; location: string; suggestion: string }> = []
    const totalChars = [...text].filter(c => /[\u4e00-\u9fff]/.test(c)).length

    if (totalChars > 50) {
      for (const [particle, config] of Object.entries(PARTICLES)) {
        const count = (text.match(new RegExp(particle, "g")) || []).length
        const density = count / totalChars
        if (density > config.threshold) {
          const pct = (density * 100).toFixed(1)
          issues.push({
            type: "particle_overuse",
            severity: density > config.threshold * 1.5 ? "medium" : "low",
            location: `「${config.name}」density: ${pct}% (${count} times in ${totalChars} chars)`,
            suggestion: `「${config.name}」使用频率较高（${pct}%），考虑精简部分用法`,
          })
        }
      }
    }

    // AI writing marker detection (quality-checklist: 没有 AI 写作痕迹)
    if (totalChars > 100) {
      const foundMarkers = AI_MARKER_WORDS.filter(w => text.includes(w))
      if (foundMarkers.length >= 3) {
        issues.push({
          type: "structure_repetition",
          severity: foundMarkers.length >= 5 ? "medium" : "low",
          location: `AI 典型用词: ${foundMarkers.slice(0, 4).map(w => `「${w}」`).join("、")}`,
          suggestion: `发现 ${foundMarkers.length} 个 AI 写作常见词汇，考虑替换为更自然的表达`,
        })
      }

      // Four-character idiom density (quality-checklist: 避免四字成语堆砌)
      const idiomMatches = text.match(FOUR_CHAR_IDIOM) || []
      const idiomDensity = idiomMatches.length / (totalChars / 100)
      if (idiomDensity > 3) {
        issues.push({
          type: "structure_repetition",
          severity: idiomDensity > 5 ? "medium" : "low",
          location: `四字词语密度较高: ${idiomMatches.length} 个 / ${totalChars} 字`,
          suggestion: `四字词语过于密集（${idiomDensity.toFixed(1)} 个/百字），考虑拆分为更口语化的表达`,
        })
      }
    }

    const sentences = text.split(/[。！？…]+/).filter(s => s.trim().length > 4)
    if (sentences.length >= 3) {
      let consecutive = 1
      for (let i = 1; i < sentences.length; i++) {
        const prev = extractOpening(sentences[i - 1])
        const curr = extractOpening(sentences[i])
        if (prev && curr && prev === curr) {
          consecutive++
          if (consecutive >= 3) {
            issues.push({
              type: "structure_repetition",
              severity: consecutive >= 4 ? "medium" : "low",
              location: `${consecutive} consecutive sentences start with "${prev}..."`,
              suggestion: `连续 ${consecutive} 句以「${prev}」开头，考虑变换句式`,
            })
            consecutive = 1
          }
        } else {
          consecutive = 1
        }
      }
    }
    return issues
  },

  countPronouns(text) {
    const count = (list: string[]) =>
      list.reduce((sum, p) => sum + (text.match(new RegExp(p, "g"))?.length || 0), 0)
    return {
      first: count(PRONOUNS.first),
      second: count(PRONOUNS.second),
      third: count(PRONOUNS.third),
    }
  },

  detectTense(text) {
    // Chinese has no grammatical tense — only aspect markers (了/过 = completed,
    // 着/正在 = ongoing, 将/要/会 = prospective). We map to the tense interface
    // for compatibility but this is aspect analysis, not tense detection.
    const count = (markers: string[]) =>
      markers.reduce((sum, m) => sum + (text.match(new RegExp(m, "g"))?.length || 0), 0)
    const completed = count(ASPECT_MARKERS.perfective)
    const ongoing = count(ASPECT_MARKERS.progressive) + count(ASPECT_MARKERS.future)
    const total = completed + ongoing
    if (total === 0) return "past" // default: narrative Chinese is typically completed-aspect
    if (completed / total > 0.7) return "past"
    if (ongoing / total > 0.7) return "present"
    return "mixed"
  },

  detectTone(text) {
    const formal = ["然而", "因此", "确实", "此外", "尽管", "倘若", "诸位"]
    const casual = ["嗯", "哦", "啊", "呢", "吧", "嘛", "哎", "喂", "咋"]
    const f = formal.filter(w => text.includes(w)).length
    const c = casual.filter(w => text.includes(w)).length
    if (f > c * 2) return "formal"
    if (c > f * 2) return "casual"
    return "mixed"
  },

  splitWords(text) {
    return [...text].filter(c => CJK_CHAR.test(c))
  },
}
