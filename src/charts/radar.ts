/**
 * Radar Chart — Evaluator scores across dimensions
 */

import type { BenchmarkResult } from "../types.js"

export interface RadarInput {
  label: string
  results: BenchmarkResult[]
}

const COLORS = [
  { bg: "rgba(196, 127, 94, 0.25)", border: "rgba(196, 127, 94, 1)" },
  { bg: "rgba(92, 124, 160, 0.25)", border: "rgba(92, 124, 160, 1)" },
  { bg: "rgba(168, 178, 138, 0.25)", border: "rgba(168, 178, 138, 1)" },
  { bg: "rgba(198, 90, 82, 0.25)", border: "rgba(198, 90, 82, 1)" },
]

const EVALUATOR_NAMES: Record<string, string> = {
  "guardian": "Guardian",
  "analysis": "Analysis",
  "style-prose": "Style",
  "chapter-suspense": "Chapter",
  "plot-structure": "Plot",
}

export function generateRadarHTML(inputs: RadarInput[]): string {
  const allEvaluators = [...new Set(inputs.flatMap(i => i.results.map(r => r.evaluator)))]
  const labels = allEvaluators.map(e => EVALUATOR_NAMES[e] ?? e)

  const datasets = inputs.map((input, idx) => {
    const color = COLORS[idx % COLORS.length]
    const data = allEvaluators.map(evaluator => {
      const result = input.results.find(r => r.evaluator === evaluator)
      return result?.aggregate.overallScore ?? 0
    })
    return { label: input.label, data, backgroundColor: color.bg, borderColor: color.border, borderWidth: 2, pointBackgroundColor: color.border, pointBorderColor: "#FDFAF5", pointBorderWidth: 2, pointRadius: 5 }
  })

  return buildChartHTML("Narrative AI Benchmark — Evaluator Scores", {
    type: "radar",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: "#3C3A36", font: { size: 13 }, padding: 20 } } },
      scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, color: "#8A8580", backdropColor: "transparent" }, grid: { color: "rgba(60,58,54,0.1)" }, angleLines: { color: "rgba(60,58,54,0.1)" }, pointLabels: { color: "#3C3A36", font: { size: 14, weight: "bold" } } } },
    },
  }, 700, 700)
}

function buildChartHTML(title: string, config: unknown, width: number, height: number): string {
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
new Chart(document.getElementById('chart'), ${JSON.stringify(config, null, 2)});
</script>
</body>
</html>`
}
