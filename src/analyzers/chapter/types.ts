/**
 * @input  chapter-guide.md taxonomy
 * @output Type definitions for chapter classification
 * @pos    lib/analyzers/chapter — types for chapter classifier
 */

// ── Chapter Type (4 types from chapter-guide.md §章节类型分类) ──

export type ChapterType =
  | "plot_advancing"       // 情节推进章：推动主线剧情发展
  | "character_deepening"  // 人物深化章：揭示人物背景、动机、内心冲突
  | "atmosphere_building"  // 氛围营造章：建立特定情绪或紧张感
  | "transition"           // 过渡衔接章：连接两个重大事件

// ── Opening Technique (10 techniques from chapter-guide.md §十种强力开头技巧) ──

export type OpeningTechnique =
  | "in_media_res"         // 行动中开场：直接从冲突/动作的高潮点开始
  | "anomaly"              // 反常情境：不符合常理的场景
  | "shocking_dialogue"    // 震撼对话：惊人的对话开场
  | "countdown"            // 倒计时开场：从时间压力开始
  | "discovery"            // 重大发现：发现关键线索/真相
  | "crisis"               // 危机时刻：角色面临最大危机
  | "mystery"              // 谜团浮现：无法解释的现象
  | "betrayal"             // 背叛开场：背叛/信任崩塌
  | "dilemma"              // 重大选择：艰难决定
  | "flash_forward"        // 结局预告：从未来的关键时刻开始
  | "unknown"              // 未识别

// ── Fatal Opening Errors (6 errors from chapter-guide.md §开头致命错误) ──

export type FatalOpeningError =
  | "weather_description"  // 天气描写："那天天气晴朗，万里无云..."
  | "daily_routine"        // 日常流程："李明醒来，刷牙洗脸，吃早餐..."
  | "recap"                // 回顾上章："上一章我们说到..."
  | "slow_exposition"      // 缓慢铺垫："先介绍一下这个城市的背景..."
  | "bland_dialogue"       // 平淡对话："你好，你好吗？我很好。"
  | "over_explanation"     // 过度解释："这是因为，所以，然后..."

// ── Pacing (from chapter-guide.md §章节节奏控制) ──

export type TensionCurve =
  | "rising"       // 持续上升
  | "falling"      // 持续下降
  | "flat"         // 平坦
  | "oscillating"  // 紧张→缓解→新紧张→更紧张

export type InformationDensity = "high" | "medium" | "low"

// ── Suspense (from hook-techniques.md) ──

export type SuspenseLevel = 0 | 1 | 2 | 3 | 4 | 5
// 0 = no suspense, 1 = curiosity, 2 = anticipation, 3 = urgency, 4 = survival, 5 = existential

export interface SuspenseThreads {
  /** Main plot suspense signals */
  main: number
  /** Character-internal suspense (secrets, dilemmas) */
  character: number
  /** Relationship tension signals */
  relationship: number
  /** Time pressure signals */
  temporal: number
}

export type CliffhangerWarning =
  | "false_cliffhanger"     // "原来只是误会" — built tension that resolves trivially
  | "deus_ex_machina"       // Last 10% introduces never-mentioned rescue element
  | "overloaded_suspense"   // 4+ new questions without answering any old ones

// ── Classification Result ──

export interface ChapterClassification {
  /** Primary chapter type */
  chapterType: ChapterType
  /** Confidence score for type classification (0–1) */
  chapterTypeConfidence: number
  /** Detected opening technique */
  openingTechnique: OpeningTechnique
  /** Fatal opening errors found in the first 20% */
  openingErrors: FatalOpeningError[]
  /** Structure assessment (from chapter-guide.md §标准章节结构) */
  structure: {
    /** Opening hook strength (0–100) */
    hookStrength: number
    /** Whether a clear climax moment was detected */
    hasClimax: boolean
    /** Whether the ending leaves a hook for the next chapter */
    hasEndingHook: boolean
  }
  /** Pacing assessment (from chapter-guide.md §章节节奏控制) */
  pacing: {
    tensionCurve: TensionCurve
    informationDensity: InformationDensity
  }
  /** Suspense strength level 0-5 (from hook-techniques.md) */
  suspenseLevel: SuspenseLevel
  /** Multi-thread suspense counts by category */
  suspenseThreads: SuspenseThreads
  /** Structural warnings about hook quality */
  cliffhangerWarnings: CliffhangerWarning[]
}

// ── Classifier Signal (internal scoring) ──

export interface TypeSignals {
  plot_advancing: number
  character_deepening: number
  atmosphere_building: number
  transition: number
}
