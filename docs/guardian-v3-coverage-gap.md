# Guardian v3 coverage gap — bench vs product (2026-07-19, revised 07-20 after 3-lens review)

> Snapshot of what the product's Guardian (creader_editor `main`, guardian-v3
> stage, 32 catalog detectors) has that this benchmark does and does not cover.
> This is the pre-open-source checklist: close or consciously accept every row
> before the MIT/Apache flip.
>
> **Revision note (2026-07-20):** a code/NLP/AI-eng review found the original
> version of this doc overstated coverage in two ways, both fixed below:
> "covered by evaluator" rows conflated bench-local proxies with the product's
> api-heavy detectors, and the timeline/entity rows claimed coverage for
> detector semantics **no shipped product code implements**.

## How coverage works here — three honesty grades

- **Measured** — the exact product detector logic runs here (verbatim port) or
  gold fixtures exist in the product harness's consumable shape.
- **Proxy** — a bench-local analyzer evaluates the same *phenomenon* with
  different (weaker) logic. Useful signal, NOT the product detector's score.
- **Authored, detector-pending** — gold fixtures exist for semantics the
  product catalog *names* but no shipped code implements.

LLM-detector fixtures carry the `llm-detector` tag; `evaluateGuardian` skips
them loudly. Every `expectedIssue` in them now carries the structured
annotation the product's cassette harness (`lib/ai/guardian/bench/`) consumes:
`chapterId` + `detectorId` + `substring` (exact violating passage) alongside
the bench-native `descriptionPattern`.

## Measured

| Product detector | Mechanism |
|---|---|
| l1.dead-character · l1.name-typo | local port (`quick-rules.ts`) |
| l1.constraint-violation | gold fixtures `world-constraints-{en,zh}` — `FixtureWorldConstraint` is field-identical to the product's `BookWorldConstraint`; one adapter call (`createInMemoryBookSource({worldConstraints})`) away from runnable |
| l2 local style family (lexical-illusion, punctuation, unattributed-dialogue, cliche, weasel-words, there-is-starter, temporal-confusion, dialogue-order) | local ports (`style/`) |
| l2.pacing-rhythm · l2.gesture-gloss | ported 2026-07-19; `stripDialogue` re-aligned to the product's family-paired version 07-20 (the legacy bench helper ate narration between ASCII contractions) |
| l2.proofread | gold fixtures `proofread-{en,zh}` — **Decision 2026-07-20 (Tim): the BENCH is the canonical gold source.** The product's own copy (`benchmarks/guardian-v2-fixtures/proofread-zh.json`) is downstream/legacy; follow-up: re-point the product harness at bench fixtures through its declared seam (`lib/ai/guardian/bench/types.ts` — "[PROTOCOL]: When narrative-bench updates its fixture format, this file is the seam to update"). The structured `chapterId`/`detectorId`/`substring` annotations added 07-20 exist precisely so that seam can consume these files. **Finding 2026-07-29 (recording session): the product harness has NO l2.proofread adapter at all** — neither in `BENCH_ADAPTERS` (23 local) nor `LLM_BENCH_ADAPTERS` (9 LLM); its own `proofread-zh.json` gold has therefore never been scored either. **Superseded 2026-07-30:** the adapter now exists (`LLM_BENCH_ADAPTERS`, 10 total) and `nb-proofread-{en,zh}` are promoted into the bundled set. The root cause ran deeper than a missing adapter: the product's proofread and constraint-violation detectors **bypassed the cassette transport entirely** (`callL2Llm`/`callL1Llm` → raw `generateObject`), so record mode wrote nothing and replay mode silently made live API calls — no proofread cassette had ever existed. Fixed on product staging `63ff934d4` (both rerouted through `callGuardianLlm`, bypass modules deleted, unit tests pinned to replay). First replayable numbers: nb gold P=77.8% R=100% (07-29 live sample); full-corpus replay P=3.9% R=100% — that crater is a labeling-surface artifact (legacy product fixtures carry zero proofread annotations, so every flag scores FP) plus a real classical-prose FP problem (163 trap FPs on the 水浒/红楼-family corpora), baselined as the regression reference |
| l4.opening-quality | wired 2026-07-19 (`noFalseOpeningErrors` dimension) — see caveat below |

## Proxy only (NOT the product detector's score)

The bench evaluators exercise the same phenomena with local pattern analyzers;
the product detectors are api-heavy/vector LLM calls. Do not quote these as
product-detector coverage.

| Product detector | Bench proxy |
|---|---|
| l3.character-arc · l3.causal-chain · l3.quality-deficit (api-heavy) | `analysis` evaluator |
| l4.chapter-classifier (local — genuinely measured) · l4.cliffhanger (local) | `chapter-suspense` evaluator |
| l4.suspense-level · l4.thread-coverage (api-heavy) | `chapter-suspense` evaluator |
| l5.act-structure · l5.inciting-incident (api-heavy) · l5.foreshadowing (vector, `ForeshadowingMarker`-backed) | `plot-structure` evaluator |

