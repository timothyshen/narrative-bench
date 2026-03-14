/**
 * Language-agnostic text utilities (sentence splitting, CJK detection)
 */

/** Detect if text is primarily CJK (>30% CJK characters) */
export function isCJKText(text: string): boolean {
  if (!text || text.length === 0) return false
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g)
  return cjk ? cjk.length / text.length > 0.3 : false
}

/** Split text into sentences (handles both English and CJK punctuation) */
export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?\u3002\uff01\uff1f\u2026]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/** Convert HTML to plain text */
export { htmlToPlainText } from "../utils.js"
