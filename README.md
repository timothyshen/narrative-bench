# @creader/benchmark

The first structural benchmark for narrative AI systems.

Not "does AI write well?" but "can AI **understand** story structure?" — three-act detection, character arc tracing, false-positive resistance on literary masterworks, and regression detection across versions.

## What It Measures

| Evaluator | What It Tests | Method |
|-----------|--------------|--------|
| **guardian** | Can your system distinguish literary devices from real inconsistencies? | Precision/recall/FPR against annotated false-positive traps |
| **analysis** | Can it detect literary qualities, character arcs, and causal chains? | Quality detection + arc mapping + causal coverage |
| **style-prose** | Does it avoid flagging well-written prose as flawed? | False-positive resistance across 5 style detectors |
| **chapter-suspense** | Can it classify chapter types and measure tension? | Suspense detection + thread coverage + cliffhanger false-positive resistance |
| **plot-structure** | Can it find three-act structure, inciting incidents, and foreshadowing? | Act detection + incident positioning + foreshadowing tracking |

## Fixtures

Two gold-standard literary works, fully annotated with expected qualities, arcs, and causal chains:

- **Hamlet** (English) — 11 chapters covering the complete 5-act dramatic trajectory
- **Dream of the Red Chamber / Hong Lou Meng** (Chinese) — 20 analytical chapters covering Cao Xueqin's first 80 chapters

Each fixture includes:
- Chapter content (analytical prose, not raw text)
- Knowledge base entries (characters, locations)
- Expected literary qualities with evidence
- Expected character arcs with beats
- Expected causal chains
- False-positive traps (things that should NOT be flagged)

## Quick Start

```bash
# Install
pnpm add @creader/benchmark

# Run all evaluators
pnpm run bench

# Run a single evaluator
pnpm run bench -- --evaluator guardian

# Filter by tag
pnpm run bench -- --tags hamlet

# Enable LLM-as-Judge (costs tokens, more accurate)
pnpm run bench -- --llm

# Compare against a saved baseline
pnpm run bench -- --save-baseline v1.0.0
pnpm run bench -- --compare v1.0.0

# Verbose output (per-fixture details)
pnpm run bench -- --verbose

# "Why is this written well?" reverse-engineering
pnpm run bench:why
pnpm run bench:why -- --fixture hamlet
```

## LLM-as-Judge

By default, evaluators use local analyzers (zero cost, fast). Add `--llm` to enable semantic evaluation via LLM:

- Quality detection: Does the text actually exhibit the annotated literary qualities?
- Arc mapping: Are character arc beats present and in correct order?
- Plot structure: Inciting incident, midpoint, and foreshadowing identification
- Suspense validation: Are cliffhanger warnings genuine structural issues or natural drama?

Configure the LLM provider:

```bash
# Default: OpenAI gpt-4o-mini
export OPENAI_API_KEY=sk-...

# Or use Anthropic
export BENCH_PROVIDER=anthropic
export BENCH_MODEL=claude-sonnet-4-20250514
export ANTHROPIC_API_KEY=sk-ant-...
```

## Regression Detection

Save a baseline, then compare future runs:

```bash
# After a known-good state
pnpm run bench -- --save-baseline v1.0.0

# After changes — exits with code 1 if regressions detected
pnpm run bench -- --compare v1.0.0
```

Regressions are any metric that drops by more than 10 points. Use in CI to prevent narrative understanding from degrading across model updates.

## Analyze Why

A unique reverse-engineering tool: feeds local analyzer signals into an LLM to produce a structured report explaining **why** a text works.

```bash
pnpm run bench:why -- --fixture hamlet --locale zh
```

Outputs a structured literary analysis covering:
- Rhythm design (chapter-level tension patterns)
- Structural skeleton (three-act, inciting incident, midpoint)
- Suspense weaving (thread distribution)
- Character arc interplay
- Causal chain construction
- Actionable craft lessons for writers

## Adding Fixtures

Create a JSON file in `fixtures/{evaluator}/`:

```jsonc
{
  "id": "unique-id",
  "name": "Display Name",
  "description": "What this fixture tests",
  "locale": "en",        // "en" or "zh"
  "contentType": "novel",
  "chapters": [
    {
      "id": "ch-1",
      "title": "Chapter Title",
      "content": "Chapter text...",
      "orderIndex": 0
    }
  ],
  "expectedQualities": [
    {
      "dimension": "character",
      "quality": "What quality to detect",
      "evidence": "Substring from the text proving this quality"
    }
  ],
  "expectedArcs": [
    {
      "entity": "Character Name",
      "arcType": "rise-fall",
      "beats": ["Beat 1 description", "Beat 2 description"]
    }
  ],
  "expectedCausalChains": [
    {
      "label": "Chain Name",
      "links": [
        { "event": "Cause", "consequence": "Effect" }
      ]
    }
  ],
  "expectedAbsentFlaws": ["Things that should NOT be flagged"],
  "tags": ["tag1", "tag2"]
}
```

## Project Structure

```
src/
  runner.ts              CLI entry point
  analyze-why.ts         Literary reverse-engineering
  types.ts               All type definitions
  evaluators/            5 evaluators (guardian, analysis, style, chapter, plot)
  judges/                LLM-as-Judge (quality, arc, plot, suspense)
  analyzers/             Built-in local analyzers
    style/               Prose quality detectors (5 detectors)
    chapter/             Chapter classifier (type, suspense, structure)
    plot/                Plot structure (acts, foreshadowing, incidents)
    langs/               Language modules (en, zh)
  lib/                   Infrastructure (fixture loader, scoring, model factory)

fixtures/                Annotated test data (Hamlet, Dream of the Red Chamber)
baselines/               Versioned score snapshots
reports/                 Generated benchmark reports (gitignored)
```

## License

Apache-2.0

Built by [Creader](https://creader.io) — the world expression platform for novelists.
