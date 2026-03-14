/**
 * @input  Plain text chapter content, locale
 * @output ChapterClassification — type, opening technique, errors, structure, pacing
 * @pos    lib/analyzers/chapter — rule-based chapter classifier derived from chapter-guide.md
 *
 * All heuristics are pattern-based (no LLM calls). Bilingual: Chinese-first with English fallback.
 * Accuracy improves with chapters of 800+ characters. Very short fragments may misclassify.
 */

import { isCJKText } from "../langs/text-utils"
import type {
  ChapterClassification,
  ChapterType,
  CliffhangerWarning,
  FatalOpeningError,
  InformationDensity,
  OpeningTechnique,
  SuspenseLevel,
  SuspenseThreads,
  TensionCurve,
  TypeSignals,
} from "./types"

// ══════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════

/**
 * Classify a single chapter by content.
 * @param text — plain text (not HTML). Use `htmlToPlainText` before calling.
 * @param locale — "zh" | "en" | undefined (auto-detect)
 */
export function classifyChapter(text: string, locale?: string): ChapterClassification {
  if (!text || text.trim().length === 0) {
    return emptyResult()
  }

  const isCJK = locale === "zh" || isCJKText(text)
  const opening = getOpening(text, isCJK)

  return {
    chapterType: detectChapterType(text, isCJK),
    chapterTypeConfidence: computeTypeConfidence(text, isCJK),
    openingTechnique: detectOpeningTechnique(opening, isCJK),
    openingErrors: detectFatalOpeningErrors(opening, isCJK),
    structure: analyzeStructure(text, opening, isCJK),
    pacing: analyzePacing(text, isCJK),
    suspenseLevel: classifySuspenseLevel(text, isCJK),
    suspenseThreads: classifySuspenseThreads(text, isCJK),
    cliffhangerWarnings: detectCliffhangerWarnings(text, isCJK),
  }
}

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function emptyResult(): ChapterClassification {
  return {
    chapterType: "transition",
    chapterTypeConfidence: 0,
    openingTechnique: "unknown",
    openingErrors: [],
    structure: { hookStrength: 0, hasClimax: false, hasEndingHook: false },
    pacing: { tensionCurve: "flat", informationDensity: "low" },
    suspenseLevel: 0,
    suspenseThreads: { main: 0, character: 0, relationship: 0, temporal: 0 },
    cliffhangerWarnings: [],
  }
}

/** Extract the first ~20% of the text (by characters for CJK, words for EN). */
function getOpening(text: string, isCJK: boolean): string {
  if (isCJK) {
    const len = text.length
    return text.substring(0, Math.ceil(len * 0.2))
  }
  const words = text.split(/\s+/)
  const cutoff = Math.ceil(words.length * 0.2)
  return words.slice(0, cutoff).join(" ")
}

/** Count non-overlapping matches of a regex in text. */
function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  const global = new RegExp(pattern.source, flags)
  return (text.match(global) || []).length
}

/** Check if any pattern in the list matches the text. */
function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text))
}

// ══════════════════════════════════════════════════════════
// Chapter Type Classification
// ══════════════════════════════════════════════════════════

// ── Signal dictionaries ──

const ZH_PLOT_SIGNALS = [
  /发现/, /突然/, /爆发/, /攻击/, /追/, /逃/, /战斗/, /对抗/,
  /揭露/, /真相/, /线索/, /证据/, /秘密/, /阴谋/, /背叛/,
  /决定/, /计划/, /行动/, /出发/, /抵达/, /闯入/, /拦住/,
  /死/, /杀/, /伤/, /倒下/, /崩塌/, /爆炸/, /消失/,
]

const ZH_CHARACTER_SIGNALS = [
  /回忆/, /想起/, /从前/, /小时候/, /那年/, /过去/,
  /内心/, /心想/, /暗想/, /心中/, /心底/, /心里/,
  /为什么我/, /我不该/, /如果当初/, /一直以来/,
  /父亲/, /母亲/, /家/, /童年/, /曾经/,
  /眼泪/, /哭/, /笑了笑/, /叹了口气/, /沉默/,
]

