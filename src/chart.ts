/**
 * Chart Generator CLI
 *
 * Generates interactive HTML charts from benchmark reports.
 * Open the output files in a browser to view and screenshot.
 *
 * Usage:
 *   pnpm run bench:chart                           # Generate all charts from latest report
 *   pnpm run bench:chart -- --report 2026-03-14    # Use specific report
 *   pnpm run bench:chart -- --type radar           # Generate only radar chart
 *   pnpm run bench:chart -- --label "GPT-4o"       # Label for radar overlay
 *   pnpm run bench:chart -- --open                 # Open in browser after generation
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { generateRadarHTML } from "./charts/radar.js"
import { generateGroupedBarHTML } from "./charts/grouped-bar.js"
import { generateTrendHTML } from "./charts/trend.js"
import type { BenchmarkResult } from "./types.js"

const ROOT = join(import.meta.dirname ?? __dirname, "..")
const REPORTS_DIR = join(ROOT, "reports")

// ── CLI ──

const args = process.argv.slice(2)

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`)
}

const reportName = getArg("report")
const chartType = getArg("type")
const label = getArg("label") ?? "Current"
const shouldOpen = hasFlag("open")

// ── Load report ──

function loadLatestReport(): { name: string; results: BenchmarkResult[] } {
  const files = readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()

  if (files.length === 0) {
    console.error("No report files found in reports/. Run `pnpm run bench` first.")
    process.exit(1)
  }

  const target = reportName
    ? files.find(f => f.includes(reportName))
    : files[files.length - 1]

  if (!target) {
    console.error(`Report "${reportName}" not found. Available: ${files.join(", ")}`)
    process.exit(1)
  }

  const raw = readFileSync(join(REPORTS_DIR, target), "utf-8")
  return {
    name: target.replace(".json", ""),
    results: JSON.parse(raw) as BenchmarkResult[],
  }
}

// ── Main ──

function main() {
  console.log("=== Chart Generator ===\n")

  mkdirSync(REPORTS_DIR, { recursive: true })

  const report = loadLatestReport()
  console.log(`Using report: ${report.name}`)

  const types = chartType ? [chartType] : ["radar", "bar", "trend"]
  const generated: string[] = []

  for (const type of types) {
    switch (type) {
      case "radar": {
        const path = join(REPORTS_DIR, `${report.name}-radar.html`)
        const html = generateRadarHTML([{ label, results: report.results }])
        writeFileSync(path, html)
        generated.push(path)
        console.log(`  Radar:       ${path}`)
        break
      }
      case "bar": {
        const path = join(REPORTS_DIR, `${report.name}-bar.html`)
        const html = generateGroupedBarHTML(report.results)
        writeFileSync(path, html)
        generated.push(path)
        console.log(`  Grouped bar: ${path}`)
        break
      }
      case "trend": {
        const path = join(REPORTS_DIR, "trend.html")
        const html = generateTrendHTML(REPORTS_DIR)
        if (html) {
          writeFileSync(path, html)
          generated.push(path)
          console.log(`  Trend:       ${path}`)
        }
        break
      }
      default:
        console.warn(`  Unknown chart type: ${type} (available: radar, bar, trend)`)
    }
  }

  if (shouldOpen && generated.length > 0) {
    for (const path of generated) {
      try {
        execSync(`open "${path}"`)
      } catch {
        // non-macOS — try xdg-open
        try { execSync(`xdg-open "${path}"`) } catch { /* ignore */ }
      }
    }
  }

  console.log("\nDone.")
}

main()
