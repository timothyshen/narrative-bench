/**
 * Model Factory
 *
 * Generic LLM model initialization supporting multiple providers.
 * Replaces the host project's createModelInstance with a standalone version.
 *
 * Configure via environment variables:
 *   BENCH_PROVIDER=openai|anthropic  (default: openai)
 *   BENCH_MODEL=gpt-4o-mini          (default: gpt-4o-mini)
 *
 * Or pass config directly to createModel().
 */

import type { LanguageModel } from "ai"

export interface ModelConfig {
  provider?: string
  model?: string
}

export function createModel(config?: ModelConfig): LanguageModel {
  const provider = config?.provider ?? process.env.BENCH_PROVIDER ?? "openai"
  const modelId = config?.model ?? process.env.BENCH_MODEL ?? "gpt-4o-mini"

  switch (provider) {
    case "openai": {
      // Dynamic import to avoid requiring both SDKs
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createOpenAI } = require("@ai-sdk/openai")
      return createOpenAI()(modelId)
    }
    case "anthropic": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createAnthropic } = require("@ai-sdk/anthropic")
      return createAnthropic()(modelId)
    }
    default:
      throw new Error(
        `Unknown BENCH_PROVIDER: "${provider}". Supported: openai, anthropic`
      )
  }
}
