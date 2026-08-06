# Two-PR Stack: Repair Flow Pi Exec Adaptation and Track Centralized Layered Configuration

## Goal and outcome

Build two child PRs above the current `summarize-shared-cli-results-with-cheap-model` PR (#4143):

1. **Surgical bug fix:** repair the Flow Pi host adapter so Git consumers receive Foundation's authoritative `CommandExecApi` result shape, allowing successful repository-root lookup and model-backed CLI result summaries instead of raw fallback output.
2. **Orienting Objective:** create `.ns/objectives/centralize-layered-project-config/` to direct a later system-wide consolidation of ns configuration access behind a deep `ProjectConfigGateway`, with new local/user layers gated on an explicit ADR and separate implementation work.

The broader ProjectConfigGateway refactor is deliberately **not implemented** in this two-PR stack. PR 1 restores the behavior introduced by #4143; PR 2 records and orients the future migration.

## Context and discovered facts

### Current stack and failure

- Source branch: `summarize-shared-cli-results-with-cheap-model`.
- Current PR: #4143, “Add model-backed summaries for Pi CLI command results.”
- Current parent: `pi-cli-heartbeat-status-line` / PR #4138.
- The observed `/ns:flow:submit` output was the raw fallback. Trace evidence at `$XDG_STATE_HOME/ns/pi-cli-command-extension/ns-pi-cli-command-extension.jsonl` recorded:
  - `resultType: "fallback"`
  - `reason: "model-selection-failed"`
  - `git rev-parse --show-toplevel failed (undefined)` despite a valid repository path in stdout.
- Exact stdout/stderr logs were successfully persisted, so log storage was not the failure.

### Actual immediate cause

`ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/extension.ts` currently constructs both Git consumers directly over raw `pi`:

- `new RealGitGateway(pi)` for submit-check recovery.
- `new RealGitGateway(pi)` for `createRealCliCommandResultSummaryContext`.

That is a contract mismatch:

- Pi's host exec result is the raw `{ stdout, stderr, code, killed }` shape.
- Foundation `RealGitGateway` consumes `CommandExecApi`, whose authoritative result is the discriminated `ExecResult` shape such as `{ type: "exited", stdout, stderr, code, signal }`.
- `commandSucceeded()` switches on `result.type`. Passing a raw Pi result leaves `type` undefined, so successful Git output is classified as failure and formatted with an undefined exit code.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/shared/command-exec.ts` already owns the correct adapter: `createPiCommandExecApi(pi)`.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/src/extension.ts:585-599` is the working precedent: create one adapted `commands`, then construct `RealGitGateway(commands)`.

Do **not** implement speculative “missing exit code means zero” behavior. Repository evidence did not establish an omitted upstream code; the confirmed defect is the missing raw-Pi-to-Foundation adapter.

### Existing project-config architecture and future direction

- `ProjectConfigGateway`, `nodeProjectConfigGateway`, `loadProjectConfig()`, `parseProjectConfigToml()`, typed `SettingsSchema`, and point-catalog logic currently live together in `ts/packages/public/sdk/src/project-config/points.ts`.
- The existing gateway is a low-level filesystem probe requiring callers to supply `repoRoot` and file-relative paths. It does not discover project scope or compose layered configuration.
- `loadModelPolicy({ repoRoot, gateway })` in `ts/packages/public/extension-kit/src/kit/model-policy.ts` uses the shared parser/gateway path, but callers independently discover roots and bind the Node adapter.
- Production access is inconsistent: some callers use `ProjectConfigGateway`, some read `ns.toml` directly, some discover roots through Git, and some assume `cwd` is the root.
- Accepted ADR 0056 currently keeps user-level models, extension settings, hooks, and prompt installations dormant. User settings or installations cannot be activated merely as part of a refactor; a superseding/refining ADR is required.
- ADR 0019 and `docs/conventions/consumer-gateways-and-command-shape.md` require real adapters to be bound at composition roots and preserve the intended command/telemetry channel.
- No active or closed Objective currently uses the confirmed slug `centralize-layered-project-config`.

## PR topology and branch mechanics

Create exactly two Graphite child branches above the current #4143 branch:

```text
summarize-shared-cli-results-with-cheap-model (#4143)
└── fix-flow-pi-exec-adaptation                 (PR 1)
    └── centralize-layered-project-config-objective (PR 2)
```

Suggested mechanics:

1. From the current source branch, implement and stage PR 1, then create the first child with `gt create fix-flow-pi-exec-adaptation -m "Fix Flow Pi exec adaptation"` (or use the repository's equivalent normal `gt` flow if the implementation session creates the branch before editing).
2. From PR 1's branch, create PR 2 with `gt create centralize-layered-project-config-objective -m "Track centralized layered project config"` after staging the Objective files.
3. Inspect topology with `gt branch info --no-interactive`, `gt parent --no-interactive`, and `gt children --no-interactive`; do not parse `gt ls`.
4. Submit only after both PRs are complete and validated, using `gt submit --no-interactive` if publication is part of the implementation request.

Keep PR 2 dependent on PR 1 even though its Markdown is mechanically independent: the stack tells the review story in the user-requested order—restore the immediate behavior, then record the architectural follow-up.

## PR 1 — Surgical Flow exec-adaptation fix

### Files and symbols

Primary files:

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/extension.ts`
  - `FlowExtensionAPI`
  - `registerFlowExtension()`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/test/extension.test.ts`
  - `FakePi`
  - `registerNsExtension()`
  - new result-summary regression scenario

Reference implementations/contracts:

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/shared/command-exec.ts`
  - `RawPiExecApi`
  - `RawPiExecResult`
  - `createPiCommandExecApi()`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/src/extension.ts:585-599`
- `ts/packages/public/infra/foundation/src/primitives/command.ts`
  - `ExecResult`
  - `commandSucceeded()`
- `ts/packages/public/infra/foundation/src/git/index.ts`
  - `RealGitGateway.repoRoot()` / `optionalRepoRoot()`

### TDD seam

Use the public Flow Pi host-adapter behavior in `pi-ns-flow/test/extension.test.ts`, not a private helper or a shallow `RealGitGateway` test.

The regression must exercise the production default `resultSummary` composition rather than injecting a fake `resultSummary`, because the defect is specifically in default host wiring. It should:

1. Supply a Pi-shaped fake exec capability that returns raw Pi results, not Foundation `ExecResult` objects.
2. Script `git rev-parse --show-toplevel` to return successful stdout containing `/repo` and code 0.
3. Provide project config/model policy evidence needed by the real summary context (for example an in-memory or temporary `ns.toml` at the resolved root, following the package's existing test patterns).
4. Provide a command context with a model registry capable of completing the summary call through a deterministic injected/fake boundary if the current real context does not expose a suitable model-call seam.
5. Execute a Flow slash command through the registered command, with captured stdout/stderr from the fake CLI runner.
6. Assert the displayed output has the summarized shape:

```markdown
## Summary
- ...

## Raw logs
- stdout: ...
- stderr: ...
```

and does not contain the raw fallback `stdout:` / `stderr:` presentation as the primary body.
7. Assert the Git invocation used the command context cwd and completed through the adapted result contract.

If driving the real LM adapter would require ambient module mocking or a real model call, keep the regression at the highest stable seam available without violating shared-test rules: inject only the model generation dependency while retaining the real Flow default Git-to-model-policy selection path. The test must still fail before the composition fix because raw Pi output reaches `RealGitGateway`.

### Red → green sequence

1. First update the Flow test fake so its `exec` method implements the actual raw Pi host contract. Add the regression described above.
2. Run the focused Flow package test and verify the regression fails with model-selection fallback / repository-root failure.
3. In `extension.ts`, import `createPiCommandExecApi` and the appropriate raw Pi exec type from `@nseng-ai/pi-runtime/shared/command-exec`.
4. Make `FlowExtensionAPI` express the raw Pi host capability rather than pretending to be Foundation `CommandExecApi`.
5. At the `registerFlowExtension()` composition root, create one adapted command channel:

```ts
const commands = createPiCommandExecApi(pi);
```

6. Construct both default Git consumers with `new RealGitGateway(commands)`:
   - submit-check recovery Git;
   - CLI result-summary model-policy Git.
7. Preserve injected `options.recoveryGit` and `options.resultSummary` behavior exactly; defaults alone use the newly adapted channel.
8. Re-run the focused test and verify it turns green.
9. Run the existing command-exec and Objectives/Flow adapter tests as targeted regression coverage; the Objectives implementation is the reference behavior, not a file to change.

### Scope constraints

- Do not redesign `ProjectConfigGateway` in PR 1.
- Do not remove the summary context's Git root discovery in PR 1.
- Do not alter Foundation `ExecResult`, `commandSucceeded()`, or `RealGitGateway` semantics.
- Do not add missing-code normalization.
- Do not sweep unrelated `new RealGitGateway(pi)` call sites; record them as evidence for the Objective where configuration access is involved, or leave unrelated gateway-channel cleanup to separately scoped work.
- Do not change summary fallback policy, log persistence, Markdown grammar, model profile selection, or Flow command behavior.

### Likely review focus

- The Flow host interface must no longer lie about returning Foundation `ExecResult`.
- One adapted command channel should be reused for both Flow Git consumers so cwd/timeout/termination semantics agree.
- The regression should prove the user-visible summary outcome and be red-capable on the original bug, not merely assert that `createPiCommandExecApi` was called.

## PR 2 — Orienting Objective for centralized layered project configuration

### Files

Create only:

- `.ns/objectives/centralize-layered-project-config/objective.md`
- `.ns/objectives/centralize-layered-project-config/roadmap.md`
- `.ns/objectives/centralize-layered-project-config/orientation.md`
- `.ns/objectives/centralize-layered-project-config/updates/` as an empty directory in the working tree (Git will not track an empty directory; do not create an initial update merely to retain it).

Do not create `closed.md`. Do not add Record Frontmatter unless implementation discovers a real active Objective relationship that warrants a mirrored edge. Current evidence does not require an edge; historical ADRs and closed Objectives can be cited in prose without graph edges.

### `objective.md` required content

Title: **Centralize Layered Project Configuration**

Use all required Objective headings.

#### Thesis

State that ns configuration access becomes one deep, typed project-configuration module. Callers provide invocation scope such as `cwd`, environment, and active harness and consume effective typed values; they do not discover roots, construct `ns.toml` paths, read TOML, bind Node filesystem adapters, or implement precedence. Consolidation lands behavior-preservingly before any new config layer is activated.

#### Scope

Include:

- Define the external effective-config interface and demote/rename the current low-level filesystem `ProjectConfigGateway` role as an internal adapter dependency if needed.
- Make project/config-root discovery part of the module rather than each consumer.
- Preserve typed `SettingsSchema`, shared parsing, points, and source-aware diagnostics where they remain useful.
- Produce one invocation-scoped configuration snapshot/capability for ns CLI and Pi composition roots instead of repeated reads and root probes.
- Migrate command-source discovery, point/descriptor discovery, model policy, Reviews, Slots, harness configuration, and other production direct readers to the shared seam.
- Separate effective reads from explicit source mutation; preserve byte-preserving edits, optimistic stale-state checks, path containment, and user/project scope authority.
- Add provenance so diagnostics and inspection can identify the winning source.
- Add mechanical enforcement against direct production `ns.toml` access outside the config implementation/mutation adapters.
- After consolidation, write an ADR that settles `ns.local.toml` and approved user-settings semantics before enabling them.
- Implement only the layer families approved by that ADR.

#### Non-goals

Include:

- No behavior-changing local/user layer during the initial consolidation.
- No generic TOML deep merge; setting families own merge/replacement semantics.
- No user hooks or prompt installations without an explicit security/path decision.
- No compatibility aliases or dual canonical config access paths.
- No requirement that every arbitrary project file use this module; scope is ns configuration.
- No broad Git gateway cleanup unrelated to configuration scope.

#### Completion criteria

Require evidence that:

- Production workflows no longer directly construct/read `ns.toml` or independently discover a root solely for config.
- Nested-directory invocation resolves the same effective project config as root invocation.
- Command source inventory, point definitions/installations, and typed settings consume one coherent invocation scope.
- Effective reads and source-specific mutation are distinct interfaces.
- Existing project-only behavior remains compatible through the consolidation phase.
- Source-labelled diagnostics/provenance exist.
- An architecture guard rejects new direct accesses outside an explicit allowlist.
- A new ADR refines/supersedes ADR 0056 before `ns.local.toml` or user settings become active.
- Approved layering behavior and docs/tests land after that ADR.

#### Assumptions and risks

Capture at least:

Assumptions:

- `parseProjectConfigToml` and `SettingsSchema` are reusable foundations rather than throwaway code.
- CLI preparation and per-command Pi contexts provide sufficient scope to establish configuration once per invocation.
- Existing setting families can define explicit merge/replacement policies without a universal deep merge.

Risks:

- Extension declarations influence which schemas/point definitions exist, creating ordering or cycle pressure.
- User settings can silently broaden behavior or execute repository-affecting content unless source permissions are explicit.
- Relative paths need source-specific bases; flattening layers can resolve paths incorrectly.
- Consolidating reads and adding layers in one step would obscure regressions.
- Broad migration can recreate shallow pass-through wrappers or duplicate canonical doors.

#### Open questions

Retain as Objective decisions rather than pre-answering them:

- Final external interface name and whether the current filesystem contract is renamed or hidden internally.
- Exact project-root discovery policy outside Git repositories.
- Cache/snapshot lifetime and invalidation within long-lived Pi sessions.
- Per-family layer permissions and merge rules.
- Whether user model settings are harness-gated or globally effective for ns invocations.
- `ns.local.toml` source-control, secret, path, mutation, and inspection semantics.
- How extension-provided settings schemas become available without circular discovery.
- Failure policy for malformed lower-precedence sources when a higher layer supplies a value.

Keep the Objective planning-only: do not add Runner Policy or execution-policy sections.

### `roadmap.md` required content

Use `# Roadmap`, `## Work`, and `## Parked`, with semantic rows only.

Recommended ordered work:

1. **Inventory and contract decision** — complete the production-reader/mutator inventory; define effective-read versus source-mutation interfaces and invocation scope.
2. **Behavior-preserving deep gateway** — implement single-project-`ns.toml` behavior behind the new external interface, including nested-cwd root discovery and source-labelled diagnostics.
3. **Composition-root adoption** — have ns CLI preparation and Pi-hosted workflows receive/reuse the project config capability/snapshot instead of constructing adapters inside workflows.
4. **Catalog convergence** — make command-source inventory, extension descriptors, point definitions, and installations use the coherent config scope.
5. **Typed-setting migration** — migrate model policy, Reviews, Slots, harness settings, and remaining consumers; remove direct reads and config-only Git root probes.
6. **Mutation separation** — centralize source-targeted edits while preserving byte fidelity, stale-state checks, scope authority, and safe writes.
7. **Enforcement and documentation** — add a style/architecture guard, stale-access grep, SDK/context vocabulary updates, and user-facing inspection/provenance docs.
8. **Layering ADR** — decide precedence, allowed sources, active-harness effects, paths/security, diagnostics, provenance, and per-setting merge ownership; explicitly refine ADR 0056.
9. **Local layer** — implement `ns.local.toml` only under the accepted ADR, with inspection and mutation behavior.
10. **Approved user settings** — activate only ADR-approved setting families; keep hooks/prompts dormant unless explicitly authorized.

Put in `## Parked`:

- User hook and prompt installation layers unless separately approved.
- Remote/organization-managed policy layers.
- Arbitrary config-file support outside ns configuration.
- Performance caching beyond evidence-backed need.

Validation belongs as evidence under semantic rows, not as a standalone roadmap row.

### `orientation.md` required content

Keep it concise and agent-facing, approximately eight content lines, using the established shape:

- **Direction:** all ns configuration access is converging behind one deep typed project-config seam.
- **Getting to:** consolidate current project-only behavior first; later layers require the Objective's ADR and provenance/merge rules.
- **What you see now:** low-level `ProjectConfigGateway` reads, direct filesystem access, Git root probes, and cwd-as-root assumptions coexist.
- **Avoid:** new direct `ns.toml`/future `ns.local.toml` reads, workflow-owned precedence, config-only root probes, global Node adapter construction inside workflows, generic TOML deep merge, or activating user settings ahead of the ADR.
- **Active slice:** inventory and define the effective-read/source-mutation interfaces, then migrate behavior-preservingly in roadmap order.

The orientation must not claim the future gateway already exists.

### Objective verification

Run:

```sh
ns objective check centralize-layered-project-config
ns objective exec load-orientations --format md
```

Verify:

- the Objective is open and planning-only;
- all required headings exist;
- `orientation.md` is included in the active orientation inventory;
- no initial Semantic Update or `closed.md` exists;
- no unrelated Objective frontmatter changed;
- the wording does not update `CONTEXT.md` ahead of implementation.

## Execution strategy for repeated edits

This two-PR stack itself has only a few semantic edit sites, so use **precise manual edits after reading the complete affected sections**. Do not use an opaque `text.replace()` script and do not invoke `refactor-swarm` for PR 1 or PR 2.

The Objective describes a later migration across more than five production consumers. Record this execution strategy in its roadmap or implementation notes:

- use deterministic TypeScript AST/codemod tooling only where a future migration is purely syntactic and a suitable repository tool exists;
- use `refactor-swarm` for the future 5+ mixed semantic call-site migration;
- migrate by consumer family with behavior-preserving tests, not one unreviewable repository-wide replacement;
- finish that future migration with bounded greps for direct `ns.toml`, `nodeProjectConfigGateway`, config-only `repoRoot` probes, and stale old-interface imports.

For this two-PR implementation, run a bounded final grep to ensure PR 1 leaves no raw `new RealGitGateway(pi)` in `pi-ns-flow/src/extension.ts` and PR 2 spells `centralize-layered-project-config` consistently.

## Validation guidance

### PR 1 focused validation

Run the narrow red/green loop first, then relevant package checks:

```sh
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run --config vitest.config.ts packages/incubating/hosts/pi/extensions/pi-ns-flow/test/extension.test.ts
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run --config vitest.config.ts packages/incubating/hosts/pi/runtime/pi-runtime/test/command-exec.test.ts
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run --config vitest.config.ts packages/incubating/hosts/pi/extensions/pi-ns-objectives/test
```

Then run repository-required TypeScript validation appropriate to the touched architecture, including format, lint, native TypeScript check, package/default tests, sanity, and the TypeScript style guard. Use repository autofix commands for formatter/linter failures. Before submission, run the default `just` entrypoint.

### PR 2 focused validation

```sh
ns objective check centralize-layered-project-config
ns objective exec load-orientations --format md
just dprint-check
```

Run the default `just` validation before stack submission because the Objective orientation becomes a repo-wide instruction surface.

### Manual behavioral verification

After PR 1, in a Pi session that includes the branch, run a Flow command that produces enough output to summarize (the original `/ns:flow:submit` path is the strongest confirmation when safe). Confirm:

- status reaches the summarizing phase;
- output starts with `## Summary`;
- exact stdout/stderr paths appear under `## Raw logs`;
- the trace records `resultType: "summarized"`, not model-selection fallback.

Do not repeat publication or destructive Flow operations solely for testing; use the safest representative command that traverses the same default summary context, or rely on the deterministic regression if no safe manual command exists.

## Review and remediation

Review each PR independently against its purpose:

### PR 1 review

- **Spec:** Does model-backed Flow output now appear when Git root resolution succeeds?
- **Standards:** Is raw Pi execution adapted once at the composition root? Are Consumer Gateway channels preserved? Is the regression at the public Flow adapter seam?
- **Scope:** Reject ProjectConfigGateway redesign, broad Git sweeps, fallback policy changes, and speculative code normalization.

### PR 2 review

- **Spec:** Does the Objective describe consolidation first and ADR-gated layering second?
- **Standards:** Does it use required Objective headings/statuses, remain planning-only, and include a concise valid orientation?
- **Policy:** Ensure it explicitly respects ADR 0056 until superseded and does not claim user settings are already permitted.
- **Completeness:** Ensure the roadmap covers reads, catalog/discovery, typed settings, mutation, enforcement, ADR, local config, and approved user config.

Address review findings on the PR where they originate. If PR 1 changes after PR 2 exists, restack the child with Graphite and re-run affected checks. Do not fold the Objective into the bug-fix PR or start its implementation in PR 2.

## Risks, assumptions, and remaining open questions

### Assumptions

- The current #4143 branch remains the desired parent for both new PRs.
- A successful raw Pi exec result includes a numeric `code`; no missing-code compatibility is required for the observed defect.
- The Flow extension test can expose a deterministic model-generation seam without shared-cache module mocking or a live network call.
- The Objective remains a standard planning-only record with orienting guidance, not an autoobjective.

### Risks

- Existing Flow tests currently type the fake host as returning Foundation `ExecResult`, which masks the production mismatch. Correcting the fake contract may reveal other raw/adapted assumptions that should be fixed only if required for this path.
- Both recovery and summarization currently construct Git over raw Pi; fixing only one would leave a latent duplicate failure.
- An Objective orientation that overstates landed behavior could mislead unrelated agents. Keep “direction” separate from “what you see now.”
- The future config refactor crosses SDK discovery, extension settings, Pi hosts, filesystem mutation, and accepted user-scope policy; its Objective must preserve phased sequencing.

### Open implementation question

If the existing `createRealCliCommandResultSummaryContext` cannot inject deterministic model generation at the Flow public test seam, prefer the smallest production-neutral seam that permits a fake model adapter while retaining real model-policy selection. Do not use `vi.mock`, real network calls, or a test that bypasses the faulty default composition. Record the exact chosen seam in the PR description.
