# Guardian v3 coverage gap — bench vs product (2026-07-19)

> Snapshot of what the product's Guardian (creader_editor `main`, guardian-v3
> stage, 32 catalog detectors) has that this benchmark does and does not cover.
> This is the pre-open-source checklist: close or consciously accept every row
> before the MIT/Apache flip.

## How coverage works here

Two mechanisms, by detector execution mode:

- **Local detectors** (product `cost: "local"`) → ported into `src/analyzers/`
  and scored by the local evaluators directly.
- **LLM detectors** (product `cost: "api-light" | "api-heavy" | "vector"`) →
  shipped as annotated gold fixtures tagged `llm-detector`
  (`fixtures/guardian/*.json`). The default `bench guardian` run skips them
  loudly; they feed the LLM-detector evaluation path, which needs an API
  budget.

## Covered (after the 2026-07 sync)

| Product detector | Mechanism |
|---|---|
| l1.dead-character · l1.name-typo | local port (`quick-rules.ts`) |
| l1.constraint-violation | gold fixtures `world-constraints-{en,zh}` |
| l1.timeline-violation | gold fixtures `timeline-violations-{en,zh}` |
| l1.entity-contradiction | gold fixtures `entity-contradictions-{en,zh}` |
| l2 local style family (lexical-illusion, punctuation, unattributed-dialogue, cliche, weasel-words, there-is-starter, temporal-confusion, dialogue-order) | local ports (`style/`) |
| l2.pacing-rhythm · l2.gesture-gloss | **ported 2026-07-19** (`prose-detectors.ts`) |
| l2.proofread | gold fixtures `proofread-{en,zh}` |
| l3.character-arc · l3.causal-chain · l3.quality-deficit | `analysis` evaluator |
| l4.chapter-classifier · l4.cliffhanger · l4.suspense-level · l4.thread-coverage | `chapter-suspense` evaluator |
| l4.opening-quality | **wired 2026-07-19** (`noFalseOpeningErrors` dimension; classifier already computed it) |
| l5.act-structure · l5.inciting-incident · l5.foreshadowing | `plot-structure` evaluator |

## Open gaps

### Medium ports (product-local, but with dependency trees — NOT free)

These are `cost: "local"` in the product catalog, but their implementations
pull in subsystems the bench does not have. Porting each is ~0.5–1d, not a
copy-paste; initially misclassified as trivial, corrected 2026-07-19 after
reading the dependency trees.

| Detector | Why it is not a free port |
|---|---|
| l1.character-inconsistency | needs `mention-extraction` (trait regexes, per-language character modules) + `entity-registry` (KB metadata parsing) ≈ 500+ lines; the bench `FixtureKBEntry` has no structured character-metadata shape, so the KB-contradiction half needs a data-model adaptation, not just a port |
| l5.plot-hole | input is `(chapters, TimelineEvent[], KnowledgeEntry[], locale)` — needs a first-class timeline-event fixture shape plus per-language i18n keys the bench registry lacks |

### LLM fixtures not yet authored

| Detector | Note |
|---|---|
| l2.pov-leak | bench has a LOCAL approximation (`pov-leak-detector.ts`, excluded from Tier 1 as fragile); the product runs it api-heavy — needs gold fixtures + alignment |
| l3.flaw-pattern | character flaw-pattern cases |
| l4.emotion-flatness | emotional-arc cases |
| l5.midpoint | midpoint-structure cases |

### Deferred on purpose

| Detector | Why deferred |
|---|---|
| l3.argument-structure · l3.counterargument-coverage · l3.evidence-claim-alignment | the non-fiction trio (#229) is not yet in the product's own fiction catalog; sync it only after the non-fiction Guardian unification (decided 2026-07-09) lands |

## Known issue

The 4 legacy guardian fixtures score **26.65/100, pass 50%** on their own
local evaluators (verified pre-existing on pristine `main` via A/B — not
introduced by the sync). Root-cause diagnosis is a separate task; fix or
re-annotate before the open-source flip.

## Score-surface changes from the 2026-07-19 sync (disclosed)

- `guardian`: unchanged (26.65/100, pass 50%) — the two ported style detectors
  fired zero issues on the legacy fixtures (no FP on the masterwork traps).
- `chapter-suspense`: 70.58 → 76.47 — the new `noFalseOpeningErrors` dimension
  scored 100 on all three fixtures. This widens the scoring surface; it is not
  an improvement of any pre-existing dimension.
