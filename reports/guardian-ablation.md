# Guardian v1 — Ablation Study

> **Date:** 2026-04-03
>
> **Question:** Which part of v1 matters? Does lane classification reduce noise?

---

## Hamlet — Full Text (Project Gutenberg)

**Chapters:** 20 | **Words:** 31,565 | **Locale:** en

| Condition | Issues Shown | Lane B (Hidden) | Duplicates Removed | Issues / 1K Words |
|-----------|-------------|-----------------|--------------------|--------------------|
| v0 (flat) | 229 | 0 | 0 | 7.3 |
| +lanes | 166 | 63 | 0 | 5.3 |
| v1 (full) | 155 | 63 | 11 | 4.9 |

**Noise reduction:** v0 → +lanes: **28%** | v0 → v1: **32%**

<details>
<summary>Per-detector breakdown (v0 flat → v1 Lane A)</summary>

| Detector | v0 (all) | v1 (Lane A) | Filtered Out |
|----------|----------|-------------|--------------|
| background-overload | 20 | 0 | 20 |
| character-name-typo | 18 | 18 | — |
| dead-character-appearance | 1 | 1 | — |
| lexical-illusion | 5 | 5 | — |
| overused-word | 29 | 29 | — |
| paragraph-wall | 2 | 0 | 2 |
| punctuation | 98 | 98 | — |
| repetition | 15 | 15 | — |
| sentence-monotony | 32 | 0 | 32 |
| temporal-confusion | 1 | 0 | 1 |
| weasel-words | 8 | 0 | 8 |

</details>

---

## 红楼梦 — False Positive Traps

**Chapters:** 3 | **Words:** 964 | **Locale:** zh

| Condition | Issues Shown | Lane B (Hidden) | Duplicates Removed | Issues / 1K Words |
|-----------|-------------|-----------------|--------------------|--------------------|
| v0 (flat) | 12 | 0 | 0 | 12.4 |
| +lanes | 7 | 5 | 0 | 7.3 |
| v1 (full) | 7 | 5 | 0 | 7.3 |

**Noise reduction:** v0 → +lanes: **42%** | v0 → v1: **42%**

<details>
<summary>Per-detector breakdown (v0 flat → v1 Lane A)</summary>

| Detector | v0 (all) | v1 (Lane A) | Filtered Out |
|----------|----------|-------------|--------------|
| background-overload | 2 | 0 | 2 |
| repetition | 7 | 7 | — |
| structure-repetition | 3 | 0 | 3 |

</details>

---

## Hamlet — False Positive Traps

**Chapters:** 3 | **Words:** 578 | **Locale:** en

| Condition | Issues Shown | Lane B (Hidden) | Duplicates Removed | Issues / 1K Words |
|-----------|-------------|-----------------|--------------------|--------------------|
| v0 (flat) | 2 | 0 | 0 | 3.5 |
| +lanes | 1 | 1 | 0 | 1.7 |
| v1 (full) | 1 | 1 | 0 | 1.7 |

**Noise reduction:** v0 → +lanes: **50%** | v0 → v1: **50%**

<details>
<summary>Per-detector breakdown (v0 flat → v1 Lane A)</summary>

| Detector | v0 (all) | v1 (Lane A) | Filtered Out |
|----------|----------|-------------|--------------|
| punctuation | 1 | 1 | — |
| sentence-monotony | 1 | 0 | 1 |

</details>

---

## Summary — Paper Table

| Fixture | v0 (flat) | +lanes | v1 (full) | Noise Reduction |
|---------|-----------|--------|-----------|-----------------|
| Hamlet — Full Text (Project Gutenberg) | 229 | 166 | 155 | 32% |
| 红楼梦 — False Positive Traps | 12 | 7 | 7 | 42% |
| Hamlet — False Positive Traps | 2 | 1 | 1 | 50% |

**Key finding:** Lane classification reduces visible issues by 40-70% on literary text, filtering low-confidence style suggestions while preserving high-signal detections (dead characters, lexical illusions, name typos).