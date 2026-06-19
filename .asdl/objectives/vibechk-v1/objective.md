# Vibechk v1

## Thesis

Implement `vibechk` as a lightweight, ephemeral evaluation CLI for measuring the impact of agent context changes with shareable evidence. The v1 goal is not to build a full eval framework; it is to let a user run the same plan in two prepared workdirs, capture efficiency metrics and resulting diffs, and publish an idempotent Markdown report into a GitHub PR description.

The source implementation spec is GitHub issue #434: <https://github.com/dagster-io/asdl-tools/issues/434>. The Objective should track the v1 behavior and validation from that issue while leaving v1.5/v2 ideas parked.

Migration pause: remaining unimplemented v1 feature work is paused while `.asdl/objectives/vibechk-typescript-port/` ports the already-implemented Python surface to TypeScript. This Objective remains the product source for the full v1 behavior after that migration; the port Objective owns the language cutover and should not expand scope into the missing v1 features.

## Scope

### Source Spec Anchors

Issue #434 defines the vocabulary and workflow that should remain recognizable in the implementation:

- A **workdir** is the complete directory view the autonomous agent runs in; `vibechk` captures workdir-after versus workdir-before and does not care whether the workdir is a worktree, clone, copy, or container mount.
- A **plan** is opaque user-written text, usually Markdown, passed verbatim to the runner. V1 does not extract intent from transcripts.
- A **runner** executes one autonomous agent session for a `(workdir, plan, model)` tuple. V1 treats `claude`, `codex`, and `pi` uniformly as runner adapters behind the same contract; differences in observability are captured as runner-specific artifacts and normalized metrics with unavailable values set to `null`.
- A **bundle** is the persisted run artifact: plan snapshot, transcript, metrics, metadata, and diff.
- A **vibe check** compares two runs with the same plan and different workdirs. The baseline is the old context; the treatment is the new context under evaluation.
- A **report** is Markdown shown by `show` / `diff` or inserted into a PR by `publish`. Comparison reports should top-load the biggest metric deltas, include a metrics table, collapse the plan, show branch references and configuration, and preserve user PR prose outside the fenced block.

The primary user workflow is: prepare baseline and treatment workdirs, run the same plan in each, inspect `vibechk diff`, push the generated `vibechk/<run-id>` branches with ordinary git tooling, create or choose the treatment PR, then run `vibechk publish` to insert the comparison evidence. The single-run workflow is the same shape with one run and one generated branch.

Implementation sequencing should prioritize a thin, incomplete vertical slice of that workflow before hardening every supporting surface: run a plan in two prepared workdirs, inspect `vibechk diff`, and have Markdown evidence that can be manually pasted into a PR. Store polish, complete runner parity, `runs`, and `publish` should deepen the loop after the first real comparison is possible.

Design choices from the issue should not be accidentally reversed during implementation: baseline means an autonomous re-run with old context, not the original human PR; the user writes the plan; v1 measures efficiency only; N is exactly one per side; there is no default runtime budget; `vibechk` stays local and never pushes or creates PRs; failed runner bundles remain useful evidence rather than being hidden.

### Implementation Scope

- Create a standalone workspace package at `packages/vibechk` exposing the CLI command `vibechk`.
- Historical/current implementation baseline: v1 began as a Python package following this repository's Python package and fake-driven testing conventions. Further product feature work in Python is paused while the TypeScript port Objective migrates the already-implemented surface.
- Implement the v1 commands: `run`, `show`, `diff`, `publish`, and `runs`.
- Support a user-level bundle store with `--store DIR`, `$VIBECHK_HOME`, and an XDG-style default location.
- Persist run bundles containing the plan snapshot, transcript, metrics, metadata, and diff patch.
- Require `vibechk run` workdirs to be clean git repositories on branches; capture starting branch, commit, and remotes.
- Run v1 runner adapters for `claude`, `codex`, and `pi` through subprocess/RPC-style integration as needed, stream raw transcript/event output incrementally, derive normalized metrics from each runner's available data, and persist partial bundles for failed runner exits.
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
- Building runner-specific product surfaces or making Pi a special SDK-native v1 path; `claude`, `codex`, and `pi` should enter through the same Python runner contract.
- Requiring live execution of `claude`, `codex`, or `pi` as a closure gate; fake-driven automated tests are required, and live runner smokes are optional evidence.
- Implementing the remaining v1 product features in Python while the TypeScript migration is active; `publish`, `codex`, `pi`, and real publish smoke evidence should resume after the already-implemented surface is TS-default.
- Treating the exact module tree suggested in issue #434 as mandatory when a repo-conventional layout is cleaner.

## Completion Criteria

