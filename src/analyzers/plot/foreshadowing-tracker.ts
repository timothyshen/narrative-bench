/**
 * Foreshadowing Tracker
 *
 * @input  Chapter[] from editor
 * @output ForeshadowingEcho[] — elements introduced and echoed across chapters
 * @pos    lib/analyzers/plot — Narrative element echo detection
 */

import type { Chapter } from "../../types.js"
import { htmlToPlainText } from "../utils.js"
import { isCJKText } from "../langs/text-utils"
import type { ForeshadowingEcho } from "./types"

// ── Setup patterns — things characters notice/pick up ──

function extractElements(
  plainText: string
): string[] {
  const elements: string[] = []
  const cjk = isCJKText(plainText)
  const pattern = cjk
    ? /(?:注意到|看到|发现|拿起|留下)([^。，！？；\s]{2,10})/g
    : /(?:noticed|saw|found|picked up|left behind)\s+(?:a|an|the)\s+(\w+(?:\s+\w+)?)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(plainText)) !== null) {
    // Trim whitespace and CJK punctuation from the captured element
    const el = match[1]
      .trim()
      .replace(/[。，、！？；：""''《》【】（）\s]+$/g, "")
      .replace(/^[。，、！？；：""''《》【】（）\s]+/g, "")
    if (el.length >= 2) {
      elements.push(el)
    }
  }

  return elements
}

function findContext(content: string, element: string): string {
  const idx = content.toLowerCase().indexOf(element.toLowerCase())
  if (idx === -1) return ""
  const start = Math.max(0, idx - 50)
  const end = Math.min(content.length, idx + element.length + 50)
  return content.substring(start, end)
}

/**
 * Track foreshadowing elements that are introduced and echoed across chapters.
 */
export function trackForeshadowing(chapters: Chapter[]): ForeshadowingEcho[] {
  if (chapters.length < 2) return []

  const plainChapters = chapters.map(c => ({
    ...c,
    plainContent: htmlToPlainText(c.content),
  }))

  const results: ForeshadowingEcho[] = []
  const seen = new Set<string>()

  for (let i = 0; i < plainChapters.length; i++) {
    const chapter = plainChapters[i]
    const elements = extractElements(chapter.plainContent)

    for (const element of elements) {
      const key = element.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      // Search subsequent chapters for echoes
      const echoes: ForeshadowingEcho["echoes"] = []
      for (let j = i + 1; j < plainChapters.length; j++) {
        const later = plainChapters[j]
        if (later.plainContent.toLowerCase().includes(key)) {
          echoes.push({
            chapterId: later.id,
            chapterTitle: later.title,
            context: findContext(later.plainContent, element),
          })
        }
      }

      // Only include elements with at least 1 echo
      if (echoes.length === 0) continue

      const lastEchoIndex = plainChapters.findIndex(
        c => c.id === echoes[echoes.length - 1].chapterId
      )
      const payoffThreshold = Math.floor(plainChapters.length * 0.75)
      const hasPayoff = lastEchoIndex >= payoffThreshold

      results.push({
        element,
        introChapterId: chapter.id,
        introChapterTitle: chapter.title,
        echoes,
        hasPayoff,
        gapSize: lastEchoIndex - i,
      })
    }
  }

  return results
}
