# Clean Up the Canonical TypeScript areg CLI

## Thesis

The TypeScript `areg` CLI is now the canonical implementation: the `areg-typescript-port` Objective intentionally deferred broader architecture cleanup so it could remove Python without blocking on it. Two independent thermo-nuclear code-quality reviews (OpenAI Codex GPT-5.5 and Claude Opus 4.8, both at commit `f6c8e061d`) surfaced eleven structural findings (A–K) on that canonical implementation. This Objective tracks turning those parked findings into a fix-or-deliberately-defer outcome so the structural debt the migration locked in does not become "the way areg is."

The findings span one real worktree-breaking bug, a contradictory skill-kind domain model split across two commands, magical replacement verification, half-applied mutation paths, verbatim duplication, dead/contract-lying code, and decomposition/version-source taste items. The combined review and prioritization live in `review-findings/2026-06-15-areg-ts-cli-combined-review.md`.

## Scope

This Objective covers the eleven combined-review findings against `ts/packages/areg`, batched by priority tier. None are parked; each must land or be explicitly deferred-with-reason.

- **Correctness + cheap, behavior-preserving cleanup (Batch 1):**
  - Fix `readLocallyExcludedSkillNames` to resolve the git exclude path through `GitGateway` / `git rev-parse --git-path info/exclude` so linked worktrees stop silently missing exclusions (F).
  - Extract verbatim duplications: one `inspectGenericReplacement`, one `.pi/settings.json` parser shared by `check`/`skill-kind`, one `rejectTextState`, one `errorInfo`; delete the dead `errorInfo` export in `init.ts` (B).
  - Delete the dead `runner` constructor option/field on `RealAregHostGateway` (H).
  - Drop the ignored `cwd`/`env` fields from `AregSkillxWorkspaceCleanupRequest` so the type states the real invariant (I).
  - Collapse the six identity-only `*PathState`/`*TextFileState` aliases to one canonical `AregPathState`/`AregTextFileState` pair (A, alias slice).
- **Unify the skill-kind / replacement model (Batch 2):**
  - Make `areg check` and `areg skill list/show/apply` consume one typed skill-kind classifier instead of the contradictory bespoke `checkInvokeOnly` logic (C).
  - Replace unconditional `verified: true` / global file-existence "verification" with a real per-surface replacement contract (`hasReplacement(surface)` or verified replacement inventory) (D).
- **Mutation robustness (Batch 3):**
  - Give `runInit` and `runSkillKindApply` a full preflight over every target before any mutation, then apply one composed plan; or expose explicit partial-state evidence if rollback stays out of scope (E).
- **Deeper structural decomposition (Batch 4):**
  - Collapse the four near-identical project-inspection gateways toward one `AregProjectInspectionGateway` / shared `inspectProject` core and split the `real-gateways.ts` / `fake-gateways.ts` monolith by capability (A, gateway-collapse slice).
  - Split `skill-kind.ts` into `{inference, apply-plan, frontmatter-edit}`; document why frontmatter parse and rewrite cannot share one parser (J).
- **Opportunistic (Batch 5):**
  - Move shim rendering into a tested, shell-quoting generator exercised with adversarial checkout paths (`&`, `|`, backslash) (G).
  - Collapse the version triple source of truth (`cli.ts` literal, `package.json`, shim test literal) to a single source if `buildCli` can read the package version (K).

## Non-Goals

- Do not reopen the `areg-typescript-port` cutover strategy or restore the Python `packages/areg` path.
- Do not redesign `areg` as an `asdl` plugin or rename the public command.
- Do not rewrite the upstream `npx skills` CLI or the external skills distribution model.
- Do not broaden into a general audit of skills or other `ts/` packages beyond the A–K findings and their directly coupled code.
- Do not introduce shared TypeScript abstractions solely to mirror the old Python module structure; extract only where a second consumer proves the seam.
- Do not add routine validation-only roadmap rows; tests, `areg check`, and repo checks are completion evidence for semantic rows.

## Completion Criteria

- Every finding A–K is either fixed structurally or explicitly recorded as intentionally deferred with a clear reason (a roadmap row marked deferred plus a closing-update note is sufficient).
- Linked worktrees correctly honor local skill exclusions through a Git-aware exclude path (F), with regression coverage.
- `areg check` and `areg skill` share one skill-kind classifier and no longer disagree about what `invoke-only`/command-converted means (C).
- Replacement verification reflects a real per-surface contract rather than an unconditional or globally-inferred boolean (D).
- `areg init` and skill-kind apply cannot leave predictable half-applied state after a local validation/write failure, or partial-state behavior is intentional, documented, and surfaced (E).
- The confirmed verbatim duplications (B) and dead/contract-lying code (H, I) are gone, and the identity aliases are collapsed to one canonical pair (A-aliases).
- The gateway-collapse and `skill-kind.ts` decomposition (A-collapse, J) are either landed or recorded as a deliberately deferred follow-up with rationale.
- Shim rendering safety (G) and the version source-of-truth (K) are either fixed or deferred-with-reason.
- Targeted tests and relevant `ts/` repo checks pass as evidence for each changed area.