const ZH_ATMOSPHERE_SIGNALS = [
  /寂静/, /沉默/, /笼罩/, /弥漫/, /氤氲/, /朦胧/,
  /风吹/, /雨落/, /雷鸣/, /月光/, /阳光/, /黑暗/,
  /空气中/, /远处传来/, /隐约/, /渐渐/, /缓缓/,
  /气氛/, /压抑/, /紧张/, /不安/, /诡异/, /阴森/,
]

const ZH_TRANSITION_SIGNALS = [
  /三天后/, /一周后/, /几个月后/, /第二天/, /次日/,
  /来到了/, /抵达了/, /回到了/, /离开了/, /前往/,
  /于是/, /就这样/, /之后/, /后来/, /接下来/,
  /整理了/, /收拾了/, /准备/, /安顿/,
]

const EN_PLOT_SIGNALS = [
  /discovered/, /attacked/, /escaped/, /fought/, /revealed/,
  /betrayed/, /exploded/, /collapsed/, /secret/, /clue/,
  /evidence/, /conspiracy/, /decided/, /charged/, /confronted/,
  /killed/, /died/, /destroyed/, /vanished/, /ambush/,
]

const EN_CHARACTER_SIGNALS = [
  /remembered/, /recalled/, /childhood/, /years ago/,
  /thought to (?:him|her)self/, /deep down/, /heart ached/,
  /couldn't help but/, /wondered why/, /father/, /mother/,
  /tears/, /cried/, /sighed/, /smiled bitterly/, /silence/,
]

const EN_ATMOSPHERE_SIGNALS = [
  /silence fell/, /hung in the air/, /crept/, /loomed/,
  /shadows/, /moonlight/, /darkness/, /mist/, /fog/,
  /eerie/, /unsettling/, /tension/, /oppressive/, /stillness/,
]

const EN_TRANSITION_SIGNALS = [
  /days later/, /weeks later/, /the next morning/, /arrived at/,
  /returned to/, /left for/, /traveled to/, /settled in/,
  /meanwhile/, /in the meantime/, /subsequently/,
]

function computeSignals(text: string, isCJK: boolean): TypeSignals {
  const signals: TypeSignals = {
    plot_advancing: 0,
    character_deepening: 0,
    atmosphere_building: 0,
    transition: 0,
  }

  const plotPatterns = isCJK ? ZH_PLOT_SIGNALS : EN_PLOT_SIGNALS
  const charPatterns = isCJK ? ZH_CHARACTER_SIGNALS : EN_CHARACTER_SIGNALS
  const atmoPatterns = isCJK ? ZH_ATMOSPHERE_SIGNALS : EN_ATMOSPHERE_SIGNALS
  const transPatterns = isCJK ? ZH_TRANSITION_SIGNALS : EN_TRANSITION_SIGNALS

  for (const p of plotPatterns) signals.plot_advancing += countMatches(text, p)
  for (const p of charPatterns) signals.character_deepening += countMatches(text, p)
  for (const p of atmoPatterns) signals.atmosphere_building += countMatches(text, p)
  for (const p of transPatterns) signals.transition += countMatches(text, p)

  return signals
}

