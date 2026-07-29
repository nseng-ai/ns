# High-Severity Repeated Switches Audit

Audit date: 2026-07-29.

This file is fixed source material for the bounded Objective. It records six high-severity findings selected from a current production-TypeScript audit. Re-verify paths, line numbers, shared-policy interpretation, and whether each smell remains present at pickup time; this reference is evidence from the audit, not guaranteed current truth.

## Method and scope

The audit inspected production TypeScript under `ts/packages/public/**/src`, `ts/packages/incubating/**/src`, `ts/packages/internal/**/src`, and repo-owned `.pi` TypeScript. Tests and vendored skill code were excluded. Three independent read-only scouts covered public, incubating, and internal/root areas. Candidates were judged against the repository's `Repeated Switches` review rule: report systematic repetition of one shared policy, usually three or more sites or two sites duplicating the same decisions, derived facts, labels, metadata, validation, or behavior; suppress sites that merely exhaustively handle the same union for genuinely adapter-specific outputs.

The full audit confirmed 15 findings: 6 high, 8 medium, and 1 low. This Objective intentionally captures only the six high-severity findings. The remaining nine are parked and are not an implicit queue.

## Findings

### 1. Review-harness execution diagnostics are triplicated

- **Severity:** high
- **Current anchors at audit time:**
  - `ts/packages/incubating/extensions/reviews/src/gateways/review-runner.ts:228-254`
  - `ts/packages/incubating/extensions/reviews/src/gateways/codex-review-runner.ts:222-240`
  - `ts/packages/incubating/extensions/reviews/src/gateways/pi-review-runner.ts:234-259`
- **Shared policy:** prefer non-empty stderr, optionally fall back to the last stdout line, then map `ExecResult.type` to startup, cancellation, timeout, or exit diagnostics.
- **Evidence:** all three gateways repeat the `spawn-failed`, `cancelled`, `timed-out`, and `exited` decisions and the same signal/status formatting. Claude Code and Pi also repeat stdout-last-line fallback. Only the harness label and whether stdout fallback is enabled vary.
- **Drift risk:** provider gateways independently maintain one subprocess-diagnostic contract, and fallback behavior already differs.
- **Smallest fix:** add one neutral Reviews-owned helper such as `reviewHarnessExecutionMessage(result, { harnessLabel, useStdoutFallback })`; leave provider invocation and output parsing in their gateways.

### 2. Pending-worktree failure semantics are encoded four times

- **Severity:** high
- **Current anchors at audit time:**
  - `ts/packages/incubating/extensions/flow/src/autobranch/pending-worktree-format.ts:4-16`
  - `ts/packages/incubating/extensions/flow/src/checkpoint/checkpoint.ts:318-331`
  - `ts/packages/incubating/extensions/flow/src/ns/presentation/pending-worktree-result.ts:37-47`
  - `ts/packages/incubating/extensions/flow/src/ns/presentation/pending-worktree-result.ts:50-60`
- **Shared policy:** map `PendingWorktreeError.kind` (`not_git_repo`, `detached_head`, `status_failed`, `diff_failed`) to its canonical plain diagnostic, Git command, and command-aware headline.
- **Evidence:** autobranch and checkpoint produce the same four messages; house-style presentation separately re-enumerates all four kinds for the real Git command and headline.
- **Drift risk:** a new snapshot-probe kind requires coordinated changes across four dispatches spanning core/plain and CLI presentation.
- **Smallest fix:** define one Flow-owned kind projection or metadata table containing the shared plain message, command, and headline stem; each renderer retains only transcript and output-shape concerns.

### 3. Foundation `ExecResult` termination policy has three owners

- **Severity:** high
- **Current anchors at audit time:**
  - `ts/packages/public/infra/foundation/src/primitives/command.ts:138-148`
  - `ts/packages/public/infra/foundation/src/primitives/command.ts:199-213`
  - `ts/packages/public/infra/foundation/src/primitives/command.ts:295-307`
- **Shared policy:** what each `ExecResult.type` means for success, startup-specific failure handling, and canonical termination evidence.
- **Evidence:** `commandSucceeded`, `formatCommandResultFailure`, and `formatCommandTermination` all exhaust the same four variants. The distinction between startup failure and post-start termination is encoded in more than one place.
- **Drift risk:** a new result variant requires synchronized edits to success and failure formatting policy in the same foundational module.
- **Smallest fix:** introduce one private exhaustive classifier returning stable facts such as success, phase, and termination text; keep the existing public helpers as projections with unchanged signatures and output.