## Authored, detector-pending (tagged `proposed-detector`)

| Fixture family | Situation |
|---|---|
| `timeline-violations-{en,zh}` | gold-labels "narrative contradicts canonical KB event order." The SHIPPED `l1.timeline-violation` is `temporalConflictRule` — a local marker-frequency heuristic that never reads `timelineEvents`; the catalog's `api-light` pointer targets a route deleted in v0.13. Nobody in the product compares narrative against event order today. These fixtures are the spec-by-example for that detector when it gets built; the shipped heuristic remains unmeasured. **Decision 2026-07-20 (Tim): build the canonical-order detector — product-side, R2 candidate (the 2.1R narrative index supplies canonical order); these fixtures stand as its spec.** |
| `entity-contradictions-{en,zh}` | gold-labels "prose contradicts canonical KB entity fields." The SHIPPED `l1.entity-contradiction` runs symbolic closure over `relations[]` + LLM verify — a different input universe (`GuardianFixture` has no relations). These cases overlap `l1.character-inconsistency`'s KB-contradiction half (an open medium port below) and the deleted legacy analyze entity branch. |

## Open gaps

### Medium ports (product-local, but with dependency trees — NOT free)

~0.5–1d each; initially misclassified as trivial, corrected after reading the
dependency trees.

| Detector | Why it is not a free port |
|---|---|
| l1.character-inconsistency | needs `mention-extraction` (trait regexes, per-language character modules) + `entity-registry` (KB metadata parsing) ≈ 500+ lines; bench `FixtureKBEntry` has no structured character-metadata shape |
| l5.plot-hole | input is `(chapters, TimelineEvent[], KnowledgeEntry[], locale)` — needs a first-class timeline-event fixture shape plus i18n keys the bench registry lacks |

### LLM fixtures not yet authored

| Detector | Note |
|---|---|
| ~~l2.pov-leak~~ · ~~l3.flaw-pattern~~ | **SYNCED 2026-07-26** from the product's guardian-v2-fixtures (`synced-from-product` tag). Unit-tier thin (1 violation, no traps) — thicken to the four-family trap pattern when they matter |
| l4.emotion-flatness · l5.midpoint | same fixture pattern as the four shipped families (midpoint has a product adapter; emotion-flatness has neither) |

### Deferred on purpose

| Detector | Why |
|---|---|
| l3.argument-structure · l3.counterargument-coverage · l3.evidence-claim-alignment | non-fiction trio (#229), not yet in the product's own fiction catalog; sync after the non-fiction Guardian unification (decided 2026-07-09) |

## Known issues & caveats (from the 2026-07-20 review)

1. **Legacy score — DIAGNOSED 2026-07-29** (`docs/legacy-guardian-score-diagnosis.md`):
   the 26.65 headline is structurally distorted (FP-trap fixtures' definitional
   precision-0 averaged into the mean); the real defects are the CJK repetition
   detector's overlapping-window name FPs + the evaluator never passing
   knowledgeBase names as `properNouns` (zh P=20), three noisy en detectors,
   and an FP-trap pass criterion that doesn't bite (7.26 FPs/kwords passed a
   <=2 gate). Repair order A/B/D before the open-source flip; C trails.
2. **Tag governance — FIXED 2026-07-20 (both layers).** The `llm-detector`
   exclusion now lives in `loadFixtures` itself (choke point; explicit
   `--tags llm-detector` opts back in), and the runner refuses to write a
   report when zero fixtures were scored — a degenerate run can no longer
   overwrite a real same-day report with zeros. Still open, cross-repo: the
   product's `bench-guardian-v2` JSON-parses every fixture file and has no
   `tags` field — syncing these files across the seam without an adapter
   feeds it malformed expectations.
