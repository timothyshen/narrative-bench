/**
 * Eval Dataset Loader
 *
 * Generic interface for loading eval cases (prompt + accepted text pairs).
 * Provides a JSON file loader out of the box. Host projects can implement
 * their own loader (e.g. from a database) using the EvalCase interface.
 *
 * @input  JSON file path or custom data source
 * @output Array of eval cases for prompt regression testing
 */

import { readFileSync } from "fs"

export interface EvalCase {
  id: string
  prompt: string
  acceptedText: string
  bookId?: string | null
  model?: string | null
  createdAt?: string
  metadata?: Record<string, unknown> | null
}

export interface ExportOptions {
  /** Only include cases after this date */
  since?: Date
  /** Only include cases before this date */
  until?: Date
  /** Filter by bookId */
  bookId?: string
  /** Filter by model */
  model?: string
  /** Maximum number of cases */
  limit?: number
}

/**
 * Load eval cases from a JSON file.
 *
 * Expected format: Array of EvalCase objects.
 */
export function loadEvalDataset(filePath: string, options: ExportOptions = {}): EvalCase[] {
  const { since, until, bookId, model, limit = 500 } = options

  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as EvalCase[]

  let filtered = raw

  if (since) {
    filtered = filtered.filter((c) => c.createdAt && new Date(c.createdAt) >= since)
  }
  if (until) {
    filtered = filtered.filter((c) => c.createdAt && new Date(c.createdAt) <= until)
  }
  if (bookId) {
    filtered = filtered.filter((c) => c.bookId === bookId)
  }
  if (model) {
    filtered = filtered.filter((c) => c.model === model)
  }

  return filtered.slice(0, limit)
}
