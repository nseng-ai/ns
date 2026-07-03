# objective-stack-impl re-remediated via from-scratch rewrite

## Summary

Re-remediated `objective-stack-impl` under the from-scratch-rewrite method decided
earlier today (update `2026-06-20T120000`), at explicit user request to redo it. This is
the **first exercise** of both the rewrite method and its extract-contract-then-diff
behavior gate; it also resolves the standing follow-up "decide whether
`objective-stack-impl` warrants a retro-rewrite" — decided **yes**, and done.

Method as run:

1. Extracted the skill's behavioral contract from `SKILL.md` + `references/final-response.md`:
   7 hard boundaries, the resolve steps, context-compaction elements, the tracking gate,
   the 11 preview fields + template + affirmative rule + reviewability principle, all 14
   execute behaviors, subagent-prompt requirements, the named runner-subagent status
   cases, validation + autofix guidance, the 10 stop/ask conditions, manual-recovery
   artifacts, and the final-response pointer.
2. Rewrote `SKILL.md` from scratch against `writing-great-skills` as the sole authority.
3. Diffed the rewrite against the contract line-by-line: every item present;
   the `description` was kept **verbatim**, so routing/trigger behavior is unchanged.

Clarity / LM-friendliness wins (the payoff the surgical method left on the table):

- Leading words introduced — `parent` (the orchestrator owns judgment), `slice` (one
  focused unit), and `verify-independently` (the skeptical-verification stance), the last
  replacing a three-place restatement across former execute steps 9–11.
- The "no hidden state" rule, previously restated ~4× (two hard boundaries, the preview,
  and manual recovery), collapsed to one authoritative boundary; recovery now references
  it rather than re-stating it.
- Runner-subagent status interpretation co-located as a subsection under Execute instead
  of a detached top-level section.

Result: `SKILL.md` 217→136 lines (the prior surgical pass had reached 217;
`references/final-response.md` is unchanged and its pointer still resolves).

## Objective Impact

- `objective.md` Assumptions: the "rewrite buys clarity at acceptable risk because gated"
  assumption marked **exercised once, holding** (217→136 with contract preserved) — one
  data point, not yet a trend.
- `objective.md` Risks: the "from-scratch rewrite is highest-drift; contract-diff is the
  mitigation" risk marked **gate exercised once** (contract-diff + `areg check` + pointer
  check passed, no drift), with the honest caveat that the gate has not yet had to
  *catch* a drop, so its catch-power remains unproven.
- `roadmap.md`: the rewrite row's `objective-stack-impl` target moved from "already
  disclosed / optionally revisit" to **DONE (rewrite method)**, recording the retro-
  rewrite decision and evidence.

Verification: `areg check` "All skills OK"; `just dprint-check` clean. The rewrite row
stays `[~]` — `branch-context-impl` and the other targets remain.

No change to what the skill does — behavior preserved by construction and confirmed by
the contract diff.

## Follow-Ups

- Next rewrite target: `branch-context-impl` (STOP-contract disclosure).
- Resolve the standing Open Question on `python-fake-driven-testing` (consolidate the
  11-file reference tree vs. only sharpen pointers) before rewriting that target.
- The contract-diff gate's catch-power is still unproven (it has only passed, never
  rejected); watch for the first rewrite where it must reject a behavior drop.
