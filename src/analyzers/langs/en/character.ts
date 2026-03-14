/**
 * @input  English character names and text content
 * @output Name variations, trait extraction, emotion detection, dialogue extraction
 * @pos    lib/analyzers/langs/en — English character analysis rules
 */

import type { CharacterLanguageRules } from "../types"

const PHYSICAL_PATTERNS = [
  /(bright|dark|pale|deep|light|long|short|curly|straight|thick|thin|red|blue|green|brown|black|white|golden|silver|grey|gray)\s+(eyes?|hair|skin|height|build)/gi,
  /(tall|short|thin|muscular|slender|stocky)/gi,
]

const PERSONALITY_PATTERNS = [
  /(kind|cruel|brave|cowardly|intelligent|foolish|honest|deceitful|shy|bold|calm|anxious|stubborn|gentle)/gi,
]

const PHYSICAL_KEYWORDS = [
  "eye", "hair", "skin", "height", "build", "tall", "short",
]

const EMOTIONS: Record<string, string[]> = {
  happy: ["smiled", "laughed", "grinned", "cheerful", "joyful"],
  sad: ["cried", "wept", "tears", "sorrowful", "melancholy"],
  angry: ["shouted", "yelled", "furious", "enraged", "angry"],
  fearful: ["trembled", "scared", "afraid", "terrified", "frightened"],
}

const ATTRIBUTION_VERBS = "said|asked|replied|whispered|shouted"

export const enCharacter: CharacterLanguageRules = {
  getNameVariations(name) {
    const variations = [name]
    const parts = name.split(" ")
    if (parts.length > 1) {
      variations.push(parts[0])
      variations.push(parts[parts.length - 1])
    }
    return variations
  },

  classifyTrait(trait) {
    return PHYSICAL_KEYWORDS.some(k => trait.toLowerCase().includes(k))
      ? "physical"
      : "personality"
  },

  extractTraits(text) {
    const traits: Array<{ trait: string; value: string }> = []
    for (const base of PHYSICAL_PATTERNS) {
      const pattern = new RegExp(base.source, "gi")
      let match
      while ((match = pattern.exec(text)) !== null) {
        traits.push({
          trait: match[2] || "physical",
          value: match[1] || match[0],
        })
      }
    }
    for (const base of PERSONALITY_PATTERNS) {
      const pattern = new RegExp(base.source, "gi")
      let match
      while ((match = pattern.exec(text)) !== null) {
        traits.push({
          trait: "personality",
          value: match[1] || match[0],
        })
      }
    }
    return traits
  },

  detectEmotion(text) {
    const lower = text.toLowerCase()
    let max = 0
    let dominant = "neutral"
    for (const [emotion, keywords] of Object.entries(EMOTIONS)) {
      const count = keywords.filter(k => lower.includes(k)).length
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
        `["']([^"']+)["']\\s+(?:${ATTRIBUTION_VERBS})\\s+${namePattern}`,
        "gi"
      ),
      new RegExp(
        `${namePattern}\\s+(?:${ATTRIBUTION_VERBS})[,:.]?\\s+["']([^"']+)["']`,
        "gi"
      ),
    ]
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) dialogues.push(match[1])
      }
    }
    return dialogues
  },

  formalWords: ["indeed", "certainly", "perhaps", "therefore", "however", "moreover", "furthermore", "nevertheless"],
  casualWords: ["yeah", "nah", "gonna", "wanna", "ain't", "cool", "awesome"],

  buildWhitelistEntries(entityName) {
    return entityName.toLowerCase().split(/\s+/).filter(w => w.length > 4)
  },
}
