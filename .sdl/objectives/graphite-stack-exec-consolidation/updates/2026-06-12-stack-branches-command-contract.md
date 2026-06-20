# `slot gt exec stack-branches` Contract Settled

## Summary

The canonical structured Graphite stack fact command is designed. Command path: `slot gt exec stack-branches`, registered under a hidden `exec` ClinkrGroup nested in the existing `slot gt` group (files at `packages/asdl-slots/src/asdl_slots/cli/slot/gt/exec/`), per the repo's skill-invoked exec-subgroup convention. `slot gt` is the sanctioned Graphite dependency boundary, so the command introduces no new Graphite coupling.

### Branch list semantics

- Branches are ancestors (trunk-first, trunk excluded) + current (included) + first-child descendants, deduped — trunk-to-tip PR coverage order.
- This deliberately differs from `collect_stack_branches()` in `asdl_slots/cli/slot/gt/stack_walk.py`, which excludes current because its purpose is freeing other slots. Implementation should share the trunk-exclusion/dedupe logic rather than fork it.
- `--downstack` flag (same vocabulary as `slot gt free-stack --downstack`) scopes to trunk → current (ancestors + current), which is always unambiguous.

### Output contract

- Default stdout on exit 0: one compact JSON line, `{"branches": ["b1", "b2", ...]}` — deliberately the exact stdin schema of `pr-address exec map-branch-prs`, so the stack-address preflight becomes a zero-jq pipe: `slot gt exec stack-branches | pr-address exec map-branch-prs --format json`. A newline-delimited list was considered and rejected because it forces consumers back through the brittle `jq -R -s` wrapping this Objective exists to eliminate; human readability is a non-goal for hidden exec surface.
- `--format json`: standard clinkr envelope, `{"exit_code": 0, "data": {"branches": [...], "trunk": "...", "current": "...", "scope": "full" | "downstack", "warnings": [...]}}`.
- Out-of-scope warnings (only possible under `--downstack`) go to stderr in default mode so stdout stays pipe-clean.

### Exit and error contract

- Exit 0 (`ok`): unambiguous stack; branches always non-empty (current is included and non-trunk).
- Exit 1 (`negative`): current branch is trunk — "no stack is checked out", `data.branches: []`. The command never follows an arbitrary child off trunk.
- Exit 2 (`failure`) error types:
  - `untracked_branch` — Graphite does not track the current branch (matches `slot gt up`/`down` wording).
  - `detached_head` / `git_current_branch_failed` — CLI-layer git checks before the gateway call, matching `up.py`.
  - `gt_stack_read_failed` — metadata store missing, unreadable, or schema mismatch; gateway message passed through.
  - `forked_stack` — default scope, any multi-child branch at current or on the descendant walk; message names the fork branch and its children with remediation: check out the intended tip and rerun, or pass `--downstack`. Under `--downstack`, descendant-side forks are out of scope and downgrade to exit-0 warnings.
  - `stack_metadata_inconsistent` — cycles, missing metadata rows, or trunk-marker missing/mismatch/multiple, when relevant to the requested scope; trunk-marker problems are always relevant because trunk exclusion depends on trunk identity.
- Scope-relevant `StackInfo` warnings never ride along on exit 0 in default scope; they are the failure.

### Implementation split discovered

The fail-closed contract cannot be built cleanly on today's `StackInfo`: `asdl_core/gt/metadata_reader.py` reports forks, cycles, and missing rows only as prose warning strings, so the CLI would have to string-match warnings to classify them. The first implementation slice is therefore an `asdl_core.gt` refactor adding structured walk diagnostics to `StackInfo` (walk scope: ancestor/descendant/trunk-marker; kind: fork/cycle/missing-row/marker; branch; children for fork points), with the existing human-readable strings derived from them. The exec command is the second slice.

### Parallel-implementation audit

No duplicate Python implementations of stack discovery exist: `metadata_reader.py` → `StackInfo` → `collect_stack_branches()` is the single chain, and `slot gt free-stack`/`up`/`down` already sit on it. Duplication is confined to agent guidance: `skills/stack-address/SKILL.md` preflight (builds branch lists from `gt ls --stack`; primary migration target), `skills/pr-address/references/cli-collection.md` (suggests `gt ls --stack` as the branch source), `skills/code-workflows/references/delete-stack.md` (instructs discovering stacks from `gt branch info`/`gt ls`/`gt log` output), and the TS `asdl-dev` submit `gt log --stack` parser (already its own roadmap decision). `gt ls`/`gt log` mentions in `code-gt-restack-resolve`, `code-resolve-merge-conflicts`, and `setup-graphite` are human visual confirmation and should remain.

## Objective Impact

- Roadmap design row is complete; its open contract questions (output shape, branch-list scope, current-on-trunk, untracked/missing-metadata errors, fork behavior, warning surfacing) are all settled as above.
- Two of the four open questions in `objective.md` are resolved (first-command scope; fork behavior), and the skill-reference audit question is answered with a concrete hazard/visual-confirmation classification.
- The implement-and-test roadmap row is split: a prerequisite `asdl_core.gt` structured-diagnostics slice now precedes the exec helper itself.
- Evidence basis: design-only analysis of `asdl_core/gt/{types,gateway,metadata_reader,real_gateway}.py`, `asdl_slots/cli/slot/gt/`, clinkr conventions, `ts/packages/pr-address/src/map-branch-prs.ts` input schema, and a repo-wide audit of `gt ls`/`gt log` references. No code changes; no verification commands were applicable.

## Follow-Ups

- Implement the `asdl_core.gt` structured walk diagnostics slice, then the exec command slice (both tracked as roadmap rows).
- When migrating `skills/stack-address/SKILL.md`, also update `skills/pr-address/references/cli-collection.md` and `skills/code-workflows/references/delete-stack.md`, which the audit flagged as machine-decision hazards beyond the originally named targets.
- The deferred broader `stack-info` contract belongs to the existing exec-candidate audit roadmap row.
