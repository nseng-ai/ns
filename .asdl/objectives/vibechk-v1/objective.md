# Vibechk v1

## Thesis

Implement `vibechk` as a lightweight, ephemeral evaluation CLI for measuring the impact of agent context changes with shareable evidence. The v1 goal is not to build a full eval framework; it is to let a user run the same plan in two prepared workdirs, capture efficiency metrics and resulting diffs, and publish an idempotent Markdown report into a GitHub PR description.

The source implementation spec is GitHub issue #434: <https://github.com/dagster-io/asdl-tools/issues/434>. The Objective should track the v1 behavior and validation from that issue while leaving v1.5/v2 ideas parked.

## Source Spec Anchors

Issue #434 defines the vocabulary and workflow that should remain recognizable in the implementation:

- A **workdir** is the complete directory view the autonomous agent runs in; `vibechk` captures workdir-after versus workdir-before and does not care whether the workdir is a worktree, clone, copy, or container mount.
- A **plan** is opaque user-written text, usually Markdown, passed verbatim to the runner. V1 does not extract intent from transcripts.
- A **runner** executes one autonomous agent session for a `(workdir, plan, model)` tuple. V1 ships `claude-code`; the abstraction exists for later runners.
- A **bundle** is the persisted run artifact: plan snapshot, transcript, metrics, metadata, and diff.
- A **vibe check** compares two runs with the same plan and different workdirs. The baseline is the old context; the treatment is the new context under evaluation.
- A **report** is Markdown shown by `show` / `diff` or inserted into a PR by `publish`. Comparison reports should top-load the biggest metric deltas, include a metrics table, collapse the plan, show branch references and configuration, and preserve user PR prose outside the fenced block.

The primary user workflow is: prepare baseline and treatment workdirs, run the same plan in each, inspect `vibechk diff`, push the generated `vibechk/<run-id>` branches with ordinary git tooling, create or choose the treatment PR, then run `vibechk publish` to insert the comparison evidence. The single-run workflow is the same shape with one run and one generated branch.

Design choices from the issue should not be accidentally reversed during implementation: baseline means an autonomous re-run with old context, not the original human PR; the user writes the plan; v1 measures efficiency only; N is exactly one per side; there is no default runtime budget; `vibechk` stays local and never pushes or creates PRs; failed runner bundles remain useful evidence rather than being hidden.

## Scope

- Create a standalone workspace package at `packages/vibechk` exposing the CLI command `vibechk`.
- Implement the v1 commands: `run`, `show`, `diff`, `publish`, and `runs`.
- Support a user-level bundle store with `--store DIR`, `$VIBECHK_HOME`, and an XDG-style default location.
- Persist run bundles containing the plan snapshot, transcript, metrics, metadata, and diff patch.
- Require `vibechk run` workdirs to be clean git repositories on branches; capture starting branch, commit, and remotes.
- Run the v1 `claude-code` subprocess runner, stream transcript output incrementally, derive metrics from the transcript, and persist partial bundles for failed runner exits.
- Commit agent-produced workdir changes onto a local `vibechk/<run-id>` branch, return the workdir to the starting branch, and leave pushing/PR creation to the user.
- Render stable Markdown reports for single runs and two-run comparisons.
- Publish reports idempotently into GitHub PR descriptions via `gh`, preserving user prose outside the `vibechk` fence.
- Accept all documented PR reference forms for publish: PR URL, `OWNER/REPO#N`, and bare numbers when the current clone resolves the repo unambiguously.
- Follow repo conventions for Python package layout, CLI construction, gateway/fake test seams, and scenario tests. The module outline in issue #434 is guidance, not a hard file-map requirement.
- Require a real GitHub PR publish smoke before closing the Objective.

## Non-Goals

- Building a heavyweight eval framework with stateful benchmarks, variance analysis, or sampling beyond one run per side.
- Adding quality judgment metrics, test-pass gates, or LLM-as-judge scoring. Human review of the captured branch diff remains the quality signal.
- Managing worktrees, fresh clones, containers, pushing branches, or creating PRs.
- Importing bundles from PRs, tamper detection, verification, or reconstructing evidence from published reports.
- Supporting multiple runner implementations in v1 beyond the `claude-code` runner, although the runner abstraction should leave room for later adapters.
- Requiring live `claude -p` execution as a closure gate; fake-driven automated tests are required, and a live Claude smoke is optional evidence.
- Treating the exact module tree suggested in issue #434 as mandatory when a repo-conventional layout is cleaner.

