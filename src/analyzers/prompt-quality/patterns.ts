/**
 * Quality Evaluation Patterns
 *
 * AI-isms, show-don't-tell violations, and repetition detection constants.
 * Bilingual: English + Chinese.
 */

// =============================================================================
// AI-ISMS: Phrases that sound artificial or overly formal
// =============================================================================

export const AI_ISMS_EN = [
  "furthermore",
  "moreover",
  "it is worth noting",
  "it's worth noting",
  "it should be noted",
  "needless to say",
  "in conclusion",
  "in summary",
  "as mentioned earlier",
  "as previously stated",
  "it is important to note",
  "it is essential to",
  "one could argue",
  "it goes without saying",
  "at the end of the day",
  "last but not least",
  "in other words",
  "that being said",
  "having said that",
  "with that in mind",
  "by the same token",
  "for all intents and purposes",
  "all things considered",
]

export const AI_ISMS_ZH = [
  "此外",
  "然而",
  "值得注意的是",
  "需要指出的是",
  "众所周知",
  "不言而喻",
  "综上所述",
  "总而言之",
  "换言之",
  "换句话说",
  "由此可见",
  "与此同时",
  "毫无疑问",
  "不可否认",
  "显而易见",
  "事实上",
  "实际上",
  "总的来说",
  "归根结底",
  "从某种程度上说",
]

// =============================================================================
// SHOW-DON'T-TELL VIOLATIONS: Emotional adjectives without action
// =============================================================================

export const TELLING_PATTERNS_EN = [
  /\bfelt\s+(very\s+)?(happy|sad|angry|scared|excited|nervous|anxious|worried|relieved|frustrated|annoyed)\b/gi,
  /\bwas\s+(very\s+)?(happy|sad|angry|scared|excited|nervous|anxious|worried|relieved|frustrated|annoyed)\b/gi,
  /\bseemed\s+(very\s+)?(happy|sad|angry|scared|excited|nervous|anxious|worried|relieved|frustrated|annoyed)\b/gi,
  /\blooked\s+(very\s+)?(happy|sad|angry|scared|excited|nervous|anxious|worried|relieved|frustrated|annoyed)\b/gi,
  /\b(he|she|they)\s+felt\s+a\s+(surge|wave|rush)\s+of\s+\w+\b/gi,
]

export const TELLING_PATTERNS_ZH = [
  /感到(非常|很|十分)?(高兴|伤心|愤怒|害怕|兴奋|紧张|焦虑|担心|放心|沮丧|恼怒)/g,
  /(他|她|他们)心里(非常|很|十分)?(高兴|伤心|愤怒|害怕|兴奋|紧张|焦虑|担心)/g,
  /一阵(高兴|伤心|愤怒|害怕|兴奋|紧张|焦虑|担心|激动)涌上心头/g,
]

// =============================================================================
// REPETITION DETECTION
// =============================================================================

export const MIN_PHRASE_LENGTH = 4
export const REPETITION_THRESHOLD = 2
