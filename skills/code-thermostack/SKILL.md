---
name: code-thermostack
description: "Run Thermostack: perform a thermonuclear code-quality review of the current branch, rank findings by likelihood their fixes will make it to trunk, propose independently reviewable Graphite follow-up branches, and only after explicit approval create a local child fix stack. Use for Thermostack, thermo stack, thermonuclear follow-up stack, or turning harsh code-quality review findings into a Graphite stack."
---

# Thermostack

Thermostack turns a thermonuclear maintainability review of the current branch into a **local-only Graphite child stack** of follow-up fixes. The original checked-out branch is the base/original change and remains untouched; Thermostack creates approved children above it, ordered from most trunk-likely to most speculative unless a hard dependency requires an explicit inversion.

Thermostack is a parent-session workflow: the main agent owns preflight, ranking, preview, branch creation, implementation, validation, and final reporting. Use exactly one fresh review-only subagent for review collection when the harness supports subagents; do not use parallel implementation worktrees for the fix stack.

## Safety boundaries

- Require explicit user approval after the preview and before any branch, commit, or stack mutation.
- Never submit PRs, push, land, close GitHub state, or mutate remotes.
- Never amend the original branch. Create local child branches above the current stack tip.
- Stop at the first non-confident implementation decision or validation failure. Preserve the completed clean prefix and report pending batches.
- Do not create or leave hidden WIP branches. Delete only an empty/no-code current branch when it is clearly safe; otherwise leave visible state and report the blocker.
- Keep persistence session-local. Thermostack itself does not store review plans in Branch Memory, roaster state, or other durable stores.

## 1. Preflight

1. Use the `graphite` skill for Graphite operations, stack mental model, and recovery guidance.
2. Confirm and record the current branch as the original-change base for this run. Keep this recorded `BASE_BRANCH` for every generated branch name, even after Thermostack checks out the first child branch:
   - `git branch --show-current` must be a non-trunk branch.
   - `git status --short` must be clean before review planning and again before mutation.
3. Confirm the base branch is Graphite-tracked with non-display plumbing such as `gt parent --no-interactive` or `gt children --no-interactive`. Do not parse `gt ls`, `gt log`, or `gt branch info` for machine decisions; use them only as visual confirmation for humans.
4. Check for existing generated branches for this base. Stop if branches matching the exact base prefix already exist (for example `$BASE_BRANCH/thermo-*`) unless the user explicitly chooses a recovery path.
5. Confirm the thermonuclear review skill is installed/readable. Because `thermo-nuclear-code-quality-review` disables model invocation, the reviewer must explicitly load/read `.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` or the exact installed skill by name if the harness supports explicit disabled-skill loading.

## 2. Collect thermonuclear findings

Dispatch one fresh review-only subagent when the harness supports subagents; do not use inline review as a convenience fallback in a subagent-capable harness. The reviewer must edit nothing. Use a prompt with these requirements:

```text
Review the current branch's changes only. Explicitly load/read .agents/skills/thermo-nuclear-code-quality-review/SKILL.md (or the installed skill named thermo-nuclear-code-quality-review if this harness supports explicit skill loading), then perform that thermonuclear maintainability review.

Do not edit files. Return structured findings. For each finding include:
- id
- title
- files/areas
- evidence
- problem
- proposed fix
- behavior-risk notes
- dependency notes
- confidence/risk notes
- validation hints

Prioritize structural regressions, missed code-judo simplifications, spaghetti/branching growth, boundary/type-contract issues, file-size/decomposition, modularity, and maintainability. Include high-risk/high-reward findings too; do not omit speculative but plausible improvements.
```

If the harness genuinely has no subagent capability, run the review inline after reading the thermonuclear skill and label the resulting proposal as **degraded confidence: inline review, no fresh subagent**.

If the reviewer returns vague prose instead of structured findings, restructure it into the fields above before ranking. Do not proceed from ambiguous bullets.

## 3. Rank and batch

Rank findings by **merge-likelihood / trunk confidence**, not by theoretical upside. Use exactly these confidence buckets:

1. `trunk-likely` — low behavioral risk, small blast radius, clear evidence, obvious reviewer acceptability, little dependency uncertainty.
2. `likely` — plausible and bounded, but with some implementation or review uncertainty.
3. `uncertain` — useful but meaningfully dependent on interpretation, tradeoffs, or broader context.
4. `speculative` — high-risk/high-reward, broad, preference-heavy, or likely to need maintainer discussion.

Include every finding in the ordered proposal. Speculative work usually sorts later, but a hard dependency may force an earlier lower-confidence batch. Call every such risk-order inversion out explicitly.

Batch one independently reviewable fix per branch. Combine findings only when they share a root cause, invariant, implementation seam, or hard dependency. Each batch should be reviewable and revertible as its own local child branch.

Branch names must use the recorded original `BASE_BRANCH` as `<base>` and a lowercase kebab slug for `<batch>`:

```text
<base>/thermo-<NN>-<batch>
```

Use two-digit ordering (`01`, `02`, ...). Keep slugs short and collision-safe.

## 4. Preview gate

Before any mutation, present an ordered stack proposal and require explicit approval. For each proposed batch include:

- branch name;
- confidence bucket;
- included finding ids;
- rationale for the rank;
- files/areas expected to change;
- dependencies;
- dependency/risk-order inversions and why they are required;
- validation hints.

Also summarize findings that are included later in the stack so the user can see the speculative tail. If the user changes scope, selected findings, ordering, or batching, regenerate the preview before asking for approval again.

Approval must be explicit, such as "approve Thermostack plan" or "create these branches." If approval is absent or ambiguous, do not mutate.

## 5. Implement sequentially

After approval, implement batches in order in the parent/orchestrator session. Do not parallelize implementation across worktrees or subagents.

For each batch:

1. Recheck `git status --short` is clean.
2. Create the empty child branch from the current stack tip before editing:

   ```bash
   gt create <branch-name> -m "thermo: <batch>"
   ```

   If `gt create` behavior appears different from creating an empty branch on a clean worktree, re-check `gt create --help` and stop rather than improvising.
3. Implement only the approved batch.
4. Run targeted validation from the batch's validation hints plus any nearby project checks needed for confidence.
5. Stage changes and amend the branch:

   ```bash
   gt modify -m "thermo: <batch>"
   ```

6. Confirm `git status --short` is clean before continuing to the next batch.

If implementation becomes ambiguous, validation fails after reasonable local attempts, or a fix requires scope outside the approved batch, stop. Preserve completed clean branches. If the current branch has no code changes and is clearly safe to remove, local-only deletion may be used; otherwise leave the state visible and report the exact blocker and pending batches.

## 6. Final report

Report:

- created local branches in order;
- confidence bucket and rationale per branch;
- commands run and validations performed;
- skipped or pending findings;
- dependency/risk-order inversions;
- any recovery action taken;
- an explicit statement that no PRs were submitted, nothing was pushed, and the original branch was not amended.
