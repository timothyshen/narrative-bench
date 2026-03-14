/**
 * Radar Chart — Per-fixture evaluator scores
 *
 * Supports multiple overlaid polygons for cross-fixture and cross-mode comparison.
 * Each RadarInput produces one polygon per fixture (Hamlet, HLM, etc.)
 */

import type { BenchmarkResult } from "../types.js"

export interface RadarInput {
  /** Label prefix for this dataset group (e.g. "Local" or "LLM") */
  label: string
  results: BenchmarkResult[]
}

// 4 distinct colors for 4 polygons: Hamlet/Local, HLM/Local, Hamlet/LLM, HLM/LLM
const COLORS = [
  { bg: "rgba(196, 127, 94, 0.20)", border: "rgba(196, 127, 94, 1)" },   // terracotta
  { bg: "rgba(92, 124, 160, 0.20)", border: "rgba(92, 124, 160, 1)" },   // slate blue
  { bg: "rgba(168, 178, 138, 0.20)", border: "rgba(168, 178, 138, 1)" }, // sage
  { bg: "rgba(198, 90, 82, 0.20)", border: "rgba(198, 90, 82, 1)" },     // warm red
  { bg: "rgba(140, 120, 100, 0.20)", border: "rgba(140, 120, 100, 1)" }, // brown
  { bg: "rgba(180, 160, 90, 0.20)", border: "rgba(180, 160, 90, 1)" },   // gold
]

const DASH_PATTERNS: number[][] = [
  [],        // solid
  [],        // solid
  [8, 4],    // dashed
  [8, 4],    // dashed
  [3, 3],    // dotted
  [3, 3],    // dotted
]

const EVALUATOR_NAMES: Record<string, string> = {
  "guardian": "Guardian",
  "analysis": "Analysis",
  "style-prose": "Style",
  "chapter-suspense": "Chapter",
  "plot-structure": "Plot",
}

/** Shorten fixture name: "Hamlet — False Positive Traps" → "Hamlet" */
function shortenFixtureName(name: string): string {
  return name
    .replace(/\s*—\s*.+$/, "")
    .replace(/^\[(?:style|chapter|plot)\]\s*/, "")
}

/** Get unique fixture short names across all evaluators in a report */
function getFixtureNames(results: BenchmarkResult[]): string[] {
  const names = new Set<string>()
  for (const r of results) {
    for (const f of r.fixtures) {
      names.add(shortenFixtureName(f.name))
    }
  }
  return [...names]
}

/** Compute per-fixture average score for a specific evaluator */
function fixtureScoreForEvaluator(
  results: BenchmarkResult[],
  evaluator: string,
  fixtureShortName: string,
): number {
  const evalResult = results.find(r => r.evaluator === evaluator)
  if (!evalResult) return 0

  const fixture = evalResult.fixtures.find(f =>
    shortenFixtureName(f.name) === fixtureShortName
  )
  if (!fixture) return 0

  const scores = Object.values(fixture.scores)
  return scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0
}

/**
 * Generate radar chart with one polygon per (input x fixture) combination.
 *
 * Example with 2 inputs (Local, LLM) and 2 fixtures (Hamlet, HLM):
 *   → 4 polygons: "Hamlet (Local)", "HLM (Local)", "Hamlet (LLM)", "HLM (LLM)"
 */
export function generateRadarHTML(inputs: RadarInput[]): string {
  const allEvaluators = [...new Set(inputs.flatMap(i => i.results.map(r => r.evaluator)))]
  const labels = allEvaluators.map(e => EVALUATOR_NAMES[e] ?? e)

  // Build one dataset per (input, fixture) pair
  const datasets: unknown[] = []
  let colorIdx = 0

  for (const input of inputs) {
    const fixtureNames = getFixtureNames(input.results)

    for (const fixtureName of fixtureNames) {
      const color = COLORS[colorIdx % COLORS.length]
      const dash = DASH_PATTERNS[colorIdx % DASH_PATTERNS.length]

      const data = allEvaluators.map(evaluator =>
        fixtureScoreForEvaluator(input.results, evaluator, fixtureName)
      )

      const datasetLabel = inputs.length > 1
        ? `${fixtureName} (${input.label})`
        : fixtureName

      datasets.push({
        label: datasetLabel,
        data,
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 2.5,
        borderDash: dash,
        pointBackgroundColor: color.border,
        pointBorderColor: "#FDFAF5",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      })

      colorIdx++
    }
  }

  return buildChartHTML("Narrative AI Benchmark — Per-Fixture Evaluator Scores", {
    type: "radar",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#3C3A36", font: { size: 13 }, padding: 20 },
        },
        tooltip: {
          callbacks: {
            label: "__TOOLTIP_FN__",
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 20, color: "#8A8580", backdropColor: "transparent", font: { size: 11 } },
          grid: { color: "rgba(60,58,54,0.1)" },
          angleLines: { color: "rgba(60,58,54,0.1)" },
          pointLabels: { color: "#3C3A36", font: { size: 14, weight: "bold" } },
        },
      },
    },
  }, 800, 800)
}

function buildChartHTML(title: string, config: unknown, width: number, height: number): string {
  // Replace tooltip placeholder with actual JS function
  let configStr = JSON.stringify(config, null, 2)
  configStr = configStr.replace(
    '"__TOOLTIP_FN__"',
    `function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + '/100'; }`
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #FDFAF5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .container { width: ${width}px; height: ${height}px; }
  h2 { text-align: center; color: #3C3A36; margin-bottom: 8px; font-size: 20px; }
</style>
</head>
<body>
<div>
  <h2>${title}</h2>
  <div class="container"><canvas id="chart"></canvas></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
new Chart(document.getElementById('chart'), ${configStr});
</script>
</body>
</html>`
}