- `vibechk run --plan PATH [--workdir DIR] [--runner NAME] [--model NAME]` accepts `claude`, `codex`, and `pi` runner names, enforces the documented git preconditions, creates a unique 8-character run id, streams transcript/event output incrementally, persists all required bundle files, and prints the run id.
- Successful runs with workdir changes leave the original workdir clean on the starting branch and create a local `vibechk/<run-id>` branch rooted at the starting HEAD; runs with no changes skip branch creation and record that fact.
- Failed runner exits still produce consumable partial bundles with available metrics and non-zero exit status.
- `vibechk show RUN_ID` resolves unique run-id prefixes and renders a stable single-run Markdown report with plan, metrics, branch reference, workdir, timestamps, runner/model, and version context.
- `vibechk diff BASELINE_ID TREATMENT_ID` renders a stable Markdown comparison report with top-loaded deltas, metrics table, plan, branch references, configuration, and explicit config differences when runner/model/version fields differ.
- `vibechk publish` resolves all documented PR reference forms, checks required branches exist on the PR remote, fetches and edits the PR body through authenticated `gh`, replaces an existing `vibechk` fence idempotently, appends when absent, and short-circuits byte-identical publishes.
- `publish` uses an HTML-comment fence with an id derived from the run ids, preserves all PR prose outside that fence, and documents that multiple vibechk blocks are unsupported.
- `vibechk runs` lists local bundles sorted by most recent start time and provides the documented tabular output plus JSON output.
- Metrics and metadata schemas match the v1 issue contract at the normalized layer, with runner name/version/config recorded, raw runner artifacts preserved, and unavailable numeric metrics represented as `null` rather than omitted.
- The test suite includes fake-driven unit and scenario coverage for the canonical comparison flow, single-run flow, dirty/detached/non-git preconditions, failed runner persistence, no-change runs, report rendering, run-id prefix resolution, concurrent store writes or run-id collision handling, PR reference parsing, GitHub fence replacement, `runs` output, runner selection/config-difference reporting, and per-runner metric normalization.
- A `FakeRunner` or equivalent seam ensures automated tests do not require real `claude`, `codex`, or `pi` binaries.
- A real GitHub PR publish smoke has been run and recorded before closure, demonstrating idempotent insertion/replacement of the fenced report in an actual PR description.
- The package is wired into the workspace and repo checks pass.

## Assumptions and Risks

Assumptions:

- A standalone `packages/vibechk` package remains the right home for v1 and does not need to be an `asdl` plugin; the initial scaffold validated that home with workspace wiring, help/version behavior, and repo validation passing.
- User-facing workflow feedback is more valuable early than complete infrastructure polish; the thin `run -> show/diff` walking skeleton and `runs` listing now validate the local bundle loop, so remaining v1 work should deepen runner parity, `publish`, and hardening around the proven bundle/report shape.
- Users preparing baseline and treatment workdirs outside the tool is acceptable and keeps v1 composable.
- The `claude`, `codex`, and `pi` CLIs can each be driven non-interactively from Python in a supplied clean workdir, even if their output formats and available metrics differ.
- Treating Pi through the uniform runner interface is acceptable for v1; direct Pi SDK session forking/resource-manifest evaluation can wait until after the first Python CLI proves the bundle/report workflow.
- Eight-character hex run ids are sufficient for a local bundle store when regenerated on collision.
- Git branch and commit operations can be implemented through repo-conventional git seams without requiring Graphite at runtime.
- GitHub publishing can be tested mostly with fakes, while one real PR smoke provides enough live confidence for closure.
- Users will accept branch diffs as the human-reviewed quality signal, so reports should make generated branch references easy to find.

Risks:

- Runner output/event shapes may vary across `claude`, `codex`, and `pi` versions; metric parsing should be per-runner, degrade gracefully, and leave unavailable fields as `null` while preserving raw artifacts.
- A uniform runner contract can hide meaningful capability differences; reports should surface runner/model/version/config differences so cross-runner comparisons are not mistaken for pure context A/Bs.
- Auto-staging and committing all workdir changes is powerful; the walking skeleton partially de-risks this with clean-workdir checks, result-branch commits, switch-back behavior, and real git gateway coverage, while rollback behavior for mid-commit failures still needs hardening.
- PR reference resolution and remote branch validation can become ambiguous in repos with multiple remotes or fork-style setups; errors must name the ambiguity clearly.
- Live GitHub publish validation depends on `gh` authentication, network availability, and a suitable test PR, so closure evidence must record exactly what was exercised.
- Markdown rendering and fence replacement can accidentally clobber user prose if marker matching is too broad; idempotency tests should cover existing prose and repeated publishes.
- The bundle schema may become a de facto public interface immediately, so v1 should avoid underspecified optional fields and keep future additions additive.
- Layering all store/schema/list/publish hardening before the first comparison could overfit abstractions and delay user workflow feedback; roadmap sequencing should keep infrastructure no thicker than the next vertical slice requires.
- The deliberate absence of a default runtime budget keeps the tool honest but can surprise users with long or costly agent runs; help text and docs should make that behavior explicit.

## Open Questions

- After the Objective exists and/or after v1 ships, should issue #434 be updated or closed with a pointer to the checked-in Objective, or should GitHub issue state remain independent bookkeeping?