### 4. Context-profiler `MessagePart` semantics are re-derived repeatedly

- **Severity:** high
- **Current anchors at audit time:**
  - `ts/packages/internal/hosts/pi/tools/pi-tools/src/context-profiler/model.ts:520-533`
  - `ts/packages/internal/hosts/pi/tools/pi-tools/src/context-profiler/model.ts:593-598`
  - `ts/packages/internal/hosts/pi/tools/pi-tools/src/context-profiler/model.ts:606-620`
  - `ts/packages/internal/hosts/pi/tools/pi-tools/src/context-profiler/model.ts:630-643`
- **Shared policy:** the semantic payload each normalized message-part variant contributes to verbatim rendering, tool-name extraction, character accounting, and excerpt generation.
- **Evidence:** text/thinking repeatedly derive from `part.text`; tool calls repeatedly derive from `name` and `argsJson`; image repeatedly contributes a marker or zero length; opaque repeatedly derives from JSON.
- **Drift risk:** adding a message-part kind requires defining its interpretation independently in three full switches and one partial cascade.
- **Smallest fix:** add one exhaustive `messagePartFacts(part)` returning section text, character count, excerpt text, and tool names; current consumers project from those facts.

### 5. Branch Context creation policy is interpreted in three full switches

- **Severity:** high
- **Current anchors at audit time:**
  - `ts/packages/incubating/extensions/branch-context/src/core/branch-context-creation.ts:244-277`
  - `ts/packages/incubating/extensions/branch-context/src/core/branch-context-creation.ts:391-406`
  - `ts/packages/incubating/extensions/branch-context/src/core/branch-context-creation.ts:508-540`
- **Shared policy:** each `BranchContextCreationPolicy.type` determines plain Git versus Graphite, start-point/reference source, whether HEAD is resolved dynamically, and whether Graphite parentage is explicit or current.
- **Evidence:** preview context and execution basis enumerate all four policy types and repeat mode/start-point/parent decisions; failure-detail formatting repeats the current-HEAD versus explicit grouping and Graphite-parent distinction.
- **Drift risk:** adding or changing a creation mode requires synchronized preview, diagnostic, and execution updates.
- **Smallest fix:** normalize policy into one package-local descriptor or basis such as `{ method, startPointSource, startRef, parentSource }`; preview, diagnostics, and execution consume it, resolving dynamic values only where required.

### 6. Release-reset action semantics are distributed across four cascades

- **Severity:** high
- **Current anchors at audit time:**
  - `ts/packages/internal/dev/ns-dev/src/release/reset.ts:316-333`
  - `ts/packages/internal/dev/ns-dev/src/release/reset.ts:617-621`
  - `ts/packages/internal/dev/ns-dev/src/reset-public-package-release-cli.ts:206-210`
  - `ts/packages/internal/dev/ns-dev/src/reset-public-package-release-cli.ts:232-239`
- **Shared policy:** what each `ReleaseResetAction.type` contains, which effect executes, how failure is classified, how the action is defensively copied, and how it is presented.
- **Evidence:** restore-tracked-paths consistently carries `paths`, invokes restore, maps to `tracked-restore-failed`, deep-copies paths, and renders a restore label; remove-release-directory carries `path`, removes the directory, maps the corresponding failure, and renders removal.
- **Drift risk:** a third action would require coordinated edits across execution, failure classification, two copy implementations, and presentation.
- **Smallest fix:** give release core one canonical action copy function plus package-local execution/failure metadata or a narrow action visitor; leave CLI-only wording at the presentation boundary.

## Disposition rules

At pickup, each finding must be re-verified and eventually receive one parent-approved disposition:

- **fixed:** the shared policy has one canonical owner, equivalent repeated policy is gone, and validation passes;
- **disposed:** the finding is stale or the smallest fix would be worse than the smell, with concrete rationale;
- **routed:** another active Objective owns the work, with concrete rationale and the target Objective named.

If re-verification reveals a broader design decision than the documented smallest fix, do not choose a disposition automatically: skip implementation, leave the roadmap row open, and stop for later parent judgment.
