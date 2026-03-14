/**
 * Grouped Bar Chart — Fixture scores within each evaluator
 */

import type { BenchmarkResult } from "../types.js"

const PALETTE = [
  { bg: "rgba(196, 127, 94, 0.7)", border: "rgba(196, 127, 94, 1)" },
  { bg: "rgba(92, 124, 160, 0.7)", border: "rgba(92, 124, 160, 1)" },
  { bg: "rgba(168, 178, 138, 0.7)", border: "rgba(168, 178, 138, 1)" },
  { bg: "rgba(198, 90, 82, 0.7)", border: "rgba(198, 90, 82, 1)" },
  { bg: "rgba(244, 221, 175, 0.7)", border: "rgba(244, 221, 175, 1)" },
  { bg: "rgba(140, 120, 100, 0.7)", border: "rgba(140, 120, 100, 1)" },
]

const EVALUATOR_NAMES: Record<string, string> = {
  "guardian": "Guardian",
  "analysis": "Analysis",
  "style-prose": "Style",
  "chapter-suspense": "Chapter",
  "plot-structure": "Plot",
}

export function generateGroupedBarHTML(results: BenchmarkResult[]): string {
  const evaluators = results.map(r => EVALUATOR_NAMES[r.evaluator] ?? r.evaluator)
  const allFixtureNames = [...new Set(results.flatMap(r => r.fixtures.map(f => f.name)))]

  const datasets = allFixtureNames.map((fixtureName, idx) => {
    const color = PALETTE[idx % PALETTE.length]
    const data = results.map(r => {
      const fixture = r.fixtures.find(f => f.name === fixtureName)
      if (!fixture) return null
      const scores = Object.values(fixture.scores)
      return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    })
    const shortName = fixtureName.replace(/\s*—\s*.+$/, "").replace(/^\[(?:style|chapter|plot)\]\s*/, "")
    return { label: shortName, data, backgroundColor: color.bg, borderColor: color.border, borderWidth: 1, borderRadius: 4 }
  })

  const config = {
    type: "bar",
    data: { labels: evaluators, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: "#3C3A36", font: { size: 12 }, padding: 15 } } },
      scales: {
        x: { ticks: { color: "#3C3A36", font: { size: 13, weight: "bold" } }, grid: { display: false } },
        y: { beginAtZero: true, max: 100, ticks: { color: "#8A8580", stepSize: 20 }, grid: { color: "rgba(60,58,54,0.08)" }, title: { display: true, text: "Score (0-100)", color: "#3C3A36", font: { size: 13 } } },
      },
    },
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fixture Scores by Evaluator</title>
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #FDFAF5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .container { width: 900px; height: 500px; }
  h2 { text-align: center; color: #3C3A36; margin-bottom: 8px; font-size: 20px; }
</style>
</head>
<body>
<div>
  <h2>Fixture Scores by Evaluator</h2>
  <div class="container"><canvas id="chart"></canvas></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
new Chart(document.getElementById('chart'), ${JSON.stringify(config, null, 2)});
</script>
</body>
</html>`
}
