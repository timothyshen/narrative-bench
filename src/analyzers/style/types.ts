/**
 * Type definitions for writing style analysis
 */

/** Inlined from vector-helpers — semantic search result */
export interface SemanticMatch {
  id: string
  title: string
  content: string
  similarity: number
  type: string
  chapterId?: string
}

export interface WritingStyleFingerprint {
  averageSentenceLength: number
  averageParagraphLength: number
  vocabularyDiversity: number
  commonWords: Array<{ word: string; count: number }>
  sentenceStructure: {
    simple: number
    compound: number
    complex: number
  }
  tone: "formal" | "casual" | "mixed"
  pov: "first" | "second" | "third" | "mixed"
  tense: "past" | "present" | "mixed"
}

export type StyleIssueType =
  | "passive_voice"
  | "overused_word"
  | "repetition"
  | "inconsistent_tense"
  | "weak_verb"
  | "particle_overuse"
  | "structure_repetition"
  | "unattributed_dialogue"
  | "temporal_confusion"
  | "pov_leak"
  | "punctuation"
  | "dialogue_order"
  | "weasel_words"
  | "cliche"
  | "there_is_starter"
  | "lexical_illusion"
  | "adverb_dialogue_tag"
  | "info_dump_dialogue"
  | "purposeless_dialogue"
  | "verbose_dialogue"
  | "sentence_monotony"
  | "paragraph_wall"
  | "modifier_chain"
  | "telling_not_showing"
  | "background_overload"

export interface StyleIssue {
  type: StyleIssueType
  severity: "low" | "medium" | "high"
  chapterId: string
  location: string
  suggestion: string
}

// ============================================================
// Language-specific style detector interface
// ============================================================

export interface StyleDetection {
  location: string
  position?: { start: number; end: number }
}

export interface OverusedWordDetection {
  word: string
  count: number
}

/**
 * Strategy interface for language-specific style analysis.
 * Each language implements its own detection rules.
 */
export interface LanguageStyleDetector {
  readonly locale: string
  readonly name: string

  detectPassiveVoice(text: string): StyleDetection[]
  detectOverusedWords(text: string, properNouns?: Set<string>): OverusedWordDetection[]
  detectRepetition(text: string): StyleDetection[]
  detectWeakVerbs(text: string): StyleDetection[]
  /** Language-specific detectors not shared across all languages */
  detectCustomIssues?(text: string): Array<Omit<StyleIssue, "chapterId">>
}

export interface StyleConsistency {
  overall: number // 0-100
  sentenceLength: number
  vocabulary: number
  tone: number
  pov: number
  tense: number
}

/**
 * Style drift result with semantic analysis
 */
export interface VectorStyleDrift {
  /** Chapter showing drift */
  chapterId: string;
  /** Chapter title */
  chapterTitle: string;
  /** Similarity to baseline (0-1) */
  similarity: number;
  /** Drift severity */
  drift: 'significant' | 'moderate' | 'minor';
  /** Specific areas of drift */
  driftAreas: string[];
}

/**
 * Semantic redundancy result
 */
export interface SemanticRedundancy {
  /** Content that appears redundant */
  content: string;
  /** Where it appears */
  sourceChapterId: string;
  /** Where similar content exists */
  matches: SemanticMatch[];
  /** Redundancy severity */
  severity: 'high' | 'medium' | 'low';
}

/**
 * Vector-enhanced style consistency result
 */
export interface VectorStyleConsistency extends StyleConsistency {
  /** Semantic style drift between chapters */
  semanticDrift: VectorStyleDrift[];
  /** Overall semantic consistency (0-100) */
  semanticConsistency: number;
}