## Definition of Progress

Progress is keepable when:

- A whole batch (or a coherent finding within it) is implemented behind the existing fake-driven gateway seams with passing targeted tests and `ts/` checks.
- A behavior-preserving refactor (Batch 1, A-aliases, B, H, I) lands green with no contract change to user-facing CLI output or agent-facing JSON shapes.
- A deliberate deferral is recorded as a roadmap row note plus a closing-update reason, rather than left silent.

Do not keep changes that:

- Alter user-facing `areg` CLI output or hidden `exec skillx` JSON contracts without an explicit, recorded decision.
- Leave the TS suite red or `areg check` failing.
- Begin the gateway-collapse (A) or `skill-kind.ts` split (J) as a half-done large refactor without landing a coherent slice.

Useful evidence includes:

- `pnpm --dir ts run test`, `pnpm --dir ts run check`, or `just ts-test` output for the changed areas.
- `areg check --path .` output where exclusion/skill-kind behavior changed.
- Grep/diff evidence that a duplication or dead symbol is actually gone.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below. It supports human-assisted execution after preview, not unbounded autonomous pursuit.

- **Direct execution is allowed when:** the row is in Batch 1 (F, B, H, I, A-aliases) — these are mechanical, behavior-preserving, and covered by existing scenario/gateway tests. Execute after preview and validate with the TS suite.
- **Steer or ask first when:** the row changes a domain model or contract (C, D), reshapes mutation flow (E), or is a deeper refactor (A gateway-collapse, J). Confirm the target design before large edits, and confirm any user-facing CLI/JSON contract change.
- **How work may change files and be left:** edits are scoped to `ts/packages/areg/**` and its tests; leave each landed slice green and self-contained. Do not interleave unrelated batches in one commit.
- **Validation before keeping work:** run the relevant TS validation (`pnpm --dir ts run test` / `run check` or `just ts-test`) and, where exclusion/skill-kind behavior changed, `areg check`. Default to full TS validation rather than narrowing scope.
- **What will not happen unless explicitly requested:** no PR submission, no publishing/deploying, no GitHub issue/PR mutation, no changes outside `ts/packages/areg` (including the parent `areg-typescript-port` Objective record), and no Python `packages/areg` resurrection.

## Assumptions and Risks

Assumptions:

- These eleven findings are the "broader architecture cleanup" that `areg-typescript-port` deliberately parked; this Objective is the right tracking home for them, separate from the closed `areg-review-remediation` (which covered the pre-migration Python branch).
- The combined review's line-level claims (e.g., the dead `runner` field, the dead `errorInfo` export, the worktree `.git`-as-file path) are accurate; the safe-deletion items (F, B, H) should be grep-verified once before acting.
- The existing fake-driven gateway/scenario tests are sufficient to keep Batch 1 behavior-preserving without new infrastructure.
- The standalone `areg` CLI and its current user-facing/agent-facing contracts remain the durable surface during this cleanup.

Risks:

- **F is a live behavioral bug, not taste:** linked worktrees silently miss exclusions today; deferring it ships wrong results. It is prioritized first for that reason.
- The skill-kind unification (C) and replacement-contract change (D) touch real semantics across two commands; a careless merge could change `areg check` diagnostics. Mitigate by unifying behind one classifier with tests before deleting `checkInvokeOnly`.
- The gateway-collapse (A) is the highest-leverage but highest-cost item; sequencing it before C/D would mean redoing it once the skill-kind model changes what gateways must expose. It is intentionally last and may be deferred-with-reason rather than forced.
- Decomposition/version items (J, K) are taste/nice-to-have; the risk is over-investing in them. They are last and explicitly eligible for deferral.
- If the parent `areg-typescript-port` Objective is closed without pointing here, this parked cleanup could be lost; updating that Objective to reference this slug is advisable but is out of this Objective's mutation scope.

## Open Questions

- For E, is rollback genuinely out of scope (preflight-only, with partial-state evidence on failure), or should at least `runInit` become atomic? Resolve before implementing Batch 3.
- For A, do we commit to one `AregProjectInspectionGateway`, or stop at the shared `inspectProject` core with thin per-feature wrappers? Decide at the start of Batch 4.
- For K, can `buildCli` read the package version at runtime under the Node ESM/pnpm build, or does bundling make the `cli.ts` literal the pragmatic single source? Confirm before touching version wiring.
