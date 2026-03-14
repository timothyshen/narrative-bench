/**
 * Benchmark Runner CLI
 *
 * Usage:
 *   pnpm run bench                          # Run all evaluators
 *   pnpm run bench -- --evaluator guardian   # Run single evaluator
 *   pnpm run bench -- --tags hamlet          # Filter fixtures by tag
 *   pnpm run bench -- --llm                 # Enable LLM-as-Judge (costs tokens)
 *   pnpm run bench -- --compare v0.9.0      # Compare against baseline
 *   pnpm run bench -- --save-baseline v0.9.1 # Save current as baseline
 *
 * @input  CLI args, fixture files
 * @output JSON report to benchmarks/reports/, console summary
 * @pos    benchmarks/ — benchmark runner entry point
 */

import { config } from "dotenv"
// Load .env.local for API keys (OPENAI_API_KEY etc.)
config({ path: ".env.local" })

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { loadFixtures, listEvaluators } from "./lib/fixture-loader.js"
import { formatReport, detectRegressions } from "./lib/score-aggregator.js"
import { evaluateGuardian } from "./evaluators/guardian.js"
import { evaluateAnalysis } from "./evaluators/analysis.js"
import { evaluateStyle } from "./evaluators/style.js"
import { evaluateChapter } from "./evaluators/chapter.js"
import { evaluatePlot } from "./evaluators/plot.js"
import type { BenchmarkResult, Baseline, EvaluatorType } from "./types.js"
import { getTotalTokens, resetTokens } from "./judges/llm-judge.js"

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`)
}

const evaluatorFilter = getArg("evaluator") as EvaluatorType | undefined
const tagsFilter = getArg("tags")?.split(",")
const compareBaseline = getArg("compare")
const saveBaseline = getArg("save-baseline")
const version = getArg("version") ?? "dev"
const verbose = hasFlag("verbose")
const useLLM = hasFlag("llm")

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== AI Benchmark Runner ===\n")

  const available = listEvaluators()
  const evaluators = evaluatorFilter
    ? available.filter((e) => e === evaluatorFilter)
    : available

  if (evaluators.length === 0) {
    console.log("No evaluators with fixtures found.")
    if (evaluatorFilter) {
      console.log(`Requested: ${evaluatorFilter}`)
      console.log(`Available: ${available.join(", ") || "none"}`)
    }
    process.exit(1)
  }

  console.log(`Evaluators: ${evaluators.join(", ")}`)
  if (tagsFilter) console.log(`Tags filter: ${tagsFilter.join(", ")}`)
  if (useLLM) console.log(`LLM-as-Judge: ENABLED (costs tokens)`)
  console.log()

  const results: BenchmarkResult[] = []

  for (const evaluator of evaluators) {
    console.log(`--- ${evaluator} ---`)

    let result: BenchmarkResult

    switch (evaluator) {
      case "guardian": {
        const fixtures = loadFixtures("guardian", tagsFilter)
        console.log(`  Loaded ${fixtures.length} fixture(s)`)
        result = await evaluateGuardian(fixtures, { version })
        break
      }
      case "analysis": {
        const fixtures = loadFixtures("analysis", tagsFilter)
        console.log(`  Loaded ${fixtures.length} fixture(s)`)
        result = await evaluateAnalysis(fixtures, { version, useLLM })
        break
      }
      case "style-prose": {
        const fixtures = loadFixtures("style-prose", tagsFilter)
        console.log(`  Loaded ${fixtures.length} fixture(s)`)
        result = await evaluateStyle(fixtures, { version })
        break
      }
      case "chapter-suspense": {
        const fixtures = loadFixtures("chapter-suspense", tagsFilter)
        console.log(`  Loaded ${fixtures.length} fixture(s)`)
        result = await evaluateChapter(fixtures, { version, useLLM })
        break
      }
      case "plot-structure": {
        const fixtures = loadFixtures("plot-structure", tagsFilter)
        console.log(`  Loaded ${fixtures.length} fixture(s)`)
        result = await evaluatePlot(fixtures, { version, useLLM })
        break
      }
      default:
        console.log(`  Evaluator "${evaluator}" not yet implemented, skipping`)
        continue
    }

    results.push(result)

    // Print summary
    console.log(`  Score: ${result.aggregate.overallScore}/100`)
    console.log(`  Pass rate: ${(result.aggregate.passRate * 100).toFixed(1)}%`)
    console.log(`  Avg latency: ${result.aggregate.avgLatencyMs}ms`)
    console.log(`  Tokens: ${result.aggregate.totalCostTokens}`)

    if (verbose) {
      for (const f of result.fixtures) {
        const status = f.passed ? "PASS" : "FAIL"
        console.log(`  [${status}] ${f.name}`)
        for (const [metric, val] of Object.entries(f.scores)) {
          console.log(`    ${metric}: ${val}`)
        }
        if (f.details) console.log(`    ${f.details}`)
      }
    }
    console.log()
  }

  // Report LLM token usage
  if (useLLM) {
    const tokens = getTotalTokens()
    console.log(`LLM tokens used: ${tokens.toLocaleString()}`)
    resetTokens()
  }

  // Save report
  const reportsDir = join(import.meta.dirname ?? __dirname, "..", "reports")
  mkdirSync(reportsDir, { recursive: true })
  const reportPath = join(
    reportsDir,
    `${new Date().toISOString().split("T")[0]}.json`
  )
  writeFileSync(reportPath, JSON.stringify(results, null, 2))
  console.log(`Report saved: ${reportPath}`)

  // Compare against baseline if requested
  if (compareBaseline) {
    const baselinePath = join(import.meta.dirname ?? __dirname, "..", "baselines", `${compareBaseline}.json`)
    if (!existsSync(baselinePath)) {
      console.error(`Baseline not found: ${baselinePath}`)
      process.exit(1)
    }
    const baseline: Baseline = JSON.parse(readFileSync(baselinePath, "utf-8"))
    const regression = detectRegressions(results, baseline)

    if (regression.regressions.length > 0) {
      console.log("\n=== REGRESSIONS DETECTED ===")
      for (const r of regression.regressions) {
        console.log(
          `  [${r.evaluator}] ${r.metric}: ${r.baselineValue} → ${r.currentValue} (${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)})`
        )
      }
      process.exit(1) // Fail CI
    } else {
      console.log("\nNo regressions detected.")
    }

    if (regression.improvements.length > 0) {
      console.log("\n=== IMPROVEMENTS ===")
      for (const i of regression.improvements) {
        console.log(
          `  [${i.evaluator}] ${i.metric}: ${i.baselineValue} → ${i.currentValue} (+${i.delta.toFixed(1)})`
        )
      }
    }
  }

  // Save baseline if requested
  if (saveBaseline) {
    const baselinesDir = join(import.meta.dirname ?? __dirname, "..", "baselines")
    mkdirSync(baselinesDir, { recursive: true })
    const baseline: Baseline = {
      version: saveBaseline,
      createdAt: Date.now(),
      results,
    }
    const baselinePath = join(baselinesDir, `${saveBaseline}.json`)
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2))
    console.log(`Baseline saved: ${baselinePath}`)
  }

  // Print full reports if verbose
  if (verbose) {
    console.log("\n=== Full Reports ===\n")
    for (const result of results) {
      console.log(formatReport(result))
      console.log()
    }
  }
}

main().catch((e) => {
  console.error("Benchmark runner failed:", e)
  process.exit(1)
})
