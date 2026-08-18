/**
 * Fixture Loader
 *
 * Loads and validates benchmark fixtures from the fixtures/ directory.
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"
import type {
  GuardianFixture,
  ExtractionFixture,
  AnalysisFixture,
  ContextRetrievalFixture,
  EvaluatorType,
} from "../types.js"

const FIXTURES_DIR = join(import.meta.dirname ?? __dirname, "..", "..", "fixtures")

type FixtureMap = {
  guardian: GuardianFixture
  extraction: ExtractionFixture
  analysis: AnalysisFixture
  "context-retrieval": ContextRetrievalFixture
  "style-prose": AnalysisFixture
  "chapter-suspense": AnalysisFixture
  "plot-structure": AnalysisFixture
}

/** Map evaluator names to their fixture directory names. */
const FIXTURE_DIR_MAP: Record<string, string> = {
  "style-prose": "analysis",
  "chapter-suspense": "analysis",
  "plot-structure": "analysis",
}

/**
 * Load all fixtures for a given evaluator type.
 */
export function loadFixtures<T extends keyof FixtureMap>(
  evaluator: T,
  tags?: string[]
): FixtureMap[T][] {
  const dirName = FIXTURE_DIR_MAP[evaluator] ?? evaluator
  const dir = join(FIXTURES_DIR, dirName)
  let files: string[]

  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    console.warn(`[FixtureLoader] No fixtures directory for ${evaluator}`)
    return []
  }

  const fixtures: FixtureMap[T][] = []
  // Some fixtures are gold data for an evaluation path OTHER than the local
  // evaluators, and loading them here would score a detector this repo cannot
  // run — recall collapses to zero and drags the suite score with it. Enforce
  // the exclusion at this choke point, not per-evaluator, unless the caller
  // asked for that tag explicitly.
  //
  //   llm-detector  — gold for the LLM-detector eval path (needs API budget).
  //   no-local-impl — the product ships the detector and its bench harness has
  //                   an adapter, but this repo never ported the implementation.
  //                   Drop the tag when the port lands; the name states the
  //                   condition that makes it necessary, so it expires by itself.
  const NON_LOCAL_TAGS = ["llm-detector", "no-local-impl"] as const
  const requested = new Set(tags ?? [])
  const excludedByTag = new Map<string, number>()

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8")
      const fixture = JSON.parse(raw) as FixtureMap[T]
      const fixtureTags = (fixture as { tags?: string[] }).tags || []

      const nonLocal = NON_LOCAL_TAGS.find(
        (t) => fixtureTags.includes(t) && !requested.has(t)
      )
      if (nonLocal) {
        excludedByTag.set(nonLocal, (excludedByTag.get(nonLocal) ?? 0) + 1)
        continue
      }

      if (tags && tags.length > 0) {
        const hasMatch = tags.some((t) => fixtureTags.includes(t))
        if (!hasMatch) continue
      }

      fixtures.push(fixture)
    } catch (e) {
      console.error(`[FixtureLoader] Failed to load ${file}:`, e)
    }
  }

  for (const [tag, n] of excludedByTag) {
    console.log(
      `[FixtureLoader] Excluded ${n} ${tag} fixture(s) — gold for another eval path (pass --tags ${tag} to load them)`
    )
  }

  return fixtures
}

/**
 * Load a single fixture by ID across all evaluator directories.
 */
export function loadFixtureById(
  evaluator: keyof FixtureMap,
  id: string
): FixtureMap[typeof evaluator] | null {
  const all = loadFixtures(evaluator)
  return (all.find((f) => (f as { id: string }).id === id) as FixtureMap[typeof evaluator]) ?? null
}

/**
 * List all available fixture IDs for an evaluator.
 */
export function listFixtureIds(evaluator: keyof FixtureMap): string[] {
  return loadFixtures(evaluator).map((f) => (f as { id: string }).id)
}

/**
 * List all evaluators that have fixtures.
 */
export function listEvaluators(): EvaluatorType[] {
  const evaluators: EvaluatorType[] = [
    "guardian",
    "extraction",
    "analysis",
    "context-retrieval",
    "style-prose",
    "chapter-suspense",
    "plot-structure",
  ]

  return evaluators.filter((e) => {
    try {
      const dirName = FIXTURE_DIR_MAP[e] ?? e
      const dir = join(FIXTURES_DIR, dirName)
      return readdirSync(dir).some((f) => f.endsWith(".json"))
    } catch {
      return false
    }
  })
}
