/**
 * @input  Language-specific rules and i18n strings
 * @output LanguageModule interface — the core contract for all language modules
 * @pos    lib/analyzers/langs — defines what each language must implement
 */

// ── Top-Level Module ─────────────────────────

export interface LanguageModule {
  /** Language identifier (e.g. "en", "zh") */
  locale: string
  /** Detect whether text belongs to this language */
  detect(text: string): boolean

  character: CharacterLanguageRules
  style: StyleLanguageRules
  plot: PlotLanguageRules
  i18n: AnalyzerI18n
}

// ── Character Rules ──────────────────────────

export interface CharacterLanguageRules {
  /** Generate name variations (e.g. "王小明" → ["王小明", "小明", "王"]) */
  getNameVariations(name: string): string[]
  /** Classify a trait keyword as physical or personality */
  classifyTrait(trait: string): "physical" | "personality"
  /** Extract traits from surrounding text context */
  extractTraits(text: string): Array<{ trait: string; value: string }>
  /** Detect dominant emotion from text context */
  detectEmotion(text: string): string
  /** Extract character dialogue given a name regex pattern */
  extractDialogue(text: string, namePattern: string): string[]
  /** Formal word indicators for dialogue tone analysis */
  formalWords: string[]
  /** Casual word indicators for dialogue tone analysis */
  casualWords: string[]
  /** Build whitelist entries for an entity name (full name + variations + bigrams) */
  buildWhitelistEntries(entityName: string): string[]
}

// ── Style Rules ──────────────────────────────

export interface StyleLanguageRules {
  /** Stop words to exclude from frequency analysis */
  stopWords: Set<string>
  /** Detect passive voice constructions */
  detectPassiveVoice(text: string): Array<{ location: string }>
  /** Detect overused words, excluding whitelisted terms */
  detectOverusedWords(text: string, whitelist?: Set<string>): Array<{ word: string; count: number }>
  /** Detect repetitive phrasing in consecutive sentences */
  detectRepetition(text: string): Array<{ location: string }>
  /** Detect weak or generic verbs */
  detectWeakVerbs(text: string): Array<{ location: string }>
  /** Language-specific custom issues (e.g. Chinese particle density) */
  detectCustomIssues?(text: string): Array<{ type: string; severity: string; location: string; suggestion: string }>
  /** Count pronoun usage by person */
  countPronouns(text: string): { first: number; second: number; third: number }
  /** Detect tense (English) or aspect (Chinese) */
  detectTense(text: string): "past" | "present" | "mixed"
  /** Detect formal vs casual tone */
  detectTone(text: string): "formal" | "casual" | "mixed"
  /** Split text into word-level tokens */
  splitWords(text: string): string[]
}

// ── Plot Rules ───────────────────────────────

export interface PlotLanguageRules {
  /** Patterns that suggest significant story elements (Chekov's gun setups) */
  setupPatterns: RegExp[]
  /** Pairs of contradicting descriptors for conflict detection */
  contradictionPairs: Array<[RegExp, RegExp, string]>
}

// ── I18n Strings ─────────────────────────────

export interface AnalyzerI18n {
  // Guardian issue titles (keyed by issue type)
  styleIssueTitle: Record<string, string>
  plotHoleTitle: Record<string, string>

  // Character inconsistency messages
  characterInconsistency: (name: string, type: string) => string
  characterDescription: (trait: string) => string
  characterSuggestion: (chapters: string) => string

  // Style detector suggestions
  passiveVoiceSuggestion: string
  overusedWordSuggestion: (word: string) => string
  overusedWordLocation: (word: string, count: number) => string
  repetitionSuggestion: string
  weakVerbSuggestion: string

  // Plot detector messages
  unresolvedDesc: (title: string) => string
  unresolvedSugg: string
  timelineSugg: string
  missingSetupDesc: (name: string) => string
  missingSetupSugg: string
}
