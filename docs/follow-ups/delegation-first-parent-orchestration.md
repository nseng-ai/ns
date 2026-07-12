# Follow-up: Delegation-first parent orchestration

**Point in time:** 2026-07-11\
**Origin:** token-accounting analysis of the parent orchestrator session for the `flow-land-execution-migration` branch-context implementation (Pi session `019f5416-b5d2-7094-8feb-cede7d947dd5`, slot-03), which exhausted its ~272K context window and force-compacted at 268,363 tokens\
**Status at capture:** design grilled to shared understanding; deliberately not yet formed into an Objective

## Why this follow-up exists

A ten-slice migration was orchestrated correctly at the delegation level — every slice ran in a `task` subagent, and subagent result summaries were compact — yet the parent session still ran out of context before the user's post-work questions could be answered. The parent burned its window on **direct ingestion of raw repository output**: cumulative git diffs, broad rule/document reads, and verbose searches, all of which stayed resident on the active session branch (provider caching reduces cost, not context occupancy).

The conclusion is that subagent-per-slice execution is necessary but not sufficient. Parent orchestrator sessions need an explicit discipline, and plans that prescribe multi-subagent execution should carry that discipline with them.

## Point-in-time evidence

Measured from the session JSONL with Pi's own chars/4 estimator (`estimateTokens`), against a final context of 268,363 tokens:

| Source                                     |     Chars | Est. tokens |  Share |
| ------------------------------------------ | --------: | ----------: | -----: |
| Bash results: git diff content (51 calls)  | ~337–383K |     ~84–96K |   ~31% |
| Parent reads of repo rules/code (43 reads) |      224K |        ~56K |   ~21% |
| Bash results: searches/status/inventories  |      201K |        ~50K |   ~19% |
| Subagent prompts (17 dispatches)           |       54K |      ~13.5K |     5% |
| Pi docs read post-work (the final trigger) |       51K |      ~12.7K |   4.7% |
| **Subagent result summaries (17 results)** |   **32K** |     **~8K** | **3%** |
| Other tool-call arguments                  |       31K |       ~7.7K |   2.9% |
| User messages incl. attached plan          |       22K |       ~5.4K |     2% |
| Parent visible text + reasoning            |       32K |       ~8.1K |     3% |

Key structural findings:

- Because all ten slices stayed as one cumulative uncommitted diff, later parent reviews replayed earlier slices: across parsable diff sections, 336,887 chars were emitted where one largest snapshot per path would have been 186,931 — a **1.80× replay amplification** (~37.5K est. tokens of pure replay). Individual files were diffed 4–7 times (`stack/landing-operations.ts` 4×/40K chars, `land-import-direction.test.ts` 7×).
- The parent received **538K chars of bash output and 275K chars of read output, versus 32K chars of subagent summaries** — delegation results were ~17× cheaper than the parent's own inspection.
- Implementation orchestration alone consumed ~247K (~91% of the window); a routine documentation lookup afterward (+19K) forced compaction.
- Largest single parent-growth steps between model calls were all slice-review batches of `git status` + full-file `git diff` + test reads (+25K, +18.2K, +17.9K, +15.5K, +14.8K, +14.3K).

These numbers are a single-session snapshot on one model with a ~272K window. Re-measure before hardening thresholds.

## Grilled design decisions (2026-07-11)

The design was stress-tested through a structured grill session; these decisions were reached explicitly:

