# `slot gt exec` Consolidation Candidates Audited

## Summary

Audited remaining structured-Graphite-fact needs across `asdl_slots/cli/slot/gt/`, `asdl_core/gt/`, agent skills (`skills/`, `.claude/skills/`), and TypeScript packages. Decision: **no new `slot gt exec` command is justified now.** The candidates named by the roadmap row are rejected or already covered, and the two real hazards the audit surfaced are guidance migrations onto existing Graphite plumbing, not new helpers.

### Candidate matrix

- **Broader `stack-info` command** — **Reject (no consumer).** `slot gt exec stack-branches --format json` already carries trunk, current, scope, and warnings; the audit found no consumer needing stack facts beyond that payload. If a future consumer appears, grow the JSON payload before adding a second command.
- **Descendant subtree / fork-structure query for an arbitrary root** — **Reject (deliberately human-gated).** The only potential consumer is delete-stack's "narrower `root_branch` plus descendants" deletion, which intentionally treats `gt branch info <root>`/`gt ls`/`gt log` as visual/advisory evidence and asks the user, because the operation is destructive and the descendant set can be ambiguous. Automating subtree discovery there would remove a deliberate confirmation gate. Current-stack fork structure is already structured: the `forked_stack` failure names the fork point and its children.
- **Current tracking status command** — **Reject (already covered).** `stack-branches` classifies the untracked case deterministically (`untracked_branch`, exit 2, `gt track` remediation), and `gt branch info` remains available as raw diagnostics through the gateway. A dedicated command would duplicate the existing contract.
- **Parent-branch fact** *(new finding)* — **No command needed; guidance migration.** `skills/objective-update/SKILL.md` and `skills/code-workflows/references/parity-review.md` instruct agents to run `gt branch info` and extract `Parent: <branch>` for diff-base decisions — the same display-output-parsing hazard class this Objective exists to eliminate, just against `gt branch info` instead of `gt ls`/`gt log`. Graphite plumbing `gt parent --no-interactive` already emits the bare parent branch name (`RealGtGateway.parent_of` depends on it). Migrate the guidance to plumbing; folded into the documentation-loop roadmap row.
- **Upstack-descendants decision gate** *(new finding)* — **No command needed; guidance migration.** `skills/code-gt-restack-resolve/SKILL.md` decides whether to ask the restack scope question and whether to skip slot consolidation by reading "children above the current `◉`" in `gt log short`/`gt ls` — a machine decision from display output. `gt children --no-interactive` (empty output ⇒ no upstack children) or `slot gt exec stack-branches --format json` answers it without display parsing. Folded into the documentation-loop roadmap row. The skill's other `gt ls`/`gt log` mentions (preflight tracked check that relies on the command itself failing closed with a `gt track` hint; post-completion clean-stack confirmation) remain acceptable.
- **Graphite mutation wrappers** — **Remain rejected (parked).** No safety policy was found that Graphite itself lacks; the parked roadmap item stands.
- **CCC landing topology (`ts/packages/ccc/src/land-stack/stack-facts.ts`)** — **Remains parked.** It duplicates trunk/topology reads but with landing-specific, stronger checks; no new maintenance pain observed.

### Visual-confirmation mentions confirmed acceptable

`gt ls`/`gt log` mentions retained as human-visual or advisory: `code-gt-restack-resolve` and `code-resolve-merge-conflicts` post-completion checks, `setup-graphite` (human-facing setup docs), `stacker-agent` (optional stack display to the user), `gt-stackify-branch` (evidence block only; its trunk detection already uses git plumbing, not `gt ls` parsing), and `delete-stack` (already migrated; remaining mentions are explicitly visual-only).

### Note for the submit-parser roadmap row

`ts/packages/asdl-dev/src/submit-format.ts` also buffers `gt branch info --no-interactive` output for current-PR verification, alongside the `gt log --stack` parser in `submit-pr-metadata-prewrite.ts`. The submit-parser decision should cover both surfaces.

## Objective Impact

- The "Audit additional `slot gt exec` consolidation candidates" roadmap row is complete with no implementation slice spawned.
- The "Close the documentation loop" row's scope now includes the two guidance migrations and extends the no-display-parsing rule to `gt branch info`.
- The remaining open question in `objective.md` (where the preflight consolidation lives) is now recorded as resolved: it shipped as the Graphite-neutral `pr-address exec stack-feedback-preflight` composed with `slot gt exec stack-branches`.
- Evidence basis: ripgrep sweeps for `gt ls`/`gt log`/`gt branch info`/tracking/fork/descendant references across `skills/`, `.claude/skills/`, `ts/packages/*/src`, and `packages/*/src`; close reads of `asdl_core/gt/{gateway,types,real_gateway}.py`, `asdl_slots/cli/slot/gt/exec/stack_branches.py`, and the delete-stack, parity-review, objective-update, and code-gt-restack-resolve skill texts. No code changes; markdown-only tracking edits.

## Follow-Ups

- Execute the two guidance migrations as part of the documentation-loop row: `gt parent --no-interactive` replaces `gt branch info` `Parent:` extraction in `objective-update` and `parity-review`; `gt children --no-interactive` or `stack-branches` replaces the upstack-children display check in `code-gt-restack-resolve`.
- When deciding the `asdl-dev submit` parser row, include the `submit-format.ts` `gt branch info --no-interactive` verification surface in the same decision.