3. **No baselines.** `baselines/` is empty; nothing in this repo gates any of
   these changes. Reports are date-keyed and overwritten by partial runs;
   `version` is always "dev"; trend charts draw dimension-era changes as one
   continuous line (the guardian 18.58→26.65 jump on 2026-04-02→03 is a
   2→4 fixture-count change, not an improvement — same class of artifact as
   chapter's 70.58→76.47 below).
4. **`noFalseOpeningErrors` has no LLM appeal.** Unlike `noFalseCliffhanger`
   (LLM-override via `judgeSuspenseOverload`), an opening-heuristic trip costs
   a flat 25 points with no judgment call — and the heuristics (weather
   opening, wake-up routine) are craft folklore that masterworks break
   deliberately. **Decision 2026-07-20 (Tim): leave as-is until a masterwork
   fixture actually trips it; when one does, add the LLM judge — do NOT
   re-annotate the fixture to appease the heuristic.**

## Score-surface changes (disclosed)

- `guardian`: 26.65/100 unchanged through the 07-19 sync. The 07-20
  `stripDialogue` re-alignment may shift legacy style scores (it changes
  narration extraction for every stripDialogue consumer) — re-A/B'd below.
- `chapter-suspense`: 70.58 → 76.47 — the new dimension scored 100 across the
  board; a wider scoring surface, not an improvement of prior dimensions.
- `guardian-ablation`: regenerating the ablation report now includes the two
  ported detectors (e.g. pacing fires ~20 issues on hamlet-fulltext's verse
  layout), shifting v0/flat counts vs the published Section-6 numbers. Both
  ablation META entries were added 07-20 so lanes/ids stay consistent.

---

## Cross-repo reconciliation (2026-07-22, post PR #1 merge)

Verified against creader_editor `origin/main` (unchanged since 2026-07-19):
the product runs its OWN evaluation stack — a cassette-replay harness
(`lib/ai/guardian/bench/`, CI-gated via `bench:guardian:v2`) with **8 LLM
adapters** (`l2.pov-leak`, `l3.character-arc`, `l3.causal-chain`,
`l3.quality-deficit`, `l3.flaw-pattern`, `l5.act-structure`,
`l5.inciting-incident`, `l5.midpoint`) and **34 gold fixtures** under
`benchmarks/guardian-v2-fixtures/`. The gap is therefore two-directional.

### A. Only the open bench has

| Asset | Why it matters |
|---|---|
| `l1.constraint-violation` gold (`world-constraints-{en,zh}`) | **the flagship 1B.4 detector's only gold labels live here** (canon). Since 2026-07-29/30 the product consumes them through the converter seam: adapter + promoted `nb-world-constraints-{en,zh}` + first replayable cassette (staging `63ff934d4`) — P=71.4% R=83.3% F1=76.9%, 0 trap FPs. Live samples varied P=85.7/100/71.4 across three runs (the detector model ignores temperature), which is exactly why the cassette pins one |
| Canonical-order timeline + KB-field entity gold (`proposed-detector` ×4) | no implementation anywhere; these are the spec |
| `proofread-en` | canon lives here; the product's own `proofread-zh` is downstream/legacy — since 2026-07-30 the product consumes both locales as converted `nb-proofread-{en,zh}` |
| Masterwork-scale FP-resistance corpus (Hamlet / Hong Lou Meng) | the product's `clean-prose-traps` is far smaller |

### B. Only the product has

| Asset | Why it matters |
|---|---|
| Cassette-replay harness + CI gate | this repo has no baselines and cannot run any LLM detector |
| 10 LLM adapters over real detectors (since 2026-07-30 incl. `l1.constraint-violation` + `l2.proofread`) | the only place gold labels become P/R numbers today |
| Bilingual gold for `pov-leak`, `l3-flaw-pattern`, `l3-causal`, `l3-character`, `l3-coherence`; `inference-kinship` (the relations[] entity detector), `consistency-character`, per-content-type recall sets, `cliffhanger-overloaded`, `opening-weather` | **supersedes this doc's "LLM fixtures not yet authored" rows for pov-leak and flaw-pattern — convert/sync those from the product instead of authoring fresh** |

### C. Neither repo has (the true bare spots)

| Gap | Note |
|---|---|
| `l4.emotion-flatness` · `l4.suspense-level` · `l4.thread-coverage` | no adapter, no gold anywhere; bench has only local proxies — the L4 LLM tier is the one layer with zero evaluation assets on either side |
| The canonical-order timeline DETECTOR itself | decided 2026-07-20: build product-side (R2); fixtures in this repo are its spec |

### The one move that collapses A+B

The repos are each self-consistent but non-interoperable; what is missing is
the SEAM, not more assets. The product's declared adapter point
(`lib/ai/guardian/bench/types.ts` — "when narrative-bench updates its fixture
format, this file is the seam to update") plus this repo's structured
`chapterId`/`detectorId`/`substring` annotations are both in place. One
working session at that seam: (1) re-point proofread gold to this repo
(bench-is-canon decision), (2) convert the product's pov-leak/flaw-pattern
gold into this repo's format, (3) add an `l1.constraint-violation` adapter so
1B.4 gets its first P/R numbers. After that, only row C needs new authoring.

**Status 2026-07-30: all three landed.** (2) synced 07-19/22; (3) product
#262 + staging `643d7a46e` (07-29); (1) completed 07-30 alongside the
transport-bypass repair (staging `63ff934d4`) that made (1) and (3) actually
record/replay instead of silently going live. Row C is the remaining
authoring frontier.
