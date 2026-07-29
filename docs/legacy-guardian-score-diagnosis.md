# Legacy guardian score diagnosis — why 26.65/100 (2026-07-29)

> Diagnosis only, per the task charter — no fixes applied. Per-fixture data from
> `pnpm run bench -- --evaluator guardian` (reports/2026-07-29.json).

## Per-fixture verdicts

| Fixture | Passed | Precision | Recall | Lane-A FPs/kwords | Reading |
|---|---|---|---|---|---|
| hamlet-fp-traps | yes | 0 | 100 | 1.73 | healthy (1 punctuation FP) |
| dream-red-chamber-fp-traps | **yes(?)** | 0 | 100 | **7.26** | see finding D |
| synthetic-issues-en | no | 52 | 80 | 3.17 | finding C |
| synthetic-issues-zh | no | **20** | 53 | 6.37 | finding B (the crater) |

## Findings, by impact

### A. The 26.65 number itself is structurally distorted (aggregation defect)

`aggregateScores` averages precision/recall across ALL fixtures. FP-trap
fixtures have `expectedIssues: []`, so their precision is definitionally 0
(TP=0) and recall definitionally 100 — numbers that measure nothing, yet two
of them are averaged into the headline score. The overall 26.65 is therefore
not "half the suite failing"; it is two meaningful scores dragged down by two
meaningless zeros. **Fix shape:** score FP-trap fixtures ONLY on their FP
metric; exclude them from precision/recall means. Expect the headline to jump
materially with zero detector changes — disclose that as a scoring-surface
correction, not an improvement.

### B. zh precision crater (P=20): repetition detector's CJK path + missing properNouns

32 Lane-A FPs on synthetic-issues-zh, dominated by `repetition` flagging
sliding-window character trigrams of NAMES: 「赵太夫」+「太夫人」are two
overlapping windows of one name (赵太夫人), 「王德福」is a character name
recurring legitimately. Two compounding causes:

1. The CJK repetition detector treats overlapping n-gram windows of a single
   long token as "consecutive repetition".
2. `identifyStyleIssues(chapters, properNouns?, locale?)` accepts a
   proper-noun whitelist — the guardian evaluator does not pass one, even
   though every fixture carries a knowledgeBase with exactly these names.
   **Fix shape:** feed `knowledgeBase` titles in as `properNouns`, and
   de-overlap the CJK window logic. Likely recovers most of the 32 FPs.

### C. en precision loss (P=52): three noisy detectors + 3 FNs

Per-detector: `dead-character-appearance` P=18%, `background-overload` P=0%,
`info-dump-dialogue` P=0% (all recall 100 — they fire, just wrongly).
`cliche`/`lexical-illusion` are clean (P=100). 3 of 15 expected issues missed
(FN) — detector-level tuning, second priority after B.

### D. FP-trap pass criterion inconsistent with its displayed metric

dream-red-chamber shows `laneAFPsPerKWords: 7.26` yet `passed: true`, while
the documented FP-trap gate is "Lane A FPs <= 2 per 1000 words". Either the
pass check normalizes differently from the displayed metric (CJK char-vs-word
counting divergence) or it doesn't consult this metric at all. Verify
`evaluateFixture`'s pass branch; a trap suite whose gate doesn't bite is
decorative.

## Repair order (estimates)

1. **A — aggregation correction** (~0.5d): biggest headline effect, zero
   detector risk. Re-baseline and disclose.
2. **B — properNouns + CJK window de-overlap** (~0.5d): recovers zh precision.
3. **D — pass-criterion audit** (~0.25d): make the trap gate real.
4. **C — en detector tuning** (deferred; per-detector, incremental).

Do A+B+D before the open-source flip; C can trail.