1. **Form — hybrid.** A canonical standing skill carries the full protocol; orchestration-heavy plans carry a compact inlined contract block plus a reference to the skill. Plans stay self-contained; the skill stays the living document.
2. **Core rule — delegation-centric.** *The parent orchestrator never ingests raw repository output.* Diff review, test-log reading, and status synthesis are dispatched to inspection subagents that return compact structured verdicts. Output hygiene (redirect logs, summarize) and slice-diff scoping (inventory-first, current-slice-only, temp-index or staging separation) become instructions **inside the inspection-child prompts**, not parent behavior.
3. **Injection — judgment-based doctrine, not tooling.** Planning guidance (the `write_saved_plan_file` doctrine and branch-context planning skill) requires the contract block in any plan that prescribes multi-subagent execution. The exact contract text lives once in the skill's `references/` so plan authors copy it verbatim rather than re-derive it. Mechanical injection by plan-save tooling was considered and rejected as premature.
4. **Tooling scope — prose plus one artifact.** v1 ships the skill, the contract block, and a reusable **inspection-subagent prompt template** (inputs: slice intent, changed-path scope, validation commands; output: structured verdict — files touched, anomalies, boundary violations, validation pass/fail summary). CLI push-down of the inspection commands and harness-side context-threshold warnings are named **promotion paths**, explicitly out of v1.
5. **Integration — new standalone skill with cross-references.** Small edits point `objective-runner-step`, `objective-autorun`, and planning doctrine at the new skill. No rewrite of the runner skills (the analyzed blowup was plan-driven, not runner-driven). No `orientation.md`: the discipline binds parent-orchestrator sessions only, which the skill plus plan contract already reach.
6. **Closure — artifacts-only.** The eventual Objective closes when skill + template + contract block + cross-references are shipped and validated. Dogfood runs are tracked as follow-up evidence, not a closure gate.
7. **Numbers — defaults, overridable per plan with stated justification.** Provisional defaults: roll over / hand off at ~60% of the context window; delegate any inspection expected to exceed ~50–100 lines of output; per-slice parent-context growth budget on the order of 8K tokens. All derived from the single analyzed session; treated as defaults, not doctrine.

## Draft contract block (starting point for the skill's `references/`)

> **Parent orchestration context contract.** This plan prescribes multi-subagent execution. The parent session is an orchestrator: it reads summaries, never raw repository output.
>
> - Dispatch inspection subagents for diff review, test-log reading, and status synthesis; require structured verdicts, not transcripts.
> - Never emit a successful validation log or a full diff into parent context. Anything expected to exceed ~50–100 lines of output is a child's job (default; override with justification).
> - Keep child prompts thin: point at the Objective/plan and repo rules; do not restate the global contract per slice.
> - Children load deep rules (language style, testing architecture, domain context); the parent holds only coordination-level constraints.
> - Track parent context growth per slice (~8K default budget). Hand off to a fresh parent session at ~60% of the window; do not run the window to pressure.
>
> Full procedure: see the `<skill-name>` skill.

## Unresolved design choices

- **Naming.** Candidates for the Objective slug / skill name: `delegation-first-orchestration` (names the rule), `parent-context-discipline`, `orchestrator-context-budget`. Resolve during Objective drafting against `CONTEXT-MAP.md` vocabulary.
- **Default numbers.** The 60% / 50–100-line / 8K-per-slice figures are single-session evidence. Decide during drafting whether to restate, re-derive, or soften them.
- **Slice separation mechanics.** The inspection-child instructions need a concrete convention for "current slice only" diffs when work is intentionally uncommitted: temporary `GIT_INDEX_FILE` snapshots vs. real staging vs. per-slice local commits (the objective-runner already owns per-step commits; ad-hoc plan orchestration does not).
- **Promotion targets.** Where the inspection pattern promotes if the prose proves repetitive: a tested `ns` CLI helper (per `cli-push-down`), a dedicated subagent policy in `ns-pi-subagents`, or a harness warning at context thresholds (the closed `context-profiler` Objective is diagnostic, not preventive — a natural adjacency).

## Relationship to adjacent work

- `docs/follow-ups/objective-context-management-and-compaction.md` addresses the *artifact* side of the same pressure (Objective records growing unboundedly); this note addresses the *behavioral* side (parent sessions ingesting raw output). They are complementary and should not be merged into one Objective without a shared thesis.
- The `objective-runner` Objective (closed) already embodies part of the philosophy: thin prompt construction and parent-judged checkpoints. This follow-up generalizes the discipline to plan-driven orchestration outside the runner loop.

## Reverify before acting

- Re-measure a recent orchestration-heavy parent session (the analysis method: parse the session JSONL, categorize tool-result chars, apply chars/4) — harness behavior, models, and window sizes change.
- Confirm the current shape of planning doctrine (`write_saved_plan_file` guidance, branch-context planning skill) and the runner skills before choosing cross-reference points.
- Check whether any active Objective has since claimed this territory.

## Promotion criteria

Form the Objective when someone is ready to ship the four v1 artifacts (skill, contract block, inspection-prompt template, cross-references) in one or two PRs. The design above is grilled and complete enough to draft the Objective thesis and roadmap directly from this note.
