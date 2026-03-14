/**
 * Score Aggregator
 *
 * Normalizes evaluator results into unified scores and detects regressions
 * against baselines.
 */

import type {
  FixtureResult,
  AggregateScore,
  BenchmarkResult,
  Baseline,
  RegressionReport,
} from "../types.js"

/**
 * Aggregate individual fixture results into a summary score.
 */
export function aggregateScores(fixtures: FixtureResult[]): AggregateScore {
  if (fixtures.length === 0) {
    return {
      overallScore: 0,
      passRate: 0,
      avgLatencyMs: 0,
      totalCostTokens: 0,
      regressions: [],
    }
  }

  const passed = fixtures.filter((f) => f.passed).length
  const passRate = passed / fixtures.length

  const fixtureScores = fixtures.map((f) => {
    const metricValues = Object.values(f.scores)
    return metricValues.length > 0
      ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length
      : 0
  })
  const overallScore =
    fixtureScores.reduce((a, b) => a + b, 0) / fixtureScores.length

  const avgLatencyMs =
    fixtures.reduce((a, f) => a + f.latencyMs, 0) / fixtures.length
  const totalCostTokens = fixtures.reduce((a, f) => a + f.costTokens, 0)

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    passRate: Math.round(passRate * 100) / 100,
    avgLatencyMs: Math.round(avgLatencyMs),
    totalCostTokens,
    regressions: [],
  }
}

/**
 * Compare current results against a baseline and detect regressions.
 * A regression is any metric that dropped by more than the threshold (default 10%).
 */
export function detectRegressions(
  current: BenchmarkResult[],
  baseline: Baseline,
  threshold = 10
): RegressionReport {
  const regressions: RegressionReport["regressions"] = []
  const improvements: RegressionReport["improvements"] = []

  for (const currentResult of current) {
    const baselineResult = baseline.results.find(
      (b) => b.evaluator === currentResult.evaluator
    )
    if (!baselineResult) continue

    const pairs: { metric: string; current: number; baseline: number }[] = [
      {
        metric: "overallScore",
        current: currentResult.aggregate.overallScore,
        baseline: baselineResult.aggregate.overallScore,
      },
      {
        metric: "passRate",
        current: currentResult.aggregate.passRate * 100,
        baseline: baselineResult.aggregate.passRate * 100,
      },
    ]

    for (const currentFixture of currentResult.fixtures) {
      const baselineFixture = baselineResult.fixtures.find(
        (f) => f.id === currentFixture.id
      )
      if (!baselineFixture) continue

      for (const [metric, value] of Object.entries(currentFixture.scores)) {
        const baselineValue = baselineFixture.scores[metric]
        if (baselineValue !== undefined) {
          pairs.push({
            metric: `${currentFixture.id}/${metric}`,
            current: value,
            baseline: baselineValue,
          })
        }
      }
    }

    for (const { metric, current: curr, baseline: base } of pairs) {
      const delta = curr - base
      if (delta < -threshold) {
        regressions.push({
          evaluator: currentResult.evaluator,
          metric,
          baselineValue: base,
          currentValue: curr,
          delta,
        })
      } else if (delta > threshold) {
        improvements.push({
          evaluator: currentResult.evaluator,
          metric,
          baselineValue: base,
          currentValue: curr,
          delta,
        })
      }
    }
  }

  return {
    baselineVersion: baseline.version,
    currentVersion: current[0]?.version ?? "unknown",
    regressions,
    improvements,
  }
}

/**
 * Format a benchmark result as a human-readable report.
 */
export function formatReport(result: BenchmarkResult): string {
  const lines: string[] = [
    `# ${result.evaluator} Benchmark Report`,
    `Version: ${result.version}`,
    `Date: ${new Date(result.timestamp).toISOString()}`,
    "",
    `## Aggregate`,
    `Overall Score: ${result.aggregate.overallScore}/100`,
    `Pass Rate: ${(result.aggregate.passRate * 100).toFixed(1)}%`,
    `Avg Latency: ${result.aggregate.avgLatencyMs}ms`,
    `Total Tokens: ${result.aggregate.totalCostTokens}`,
    "",
    `## Fixtures`,
  ]

  for (const f of result.fixtures) {
    const status = f.passed ? "PASS" : "FAIL"
    lines.push(`### [${status}] ${f.name} (${f.id})`)
    for (const [metric, value] of Object.entries(f.scores)) {
      lines.push(`  ${metric}: ${value}`)
    }
    if (f.details) {
      lines.push(`  ${f.details}`)
    }
    lines.push(`  Latency: ${f.latencyMs}ms | Tokens: ${f.costTokens}`)
    lines.push("")
  }

  if (result.aggregate.regressions.length > 0) {
    lines.push(`## Regressions`)
    for (const r of result.aggregate.regressions) {
      lines.push(`  - ${r}`)
    }
  }

  return lines.join("\n")
}
