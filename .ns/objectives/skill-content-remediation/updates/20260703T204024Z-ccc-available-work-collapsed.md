# ccc-available-work duplication collapsed (queue position 10a)

## Summary

Queue position 10 carried an only-if-cheap gate. For
`skills/ccc-available-work/SKILL.md` the gate passed: the confirmed duplication —
every collection command listed in both "Data sources" (with semantics: quick-pass
ordering, evidence rules, scope caveats) and "Read-only command recipe" (bare
commands) — collapses by deleting the recipe section outright. 239 → 194 lines.

Union check before deletion: no command, flag, or sequencing fact existed in the
recipe that "Data sources" 1–9 does not carry (the recipe's `|| true` suffixes
were presentation-only). Nothing else changed.

**Documented method adaptation:** the recorded method was "rewrite (only if
cheap)"; a from-scratch rewrite of 239 lines is not cheap for a cmux-niche
`command-backed` skill, while the targeted deletion captures the confirmed lift
(the twice-listed recipes were the recorded debt, historic lift 5). Judged within
the gate's intent; recorded here rather than applied silently.

## Objective Impact

- `ccc-available-work` remediated (10a). `ccc-stack-map` (10b) follows.
- `roadmap.md`: pair row gains the 10a DONE half.
- Evidence: `areg check` "All skills OK"; `dprint` clean.

## Follow-Ups

- `ccc-stack-map` collapse (same shape, plus relocating the recipe-only
  `data.edges` reading note into Data sources).
