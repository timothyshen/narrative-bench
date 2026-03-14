/**
 * @input  Chinese character names and text content
 * @output Name variations, trait extraction, emotion detection, dialogue extraction
 * @pos    lib/analyzers/langs/zh — Chinese character analysis rules
 */

import type { CharacterLanguageRules } from "../types"

const PHYSICAL_PATTERNS = [
  /([\u4e00-\u9fff]{1,4})(的)?(眼睛|头发|皮肤|身高|体型|脸|嘴|鼻子)/,
  /(高大|矮小|纤瘦|健壮|苗条|壮实|魁梧)/,
]

const PERSONALITY_PATTERNS = [
  /(善良|残忍|勇敢|懦弱|聪明|愚蠢|诚实|狡猾|温柔|暴躁|冷静|焦虑|倔强|内向|外向)/,
]

const PHYSICAL_KEYWORDS = [
  "眼睛", "头发", "皮肤", "身高", "体型", "脸", "嘴", "鼻子",
  "高大", "矮小", "纤瘦", "健壮", "苗条", "壮实", "魁梧",
]

// Attribution verbs (from dialogue-writing.md: 对白归因动词)
// Grouped: neutral → emotional → physical → manner
const ATTRIBUTION_VERBS = [
  // Neutral
  "说", "道", "问", "回答", "答", "答道",
  // Emotional
  "笑道", "叹道", "怒道", "哭道", "冷笑道", "苦笑道", "嘲讽道",
  "惊呼", "低吟", "咕哝", "嘟囔", "嘀咕",
  // Physical manner
  "喊道", "叫道", "喊", "吼道", "低声说", "轻声说", "低语",
  "沉声道", "厉声道", "颤声道",
].join("|")

// Emotion keywords with physical reactions (from character-building.md: 侧面揭示)
// Each emotion includes both internal states AND observable physical tells
const EMOTIONS: Record<string, string[]> = {
  happy: [
    "笑", "高兴", "开心", "愉快", "欢喜", "欣喜", "欣慰",
    "嘴角上扬", "眼睛发亮", "雀跃", "哼着歌",
  ],
  sad: [
    "哭", "泪", "悲伤", "难过", "忧愁", "伤心", "哀",
    "垂下头", "红了眼眶", "沉默", "叹气", "发呆",
  ],
  angry: [
    "怒", "愤怒", "恼", "火", "暴怒", "气愤", "咆哮",
    "握紧拳头", "咬牙", "青筋", "拍桌", "攥紧",
  ],
  fearful: [
    "怕", "恐惧", "害怕", "颤抖", "惊恐", "畏惧",
    "后退", "瞳孔放大", "屏住呼吸", "冷汗", "僵住",
  ],
  nervous: [
    "紧张", "不安", "忐忑", "局促", "慌",
    "反复调整", "来回踱步", "搓手", "坐立不安", "咽了口唾沫",
  ],
  surprised: [
    "惊", "吃惊", "诧异", "愕然", "意外", "震惊",
    "瞪大眼睛", "张大嘴巴", "呆住", "一愣",
  ],
}

const CJK_CHAR = /[\u4e00-\u9fff\u3400-\u4dbf]/

export const zhCharacter: CharacterLanguageRules = {
  getNameVariations(name) {
    const variations = [name]
    const chars = [...name].filter(c => CJK_CHAR.test(c))
    if (chars.length >= 2) {
      variations.push(chars.slice(1).join(""))
      variations.push(chars[0])
      if (chars.length === 3) {
        variations.push(chars[0] + chars[2])
      }
    }
    return variations
  },

  classifyTrait(trait) {
    return PHYSICAL_KEYWORDS.some(k => trait.includes(k)) ? "physical" : "personality"
  },

  extractTraits(text) {
    const traits: Array<{ trait: string; value: string }> = []
    for (const base of [...PHYSICAL_PATTERNS, ...PERSONALITY_PATTERNS]) {
      const pattern = new RegExp(base.source, "g")
      let match
      while ((match = pattern.exec(text)) !== null) {
        traits.push({
          trait: match[2] || "personality",
          value: match[1] || match[0],
        })
      }
    }
    return traits
  },

  detectEmotion(text) {
    let max = 0
    let dominant = "neutral"
    for (const [emotion, keywords] of Object.entries(EMOTIONS)) {
      const count = keywords.filter(k => text.includes(k)).length
      if (count > max) {
        max = count
        dominant = emotion
      }
    }
    return dominant
  },

  extractDialogue(text, namePattern) {
    const dialogues: string[] = []
    const patterns = [
      new RegExp(
        `[「『\u201c]([^「」『』\u201c\u201d]+)[」』\u201d]\\s*${namePattern}\\s*(?:${ATTRIBUTION_VERBS})`,
        "g"
      ),
      new RegExp(
        `${namePattern}\\s*(?:${ATTRIBUTION_VERBS})\\s*[：:，,]?\\s*[「『\u201c]([^「」『』\u201c\u201d]+)[」』\u201d]`,
        "g"
      ),
    ]
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) dialogues.push(match[1])
      }
    }
    return dialogues
  },

  formalWords: ["然而", "因此", "确实", "此外", "尽管", "倘若", "诸位"],
  casualWords: ["嗯", "哦", "啊", "呢", "吧", "嘛", "哎", "喂", "咋"],

  buildWhitelistEntries(entityName) {
    const variations = this.getNameVariations(entityName)
    const entries = [...variations]
    for (const v of variations) {
      const chars = [...v].filter(c => CJK_CHAR.test(c))
      for (let i = 0; i < chars.length - 1; i++) {
        entries.push(chars[i] + chars[i + 1])
      }
    }
    return entries
  },
}
