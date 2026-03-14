/**
 * @input  None (static data)
 * @output All Chinese-language UI strings for analyzer issues
 * @pos    lib/analyzers/langs/zh — Chinese i18n strings
 */

import type { AnalyzerI18n } from "../types"

export const zhI18n: AnalyzerI18n = {
  styleIssueTitle: {
    passive_voice: "检测到被动语态",
    overused_word: "词汇过度使用",
    repetition: "重复表述",
    inconsistent_tense: "时态不一致",
    weak_verb: "弱动词",
    particle_overuse: "虚词过度使用",
    structure_repetition: "句式重复",
    punctuation: "标点问题",
    dialogue_order: "对白顺序",
    weasel_words: "模糊词语",
    cliche: "陈词滥调",
    there_is_starter: "弱句式开头",
    lexical_illusion: "重复词",
    _default: "文风问题",
  },

  plotHoleTitle: {
    unresolved: "未解决的情节线索",
    contradiction: "情节矛盾",
    missing_setup: "缺少铺垫",
    timeline_conflict: "时间线冲突",
    _default: "情节问题",
  },

  characterInconsistency: (name, type) => `${name}：${type} 不一致`,
  characterDescription: (trait) => `「${trait}」在各章节中存在矛盾`,
  characterSuggestion: (chapters) => `检查 ${chapters} 以确保一致性`,

  passiveVoiceSuggestion: "考虑使用主动语态使文字更有力",
  overusedWordSuggestion: (word) => `考虑为「${word}」使用同义词`,
  overusedWordLocation: (word, count) => `「${word}」使用了 ${count} 次`,
  repetitionSuggestion: "避免重复相同的表述",
  weakVerbSuggestion: "考虑使用更强、更具体的动词",

  unresolvedDesc: (title) => `事件「${title}」被引入但未解决`,
  unresolvedSugg: "考虑添加解决方案或移除该事件",
  timelineSugg: "检查这些事件的时间线顺序",
  missingSetupDesc: (name) => `角色「${name}」出现时缺少介绍`,
  missingSetupSugg: "在更早的章节中添加角色介绍",
}