## Completion Criteria

- `vibechk run --plan PATH [--workdir DIR] [--runner NAME] [--model NAME]` enforces the documented git preconditions, creates a unique 8-character run id, streams transcript output incrementally, persists all required bundle files, and prints the run id.
- Successful runs with workdir changes leave the original workdir clean on the starting branch and create a local `vibechk/<run-id>` branch rooted at the starting HEAD; runs with no changes skip branch creation and record that fact.
- Failed runner exits still produce consumable partial bundles with available metrics and non-zero exit status.
- `vibechk show RUN_ID` resolves unique run-id prefixes and renders a stable single-run Markdown report with plan, metrics, branch reference, workdir, timestamps, runner/model, and version context.
- `vibechk diff BASELINE_ID TREATMENT_ID` renders a stable Markdown comparison report with top-loaded deltas, metrics table, plan, branch references, configuration, and explicit config differences when runner/model/version fields differ.
- `vibechk publish` resolves all documented PR reference forms, checks required branches exist on the PR remote, fetches and edits the PR body through authenticated `gh`, replaces an existing `vibechk` fence idempotently, appends when absent, and short-circuits byte-identical publishes.
- `publish` uses an HTML-comment fence with an id derived from the run ids, preserves all PR prose outside that fence, and documents that multiple vibechk blocks are unsupported.
- `vibechk runs` lists local bundles sorted by most recent start time and provides the documented tabular output plus JSON output.
- Metrics and metadata schemas match the v1 issue contract, with unavailable numeric metrics represented as `null` rather than omitted.
- The test suite includes fake-driven unit and scenario coverage for the canonical comparison flow, single-run flow, dirty/detached/non-git preconditions, failed runner persistence, no-change runs, report rendering, run-id prefix resolution, concurrent store writes or run-id collision handling, PR reference parsing, GitHub fence replacement, and `runs` output.
- A `FakeRunner` or equivalent seam ensures automated tests do not require a real `claude` binary.
- A real GitHub PR publish smoke has been run and recorded before closure, demonstrating idempotent insertion/replacement of the fenced report in an actual PR description.
- The package is wired into the workspace and repo checks pass.

## Assumptions and Risks

Assumptions:

- A standalone `packages/vibechk` package is the right home for v1 and does not need to be an `asdl` plugin.
- Users preparing baseline and treatment workdirs outside the tool is acceptable and keeps v1 composable.
- `claude -p --output-format stream-json --permission-mode bypassPermissions` exposes enough stream data to derive the required efficiency metrics.
- Eight-character hex run ids are sufficient for a local bundle store when regenerated on collision.
- Git branch and commit operations can be implemented through repo-conventional git seams without requiring Graphite at runtime.
- GitHub publishing can be tested mostly with fakes, while one real PR smoke provides enough live confidence for closure.
- Users will accept branch diffs as the human-reviewed quality signal, so reports should make generated branch references easy to find.

Risks:

- Claude stream-json event shapes may vary across versions; metric parsing should degrade gracefully and leave unavailable fields as `null`.
- Auto-staging and committing all workdir changes is powerful; precondition checks, switch-back behavior, and tests must avoid leaving user workdirs dirty or on unexpected branches.
- PR reference resolution and remote branch validation can become ambiguous in repos with multiple remotes or fork-style setups; errors must name the ambiguity clearly.
- Live GitHub publish validation depends on `gh` authentication, network availability, and a suitable test PR, so closure evidence must record exactly what was exercised.
- Markdown rendering and fence replacement can accidentally clobber user prose if marker matching is too broad; idempotency tests should cover existing prose and repeated publishes.
- The bundle schema may become a de facto public interface immediately, so v1 should avoid underspecified optional fields and keep future additions additive.
- The deliberate absence of a default runtime budget keeps the tool honest but can surprise users with long or costly agent runs; help text and docs should make that behavior explicit.

## Open Questions

- After the Objective exists and/or after v1 ships, should issue #434 be updated or closed with a pointer to the checked-in Objective, or should GitHub issue state remain independent bookkeeping?
