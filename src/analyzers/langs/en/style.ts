/**
 * @input  English plain text content
 * @output Style detections: passive voice, overused words, repetition, weak verbs, pronouns, tense, tone
 * @pos    lib/analyzers/langs/en — English style analysis rules
 */

import type { StyleLanguageRules } from "../types"

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "dare",
  "it", "its", "he", "she", "his", "her", "they", "them", "their",
  "this", "that", "these", "those", "not", "no", "nor", "so", "if",
  "then", "than", "too", "very", "just", "about", "into",
])

const PASSIVE_PATTERN = /\b(is|are|was|were|been|be)\s+\w+ed\b/gi

const WEAK_VERBS = [
  "is", "are", "was", "were", "has", "have", "had",
  "get", "got", "make", "made",
]

const FORMAL_WORDS = [
  "indeed", "certainly", "perhaps", "therefore", "however",
  "moreover", "furthermore", "nevertheless",
]

const CASUAL_WORDS = [
  "yeah", "nah", "gonna", "wanna", "ain't", "cool", "awesome",
]

export const enStyle: StyleLanguageRules = {
  stopWords: STOP_WORDS,

  detectPassiveVoice(text) {
    const pattern = new RegExp(PASSIVE_PATTERN.source, "gi")
    const locations: Array<{ location: string }> = []
    for (const match of text.matchAll(pattern)) {
      const start = Math.max(0, match.index! - 20)
      const end = Math.min(text.length, match.index! + match[0].length + 20)
      locations.push({ location: text.substring(start, end) })
    }
    return locations.slice(0, 3)
  },

  detectOverusedWords(text, whitelist) {
    const words = text.toLowerCase().split(/\s+/)
    const counts = new Map<string, number>()
    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, "")
      if (cleaned.length > 4 && !STOP_WORDS.has(cleaned)) {
        counts.set(cleaned, (counts.get(cleaned) || 0) + 1)
      }
    }
    // Dynamic threshold: scale with text length (min 5 occurrences)
    const threshold = Math.max(5, Math.floor(words.length / 200))
    return Array.from(counts.entries())
      .filter(([word, count]) => count >= threshold && !whitelist?.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ word, count }))
  },

  detectRepetition(text) {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0)
    const repetitions: Array<{ location: string }> = []

    for (let i = 0; i < sentences.length - 1; i++) {
      const words = sentences[i].toLowerCase().split(/\s+/)
      const nextLower = sentences[i + 1].toLowerCase()
      const nextWords = nextLower.split(/\s+/)

      // Calculate shared prefix length between consecutive sentences.
      // Any 3-word phrase falling entirely within the shared prefix is anaphora
      // (intentional rhetorical repetition like "He kept his... He kept his..."
      // or "It was designed so that... It was designed so that...").
      let sharedPrefixLen = 0
      while (sharedPrefixLen < words.length && sharedPrefixLen < nextWords.length
        && words[sharedPrefixLen] === nextWords[sharedPrefixLen]) {
        sharedPrefixLen++
      }

      for (let j = 0; j < words.length - 2; j++) {
        const phrase = `${words[j]} ${words[j + 1]} ${words[j + 2]}`
        if (!nextLower.includes(phrase)) continue
        // Skip phrases entirely within the anaphoric shared prefix
        if (j + 2 < sharedPrefixLen) continue

        repetitions.push({ location: `"${phrase}" repeated in consecutive sentences` })
      }
    }
    return repetitions.slice(0, 5)
  },

  detectWeakVerbs(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0)
    const totalWords = words.length
    // Only flag when weak verb density exceeds 4% of total words.
    // Literary fiction (especially 3rd-person past tense) legitimately uses
    // was/were/had at higher density than non-fiction. A 4% threshold avoids
    // flooding the report with noise while still catching egregious overuse.
    const threshold = Math.max(15, Math.floor(totalWords * 0.04))

    const pattern = new RegExp(`\\b(${WEAK_VERBS.join("|")})\\b`, "gi")
    const allMatches = [...text.matchAll(pattern)]

    if (allMatches.length < threshold) return []

    // Cap at 3 examples to avoid cluttering the guardian report
    const locations: Array<{ location: string }> = []
    for (const match of allMatches.slice(0, 3)) {
      const start = Math.max(0, match.index! - 15)
      const end = Math.min(text.length, match.index! + match[0].length + 15)
      locations.push({ location: text.substring(start, end) })
    }
    return locations
  },

  countPronouns(text) {
    const count = (pattern: RegExp) => (text.match(pattern) || []).length
    return {
      first: count(/\b(I|me|my|mine|we|us|our|ours)\b/gi),
      second: count(/\b(you|your|yours)\b/gi),
      third: count(/\b(he|she|it|they|him|her|them|his|hers|its|their|theirs)\b/gi),
    }
  },

  detectTense(text) {
    const past = (text.match(/\b(was|were|had|did|went|came|saw|said)\b/gi) || []).length
    const present = (text.match(/\b(is|are|has|does|go|come|see|say)\b/gi) || []).length
    const total = past + present
    if (total === 0) return "past"
    if (past / total > 0.7) return "past"
    if (present / total > 0.7) return "present"
    return "mixed"
  },

  detectTone(text) {
    const lower = text.toLowerCase()
    const f = FORMAL_WORDS.filter(w => lower.includes(w)).length
    const c = CASUAL_WORDS.filter(w => lower.includes(w)).length
    if (f > c * 2) return "formal"
    if (c > f * 2) return "casual"
    return "mixed"
  },

  splitWords(text) {
    return text.toLowerCase().split(/\s+/).filter(w => w.length > 0)
  },
}
