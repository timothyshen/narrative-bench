/**
 * @input  None (static data)
 * @output All English-language UI strings for analyzer issues
 * @pos    lib/analyzers/langs/en — English i18n strings
 */

import type { AnalyzerI18n } from "../types"

export const enI18n: AnalyzerI18n = {
  styleIssueTitle: {
    passive_voice: "Passive voice detected",
    overused_word: "Overused word",
    repetition: "Repetitive phrasing",
    inconsistent_tense: "Inconsistent tense",
    weak_verb: "Weak verb",
    particle_overuse: "Particle overuse",
    structure_repetition: "Repetitive sentence structure",
    punctuation: "Punctuation issue",
    dialogue_order: "Dialogue ordering",
    weasel_words: "Weasel words",
    cliche: "Cliché",
    there_is_starter: "Weak sentence opener",
    lexical_illusion: "Repeated word",
    _default: "Style issue",
  },

  plotHoleTitle: {
    unresolved: "Unresolved plot thread",
    contradiction: "Plot contradiction",
    missing_setup: "Missing setup",
    timeline_conflict: "Timeline conflict",
    _default: "Plot issue",
  },

  characterInconsistency: (name, type) => `${name}: ${type} inconsistency`,
  characterDescription: (trait) => `"${trait}" contradicts across chapters`,
  characterSuggestion: (chapters) => `Review ${chapters} for consistency`,

  passiveVoiceSuggestion: "Consider using active voice for stronger writing",
  overusedWordSuggestion: (word) => `Consider using synonyms for "${word}"`,
  overusedWordLocation: (word, count) => `"${word}" used ${count} times`,
  repetitionSuggestion: "Avoid repeating the same phrasing",
  weakVerbSuggestion: "Consider using stronger, more specific verbs",

  unresolvedDesc: (title) => `Event "${title}" is introduced but never resolved`,
  unresolvedSugg: "Consider adding a resolution or removing the event",
  timelineSugg: "Review the timeline order of these events",
  missingSetupDesc: (name) => `Character "${name}" appears without introduction`,
  missingSetupSugg: "Add character introduction in an earlier chapter",
}
