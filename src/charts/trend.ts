/**
 * Trend Line Chart — Score history across reports
 */

import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import type { BenchmarkResult } from "../types.js"

const LINE_COLORS = [
  { border: "rgba(196, 127, 94, 1)" },
  { border: "rgba(92, 124, 160, 1)" },
  { border: "rgba(168, 178, 138, 1)" },
  { border: "rgba(198, 90, 82, 1)" },
  { border: "rgba(140, 120, 100, 1)" },
]

const EVALUATOR_NAMES: Record<string, string> = {
  "guardian": "Guardian",
  "analysis": "Analysis",
  "style-prose": "Style",
  "chapter-suspense": "Chapter",
  "plot-structure": "Plot",
}

interface ReportEntry {
  date: string
  results: BenchmarkResult[]
}

function loadReports(reportsDir: string): ReportEntry[] {
  let files: string[]
  try {
    files = readdirSync(reportsDir).filter(f => f.endsWith(".json")).sort()
  } catch {
    return []
  }

  return files.map(file => {
    try {
      const raw = readFileSync(join(reportsDir, file), "utf-8")
      return { date: file.replace(".json", ""), results: JSON.parse(raw) as BenchmarkResult[] }
    } catch {
      return null
    }
  }).filter((e): e is ReportEntry => e !== null)
}

export function generateTrendHTML(reportsDir: string): string | null {
  const reports = loadReports(reportsDir)
  if (reports.length === 0) {
    console.warn("[trend] No report files found — skipping trend chart")
    return null
  }

  const dates = reports.map(r => r.date)
  const allEvaluators = [...new Set(reports.flatMap(r => r.results.map(res => res.evaluator)))]

  const datasets = allEvaluators.map((evaluator, idx) => {
    const color = LINE_COLORS[idx % LINE_COLORS.length]
    const data = reports.map(report => {
      const result = report.results.find(r => r.evaluator === evaluator)
      return result?.aggregate.overallScore ?? null
    })
    return {
      label: EVALUATOR_NAMES[evaluator] ?? evaluator,
      data,
      borderColor: color.border,
      backgroundColor: "transparent",
      borderWidth: 2.5,
      pointBackgroundColor: color.border,
      pointBorderColor: "#FDFAF5",
      pointBorderWidth: 2,
      pointRadius: 5,
      fill: false,
      tension: 0.3,
      spanGaps: true,
    }
  })

  const config = {
    type: "line",
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: "#3C3A36", font: { size: 12 }, padding: 15 } } },
      scales: {
        x: { ticks: { color: "#3C3A36" }, grid: { color: "rgba(60,58,54,0.05)" }, title: { display: true, text: "Date", color: "#3C3A36", font: { size: 13 } } },
        y: { beginAtZero: true, max: 100, ticks: { color: "#8A8580", stepSize: 20 }, grid: { color: "rgba(60,58,54,0.08)" }, title: { display: true, text: "Overall Score", color: "#3C3A36", font: { size: 13 } } },
      },
    },
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Score Trend Over Time</title>
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #FDFAF5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .container { width: 900px; height: 450px; }
  h2 { text-align: center; color: #3C3A36; margin-bottom: 8px; font-size: 20px; }
</style>
</head>
<body>
<div>
  <h2>Score Trend Over Time</h2>
  <div class="container"><canvas id="chart"></canvas></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
new Chart(document.getElementById('chart'), ${JSON.stringify(config, null, 2)});
</script>
</body>
</html>`
}