function detectChapterType(text: string, isCJK: boolean): ChapterType {
  const signals = computeSignals(text, isCJK)

  // Normalize by text length to avoid bias toward longer chapters
  const length = isCJK
    ? [...text].filter(c => /[\u4e00-\u9fff]/.test(c)).length || 1
    : text.split(/\s+/).length || 1
  const factor = 1000 / length

  const normalized = {
    plot_advancing: signals.plot_advancing * factor,
    character_deepening: signals.character_deepening * factor,
    atmosphere_building: signals.atmosphere_building * factor,
    transition: signals.transition * factor,
  }

  const entries = Object.entries(normalized) as Array<[ChapterType, number]>
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

function computeTypeConfidence(text: string, isCJK: boolean): number {
  const signals = computeSignals(text, isCJK)
  const total = signals.plot_advancing + signals.character_deepening
    + signals.atmosphere_building + signals.transition

  if (total === 0) return 0

  const max = Math.max(
    signals.plot_advancing,
    signals.character_deepening,
    signals.atmosphere_building,
    signals.transition,
  )

  // Confidence = how dominant the top signal is
  return Math.round((max / total) * 100) / 100
}

// ══════════════════════════════════════════════════════════
// Opening Technique Detection
// ══════════════════════════════════════════════════════════

const ZH_OPENING_PATTERNS: Array<{ technique: OpeningTechnique; patterns: RegExp[] }> = [
  {
    technique: "in_media_res",
    patterns: [
      /^.{0,10}(?:子弹|刀|剑|拳|踢|翻滚|冲|扑|挡|闪|躲)/,
      /^.{0,20}(?:撞|砸|击|劈|刺|射)/,
      /^.{0,10}(?:跑|追|逃|冲出|跳)/,
    ],
  },
  {
    technique: "anomaly",
    patterns: [
      /^.{0,30}(?:不可能|怎么可能|不应该|死人.*(?:坐|站|走|说))/,
      /^.{0,30}(?:消失了|凭空出现|从天而降)/,
    ],
  },
  {
    technique: "shocking_dialogue",
    patterns: [
      /^[「"\u201c][^」"\u201d]{2,40}[」"\u201d]/,
      /^.{0,5}["'][^"']{2,40}["']/,
    ],
  },
  {
    technique: "countdown",
    patterns: [
      /^.{0,20}(?:还有|只剩|倒计时|最后).*(?:分钟|秒|小时)/,
      /^.{0,20}(?:来不及|时间不多|必须在.*之前)/,
    ],
  },
  {
    technique: "discovery",
    patterns: [
      /^.{0,30}(?:发现|报告|证据|线索|真相|结果显示)/,
      /^.{0,30}(?:原来|竟然是|居然|没想到)/,
    ],
  },
  {
    technique: "crisis",
    patterns: [
      /^.{0,20}(?:门被踹开|玻璃碎|警报|包围|逼近)/,
      /^.{0,30}(?:藏不住|暴露|被发现|无路可退|绝境)/,
    ],
  },
  {
    technique: "mystery",
    patterns: [
      /^.{0,30}(?:醒来.*发现|不记得|从未见过|奇怪的)/,
      /^.{0,30}(?:莫名|诡异|无法解释|离奇)/,
    ],
  },
  {
    technique: "betrayal",
    patterns: [
      /^.{0,30}(?:枪口|对准|背叛|出卖|信任.*崩塌)/,
      /^.{0,30}(?:对不起.*(?:他们|我不得不)|你骗了我)/,
    ],
  },
  {
    technique: "dilemma",
    patterns: [
      /^.{0,30}(?:只能.*一个|必须.*选择|要么.*要么)/,
      /^.{0,30}(?:两难|抉择|如何选|谁.*谁)/,
    ],
  },
  {
    technique: "flash_forward",
    patterns: [
      /^.{0,20}(?:三天后|一周后|多年后|很久以后)/,
      /^.{0,30}(?:后来才知道|事后看来|那时谁也没想到|所有人都会后悔)/,
    ],
  },
]

const EN_OPENING_PATTERNS: Array<{ technique: OpeningTechnique; patterns: RegExp[] }> = [
  {
    technique: "in_media_res",
    patterns: [
      /^.{0,30}\b(?:bullet|shot|blade|punch|duck|dodge|roll|crash|slam)\b/i,
      /^.{0,20}\b(?:ran|sprint|chase|flee|jump)\b/i,
    ],
  },
  {
    technique: "anomaly",
    patterns: [
      /^.{0,40}\b(?:impossible|shouldn't|dead\s+(?:man|woman|body).*(?:sat|stood|walked|spoke))\b/i,
      /^.{0,40}\b(?:vanished|appeared\s+from\s+nowhere|materialized)\b/i,
    ],
  },
  {
    technique: "shocking_dialogue",
    patterns: [
      /^["'\u201c][^"'\u201d]{2,60}["'\u201d]/,
    ],
  },
  {
    technique: "countdown",
    patterns: [
      /^.{0,30}\b(?:minutes|seconds|hours)\s+(?:left|remaining|until)\b/i,
      /^.{0,30}\b(?:countdown|deadline|too late|running out)\b/i,
    ],
  },
  {
    technique: "discovery",
    patterns: [
      /^.{0,40}\b(?:discovered|found|the report|evidence|the truth|turned out)\b/i,
    ],
  },
  {
    technique: "crisis",
    patterns: [
      /^.{0,30}\b(?:door\s+(?:burst|kicked)|alarm|surrounded|trapped)\b/i,
      /^.{0,40}\b(?:no way out|cornered|exposed|nowhere to run)\b/i,
    ],
  },
  {
    technique: "mystery",
    patterns: [
      /^.{0,40}\b(?:woke up.*(?:found|noticed)|couldn't remember|never seen before|strange)\b/i,
    ],
  },
  {
    technique: "betrayal",
    patterns: [
      /^.{0,40}\b(?:gun aimed|betrayed|sold\s+out|trust.*(?:shattered|broken))\b/i,
    ],
  },
  {
    technique: "dilemma",
    patterns: [
      /^.{0,40}\b(?:only\s+(?:one|room for)|choose|either.*or)\b/i,
    ],
  },
  {
    technique: "flash_forward",
    patterns: [
      /^.{0,30}\b(?:days later|weeks later|years later|looking back)\b/i,
      /^.{0,40}\b(?:no one.*(?:knew|expected)|everyone would regret)\b/i,
    ],
  },
]

function detectOpeningTechnique(opening: string, isCJK: boolean): OpeningTechnique {
  // Only examine the first 2-3 sentences for technique detection
  const firstChunk = opening.substring(0, Math.min(opening.length, 200))
  const patterns = isCJK ? ZH_OPENING_PATTERNS : EN_OPENING_PATTERNS

  for (const { technique, patterns: ps } of patterns) {
    if (anyMatch(firstChunk, ps)) {
      return technique
    }
  }

  return "unknown"
}

// ══════════════════════════════════════════════════════════
// Fatal Opening Error Detection
// ══════════════════════════════════════════════════════════

const ZH_FATAL_PATTERNS: Array<{ error: FatalOpeningError; patterns: RegExp[] }> = [
  {
    error: "weather_description",
    patterns: [
      /^.{0,10}(?:天气|晴朗|万里无云|阳光明媚|乌云密布|下着雨|刮着风|雪花纷飞)/,
      /^.{0,15}(?:那天|今天).*(?:天气|晴|阴|雨|雪|风)/,
    ],
  },
  {
    error: "daily_routine",
    patterns: [
      /^.{0,15}(?:醒来|起床|睁开眼|闹钟响)/,
      /^.{0,30}(?:刷牙|洗脸|吃早餐|穿衣服|出门上班)/,
    ],
  },
  {
    error: "recap",
    patterns: [
      /^.{0,10}(?:上一章|之前说到|前面提到|上回说到|话说上次)/,
      /^.{0,20}(?:我们之前|正如.*所说|接着上次)/,
    ],
  },
  {
    error: "slow_exposition",
    patterns: [
      /^.{0,20}(?:先介绍|首先.*了解|背景.*如下|说说.*历史)/,
      /^.{0,30}(?:这个城市|这个世界|这个国家).*(?:位于|建立|历史)/,
    ],
  },
  {
    error: "bland_dialogue",
    patterns: [
      /^.{0,5}[「"\u201c](?:你好|早上好|最近怎么样|吃了吗|你好吗)[」"\u201d]/,
    ],
  },
  {
    error: "over_explanation",
    patterns: [
      /^.{0,30}(?:这是因为|之所以|原因在于|简单来说|换句话说)/,
    ],
  },
]

const EN_FATAL_PATTERNS: Array<{ error: FatalOpeningError; patterns: RegExp[] }> = [
  {
    error: "weather_description",
    patterns: [
      /^.{0,20}\b(?:the weather|sunny|cloudy|raining|snowing|dark and stormy)\b/i,
      /^It was a\s+(?:bright|beautiful|cold|warm|dark|sunny|cloudy)\b/i,
    ],
  },
  {
    error: "daily_routine",
    patterns: [
      /^.{0,15}\b(?:woke up|alarm|got out of bed|brushed)\b/i,
      /^.{0,30}\b(?:morning routine|made breakfast|poured coffee)\b/i,
    ],
  },
  {
    error: "recap",
    patterns: [
      /^.{0,20}\b(?:last chapter|previously|as we (?:saw|said)|to recap)\b/i,
    ],
  },
  {
    error: "slow_exposition",
    patterns: [
      /^.{0,30}\b(?:let me (?:introduce|explain)|the history of|to understand)\b/i,
      /^.{0,30}\b(?:the city of|the kingdom of|the world of).*\b(?:was founded|located)\b/i,
    ],
  },
  {
    error: "bland_dialogue",
    patterns: [
      /^.{0,5}["'\u201c](?:Hello|Hi|Good morning|How are you|Nice to see you)["'\u201d.,!?]/i,
    ],
  },
  {
    error: "over_explanation",
    patterns: [
      /^.{0,20}\b(?:this is because|the reason|in other words|to put it simply)\b/i,
    ],
  },
]

function detectFatalOpeningErrors(opening: string, isCJK: boolean): FatalOpeningError[] {
  const firstChunk = opening.substring(0, Math.min(opening.length, 150))
  const fatalPatterns = isCJK ? ZH_FATAL_PATTERNS : EN_FATAL_PATTERNS
  const errors: FatalOpeningError[] = []

  for (const { error, patterns } of fatalPatterns) {
    if (anyMatch(firstChunk, patterns)) {
      errors.push(error)
    }
  }

  return errors
}

// ══════════════════════════════════════════════════════════
// Structure Analysis
// ══════════════════════════════════════════════════════════

// ── Tension indicators ──

const ZH_TENSION_WORDS = [
  /突然/, /猛/, /立刻/, /瞬间/, /爆发/, /冲/, /砰/, /轰/,
  /！/, /？！/, /不/, /别/, /快/, /危险/, /小心/,
  /心跳加速/, /紧握/, /屏住呼吸/, /浑身发抖/,
]

const EN_TENSION_WORDS = [
  /suddenly/i, /burst/i, /slammed/i, /screamed/i, /exploded/i,
  /!/, /\?!/, /don't/i, /stop/i, /run/i, /danger/i,
  /heart\s+(?:pounded|raced)/i, /gripped/i, /trembled/i,
]

// ── Climax indicators ──

const ZH_CLIMAX = [
  /终于/, /一切.*真相/, /最后/, /关键时刻/, /转折/,
  /爆发/, /崩塌/, /倒下/, /胜利/, /失败/,
  /大声喊/, /尖叫/, /冲上前/, /拼命/,
]

const EN_CLIMAX = [
  /finally/i, /the truth/i, /at last/i, /turning point/i,
  /collapsed/i, /fell/i, /victory/i, /defeated/i,
  /shouted/i, /screamed/i, /charged/i, /desperate/i,
]

// ── Ending hook indicators ──

const ZH_ENDING_HOOKS = [
  /但是[，。]?$/, /然而[，。]?$/, /可是[，。]?$/,
  /……$/, /——$/, /。{3,}$/,
  /到底/, /究竟/, /为什么/,
  /不知道.*等待/, /即将/, /马上/,
  /门.*打开/, /一个.*身影/, /一封.*信/, /一通.*电话/,
]

const EN_ENDING_HOOKS = [
  /but\s*[.…—]?\s*$/i, /however\s*[.…—]?\s*$/i,
  /\.{3,}\s*$/, /—\s*$/,
  /who\b.*\?/i, /what\b.*\?/i, /why\b.*\?/i,
  /someone/, /a knock/, /a letter/, /a phone call/i,
  /little did\b/i, /if only\b/i,
]

function analyzeStructure(
  text: string,
  opening: string,
  isCJK: boolean,
): ChapterClassification["structure"] {
  // Hook strength: based on tension density in first 20% and absence of fatal errors
  const tensionPatterns = isCJK ? ZH_TENSION_WORDS : EN_TENSION_WORDS
  const openingTensionCount = tensionPatterns.reduce(
    (sum, p) => sum + countMatches(opening, p), 0
  )
  const openingLength = isCJK
    ? [...opening].filter(c => /[\u4e00-\u9fff]/.test(c)).length || 1
    : opening.split(/\s+/).length || 1

  // Tension density per 100 units
  const tensionDensity = (openingTensionCount / openingLength) * 100
  const fatalErrors = detectFatalOpeningErrors(opening, isCJK)
  const fatalPenalty = fatalErrors.length * 25

  let hookStrength = Math.min(100, Math.round(tensionDensity * 15))
  hookStrength = Math.max(0, hookStrength - fatalPenalty)

  // Climax detection: check the last 30% for climax indicators
  const lastPortion = text.substring(Math.floor(text.length * 0.7))
  const climaxPatterns = isCJK ? ZH_CLIMAX : EN_CLIMAX
  const hasClimax = anyMatch(lastPortion, climaxPatterns)

  // Ending hook detection: check the last 10%
  const ending = text.substring(Math.floor(text.length * 0.9))
  const hookPatterns = isCJK ? ZH_ENDING_HOOKS : EN_ENDING_HOOKS
  const hasEndingHook = anyMatch(ending, hookPatterns)

  return { hookStrength, hasClimax, hasEndingHook }
}

// ══════════════════════════════════════════════════════════
// Pacing Analysis
// ══════════════════════════════════════════════════════════

function analyzePacing(
  text: string,
  isCJK: boolean,
): ChapterClassification["pacing"] {
  return {
    tensionCurve: detectTensionCurve(text, isCJK),
    informationDensity: detectInformationDensity(text, isCJK),
  }
}

function detectTensionCurve(text: string, isCJK: boolean): TensionCurve {
  const tensionPatterns = isCJK ? ZH_TENSION_WORDS : EN_TENSION_WORDS

  // Divide text into 4 quarters and measure tension in each
  const quarterLen = Math.floor(text.length / 4) || 1
  const quarters = [
    text.substring(0, quarterLen),
    text.substring(quarterLen, quarterLen * 2),
    text.substring(quarterLen * 2, quarterLen * 3),
    text.substring(quarterLen * 3),
  ]

  const tensionScores = quarters.map(q =>
    tensionPatterns.reduce((sum, p) => sum + countMatches(q, p), 0)
  )

  // Determine curve shape
  const [q1, q2, q3, q4] = tensionScores
  const rising = q1 <= q2 && q2 <= q3 && q3 <= q4 && q4 > q1
  const falling = q1 >= q2 && q2 >= q3 && q3 >= q4 && q1 > q4
  const oscillating = (q1 > q2 && q3 > q2) || (q2 > q1 && q2 > q3) || (q3 > q2 && q3 > q4 && q4 > q1)

  if (rising) return "rising"
  if (falling) return "falling"
  if (oscillating) return "oscillating"
  return "flat"
}

function detectInformationDensity(text: string, isCJK: boolean): InformationDensity {
  // High density indicators: lots of dialogue, short paragraphs, action
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const avgParagraphLength = isCJK
    ? paragraphs.reduce((sum, p) => sum + [...p].filter(c => /[\u4e00-\u9fff]/.test(c)).length, 0) / (paragraphs.length || 1)
    : paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / (paragraphs.length || 1)

  // Dialogue density
  const dialoguePattern = isCJK
    ? /[「"\u201c][^」"\u201d]+[」"\u201d]/g
    : /["'\u201c][^"'\u201d]+["'\u201d]/g
  const dialogueCount = (text.match(dialoguePattern) || []).length
  const dialogueDensity = dialogueCount / (paragraphs.length || 1)

  // Short paragraphs + high dialogue = high density
  const shortParagraphThreshold = isCJK ? 50 : 30
  if (avgParagraphLength < shortParagraphThreshold && dialogueDensity > 0.4) return "high"
  if (avgParagraphLength > (isCJK ? 150 : 80) && dialogueDensity < 0.15) return "low"
  return "medium"
}

// ══════════════════════════════════════════════════════════
// Suspense Level Classification
// ══════════════════════════════════════════════════════════

const ZH_SUSPENSE_SIGNALS: Array<{ level: SuspenseLevel; patterns: RegExp[] }> = [
  {
    level: 1,
    patterns: [/是否/, /难道/, /为什么/, /怎么会/, /或许/, /也许/],
  },
  {
    level: 2,
    patterns: [/接下来/, /即将/, /马上/, /准备好/, /会发生什么/],
  },
  {
    level: 3,
    patterns: [/必须/, /立刻/, /来不及/, /只剩/, /紧急/, /赶快/],
  },
  {
    level: 4,
    patterns: [/死/, /杀/, /血/, /致命/, /生死/, /活不过/],
  },
  {
    level: 5,
    patterns: [/真相/, /一切都是/, /整个世界/, /命运/, /从头到尾/, /终极/],
  },
]

const EN_SUSPENSE_SIGNALS: Array<{ level: SuspenseLevel; patterns: RegExp[] }> = [
  {
    level: 1,
    patterns: [/perhaps/i, /maybe/i, /wonder/i, /could it be/i, /what if/i],
  },
  {
    level: 2,
    patterns: [/about to/i, /soon/i, /any moment/i, /what happens next/i],
  },
  {
    level: 3,
    patterns: [/must/i, /immediately/i, /no time/i, /hurry/i, /urgent/i, /running out/i],
  },
  {
    level: 4,
    patterns: [/die/i, /kill/i, /blood/i, /fatal/i, /life or death/i, /survive/i],
  },
  {
    level: 5,
    patterns: [/truth/i, /everything was/i, /the whole world/i, /fate/i, /all along/i, /ultimate/i],
  },
]

/** Normalize text length to per-1000 unit count */
function getTextLength(text: string, isCJK: boolean): number {
  if (isCJK) {
    return [...text].filter(c => /[\u4e00-\u9fff]/.test(c)).length || 1
  }
  return text.split(/\s+/).filter(w => w.length > 0).length || 1
}

function classifySuspenseLevel(text: string, isCJK: boolean): SuspenseLevel {
  const length = getTextLength(text, isCJK)
  if (length < 50) return 0 // Too short for meaningful suspense classification

  const signals = isCJK ? ZH_SUSPENSE_SIGNALS : EN_SUSPENSE_SIGNALS
  const factor = 1000 / length
  const threshold = 3 // 3+ signals per 1000 units

  let highest: SuspenseLevel = 0

  for (const { level, patterns } of signals) {
    let count = 0
    for (const p of patterns) count += countMatches(text, p)
    const density = count * factor
    if (density >= threshold && level > highest) {
      highest = level
    }
  }

  return highest
}

// ══════════════════════════════════════════════════════════
// Suspense Thread Classification
// ══════════════════════════════════════════════════════════

const ZH_THREAD_SIGNALS: Record<keyof SuspenseThreads, RegExp[]> = {
  main: [/计划/, /任务/, /目标/, /必须找到/, /关键/, /答案/],
  character: [/秘密/, /不能说/, /隐藏/, /内疚/, /选择/, /内心/],
  relationship: [/信任/, /背叛/, /误会/, /分离/, /重逢/, /真心/],
  temporal: [/倒计时/, /截止/, /还剩/, /来不及/, /天亮之前/, /最后期限/],
}

const EN_THREAD_SIGNALS: Record<keyof SuspenseThreads, RegExp[]> = {
  main: [/plan/i, /mission/i, /target/i, /must find/i, /key/i, /answer/i],
  character: [/secret/i, /can't tell/i, /hiding/i, /guilt/i, /choice/i, /inner/i],
  relationship: [/trust/i, /betray/i, /misunderstand/i, /separation/i, /reunion/i, /loyalty/i],
  temporal: [/countdown/i, /deadline/i, /time left/i, /before dawn/i, /last chance/i],
}

function classifySuspenseThreads(text: string, isCJK: boolean): SuspenseThreads {
  const signals = isCJK ? ZH_THREAD_SIGNALS : EN_THREAD_SIGNALS
  const threads: SuspenseThreads = { main: 0, character: 0, relationship: 0, temporal: 0 }

  for (const key of Object.keys(signals) as Array<keyof SuspenseThreads>) {
    for (const p of signals[key]) {
      threads[key] += countMatches(text, p)
    }
  }

  return threads
}

// ══════════════════════════════════════════════════════════
// Cliffhanger Warning Detection
// ══════════════════════════════════════════════════════════

const ZH_FALSE_RESOLUTION = [/原来是/, /竟然只是/, /不过是/, /只是一场/, /虚惊一场/]
const EN_FALSE_RESOLUTION = [/it was just/i, /turned out to be/i, /nothing but/i, /false alarm/i, /only a/i]

const ZH_RESOLUTION_SIGNALS = [/解决/, /拯救/, /出现/, /救了/]
const EN_RESOLUTION_SIGNALS = [/saved/i, /rescued/i, /appeared/i, /solved/i]

function detectCliffhangerWarnings(text: string, isCJK: boolean): CliffhangerWarning[] {
  const warnings: CliffhangerWarning[] = []

  // ── false_cliffhanger ──
  const last20Pct = text.substring(Math.floor(text.length * 0.8))
  const preceding30Pct = text.substring(Math.floor(text.length * 0.5), Math.floor(text.length * 0.8))
  const falsePatterns = isCJK ? ZH_FALSE_RESOLUTION : EN_FALSE_RESOLUTION

  if (anyMatch(last20Pct, falsePatterns)) {
    // Only flag if the preceding section had L3+ suspense
    const precedingSuspense = classifySuspenseLevel(preceding30Pct, isCJK)
    if (precedingSuspense >= 3) {
      warnings.push("false_cliffhanger")
    }
  }

  // ── deus_ex_machina ──
  const splitPoint = Math.floor(text.length * 0.9)
  const first90 = text.substring(0, splitPoint)
  const last10 = text.substring(splitPoint)

  // CJK: match name-like patterns after sentence boundary or dialogue marker
  // (2-3 CJK chars followed by a verb/action indicator)
  const namePattern = isCJK
    ? /(?:^|[。！？；\n」』])[\s]*?([\u4e00-\u9fff]{2,3})(?=[说道想看走跑站坐来去到回叫喊笑哭问答])/gm
    : /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g

  const extractNames = (s: string): Set<string> => {
    const names = new Set<string>()
    if (isCJK) {
      let m: RegExpExecArray | null
      const p = new RegExp(namePattern.source, namePattern.flags)
      while ((m = p.exec(s)) !== null) names.add(m[1])
    } else {
      for (const m of s.match(namePattern) || []) names.add(m)
    }
    return names
  }

  const last10Names = extractNames(last10)
  const first90Names = extractNames(first90)
  const resolutionPatterns = isCJK ? ZH_RESOLUTION_SIGNALS : EN_RESOLUTION_SIGNALS
  const hasResolution = anyMatch(last10, resolutionPatterns)

  if (hasResolution) {
    for (const name of last10Names) {
      if (!first90Names.has(name)) {
        warnings.push("deus_ex_machina")
        break
      }
    }
  }

  // ── overloaded_suspense ──
  const questionPattern = isCJK ? /？/g : /\?/g
  const mysteryPatterns = isCJK
    ? [/到底/, /究竟/, /难道/, /怎么回事/, /为什么/]
    : [/who\b/i, /what\b/i, /why\b/i, /how\b/i, /where\b/i]

  const questionCount = countMatches(text, questionPattern)
  let mysteryCount = 0
  for (const p of mysteryPatterns) mysteryCount += countMatches(text, p)

  const newQuestions = questionCount + mysteryCount

  // Check if any questions are answered (resolution/answer signals)
  const answerPatterns = isCJK
    ? [/原来/, /答案是/, /真相是/, /终于明白/, /恍然大悟/]
    : [/the answer/i, /realized/i, /understood/i, /it turned out/i, /finally knew/i]
  let answeredCount = 0
  for (const p of answerPatterns) answeredCount += countMatches(text, p)

  if (newQuestions >= 4 && answeredCount === 0) {
    warnings.push("overloaded_suspense")
  }

  return warnings
}
