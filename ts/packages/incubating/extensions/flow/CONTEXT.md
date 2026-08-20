# @nseng-ai/flow

This context captures Flow language for lifecycle commands, the curated `@nseng-ai/flow/api` extension package API consumed by downstream publication and host-adapter composition, and the current boundary between Flow-owned presentation/orchestration and the `@nseng-ai/flow/land` domain core subpackage.

## Language

**Flow**:
The ns extension that owns public lifecycle workflows such as changes, copy, autoslot, autobranch, submit, pull-trunk, generate-pr-inventory, push, and land.
*Avoid*: Herdr dispatch helper, Pi workflow package, Graphite wrapper

**Flow Command Face**:
The user- and agent-facing `ns flow ...` command surface and its Pi mirrors, including CLI parsing, completions, renderer registration, prompts, progress, and human output for Flow workflows.
*Avoid*: land domain core, Herdr extension adapter, standalone land command surface

**Flow Pi Presentation Boundary**:
The separate `@nseng-ai/pi-ns-flow` host adapter owns Pi registration, interaction, notifications, parity metadata, and direct discovery for the `/ns:flow:*` mirrors. Graphite-dependent mirrors use the `/ns:flow:gt:*` subgroup. It also exports `/gt:squash-stack` presentation for deliberate project-local composition. Repository-specific `/code-workflows`, `/gh-ci-debug`, and `/code:gt-restack-resolve` presentation belongs to `@internal/pi-tools/code-workflows`; `.pi/extensions/code.ts` is the sole cross-owner composition seam for Internal smart restack plus the Flow stack-squash adapter.
*Avoid*: `@nseng-ai/flow/pi`, provider-obscuring Graphite workflow name, Flow-owned Pi registration, Flow-owned code-workflow skill policy, Internal Pi-tool import from Flow, cross-owner aggregate inside a package

**Flow extension package API**:
The curated `@nseng-ai/flow/api` in-process surface consumed by downstream packages so they do not import Flow private source modules. It exposes cohesive host-independent command metadata, submit-check recovery, and stack-squash operations for `@nseng-ai/pi-ns-flow`, plus **Flow Branch Publication** for trusted Objectives publication after Objective Runner checkpoint judgment.
*Avoid*: package-root import, private `@nseng-ai/flow/src/...` import, Pi registration or parity type, narrowed land-only API, consumer-owned Flow seam, exposing private submit machinery as a compatibility contract

**Flow Land Command Boundary**:
The Flow command edge maps the framework-parsed `ns flow land` request directly to typed landing policy, runs the semantic Land workflow, maps no-mutation refusals to negative outcomes and operational or partial-mutation failures to failures, validates stable structured success data, and renders settled human output. The former raw-argument CLI adapter is removed after the live-consumer audit; downstream consumers continue to use the curated **Flow extension package API** only for deliberately exported in-process behavior.
*Avoid*: raw-argument reparsing, integer-derived status, captured settled text as machine data, compatibility adapter, direct downstream import from Flow land-stack internals

**Flow Land Execution**:
The Flow-owned semantic adapter around canonical land execution: interaction/prompt rendering, confirmation policy, typed request mapping, progress/telemetry channels, and routing among no-target, single-branch fast path, and stack execution. It returns honest single-branch facts or the canonical `LandingExecutionResult`; settled presentation is owned only by the **Flow Land Command Boundary**. Merge execution, Graphite maintenance, and post-landing managed-slot cleanup are owned by **Canonical Landing Execution** in the land domain core.
*Avoid*: direct `executeStackLandingPlan` call, second landing report, settled rendering below the command edge, fake stack report for a single-branch landing, standalone land CLI behavior

**Canonical Landing Execution**:
The `executeLanding` entry point on the **Land subpackage API** that owns the full `LandingRequest` lifecycle — discovery, preflight planning, confirmation, pre-merge preparation, merge, per-merge maintenance, optional **Upstack Continuation**, and post-landing managed-slot cleanup under the closed cleanup policy (`preserve` / `free`) — and returns a `LandingExecutionResult` whose completed and failed variants carry the same observed-fact `LandingExecutionReport`. For an execute-mode managed-slot landing whose flag-derived policy is `preserve` and which is not continuing upstack, a confirmation-capable interactive host asks whether to land and perform cleanup: Yes approves landing with `free`, default No approves landing with `preserve`, and host cancellation declines before merge. Canonical execution owns cleanup policy and post-success ordering; **Flow Land Execution** owns prompt rendering and host-result mapping. Explicit flags and non-interactive hosts retain their existing behavior.
*Avoid*: phase synthesis from plan shape, gateway-level `LandResult` widening, second execution report model, Flow-owned cleanup ordering

**Upstack Continuation**:
The explicit `land --up` continuation policy that snapshots the invoking branch's immediate Graphite children before mutation, always preserves the invoking managed slot, and after successful merge attempts to check out the sole child in the same worktree. No child, multiple children, or lookup failure stops before merge; checkout, verification, or original-branch cleanup failure returns a failed command outcome that preserves recoverable state and reports already-landed PRs. The default `preserve` cleanup policy keeps the landed local branch, while `--free` deletes it after successful continuation without overriding slot preservation. Dry runs report availability without checkout or cleanup.
*Avoid*: descendant merge, inferred first child, cross-worktree navigation, cleanup despite `--up`, hiding partial landing behind a successful command outcome

**Land Domain Core**:
The deterministic land logic in the `@nseng-ai/flow/land` subpackage that consumes injected Git, Graphite, GitHub PR, and worktree-slot gateways to produce land-domain results.
*Avoid*: CLI parser, renderer, Pi command, direct subprocess script

**Land subpackage API**:
The curated `@nseng-ai/flow/land/api` surface: `executeLanding`, planning entry points, result/failure vocabulary, confirmation/progress host seams, and domain types. Deliberately narrowed after the execution migration — execution internals (`executeStackLandingPlan`, single-branch landing internals, pre-merge phase helpers) are not public; a runtime allowlist test guards the surface, package-local tests import implementation modules directly, and the sweep found no workspace production consumers of the removed exports.
*Avoid*: package-root import, Flow compatibility API, command export, execution-internal re-export

**Land Testing Surface**:
The `@nseng-ai/flow/land/testing` surface that provides in-memory fakes and fixture builders for land-domain tests.
*Avoid*: production gateway backend, CLI scenario harness, Flow test helper

**Branch Workflow Target**:
An explicit Flow target for one ordinary Git branch and its GitHub pull request, selected without constructing or consulting a **Stack Provider**.
*Avoid*: one-element stack, implicit current stack, Graphite fallback

**Stack Workflow Target**:
An explicit Flow target for an ordered set of related branches, carrying the selected **Stack Provider** identity rather than relying on metadata autodetection.
*Avoid*: ambient stack, autodetected mutation, provider topology handle

**Stack Provider**:
An explicitly selected source of one or more independently injectable stacking capabilities—topology, preparation, reconciliation, or publication. It is not a monolithic gateway, and no selected provider means no stack behavior.
*Avoid*: universal Graphite gateway, ambient provider, monolithic stack provider

**Stack Topology**:
The provider-neutral description of an ordered branch stack: trunk, parent edges, optional current branch, and typed missing, untracked, cycle, or fork diagnostics.
*Avoid*: Graphite topology, provider metadata, checked-out-branch requirement

**Stack Landing Target**:
The stack arm of Flow landing: an explicit **Stack Workflow Target** whose preflight can be planned without rendering or mutating merges. The current implementation remains Graphite-backed during migration.
*Avoid*: single-branch PR land execution, one-element stack, ambient current stack

**Stack Landing Plan**:
The renderer-independent plan produced for a **Stack Landing Target**, including branch plans, PR submit requirements, managed-slot conflicts, and descendant maintenance needs.
*Avoid*: command transcript, prompt text, merge execution result

**Land Preflight**:
The validation phase that gathers repository, stack, PR, worktree, and submit-readiness facts before any land mutation.
*Avoid*: merge phase, post-landing cleanup, human confirmation prompt

**Land Dry Run**:
The non-mutating land-domain outcome that completes preflight and reports the plan without executing merges.
*Avoid*: Flow renderer dry run, stack merge, submit update

**Land Gateway Set**:
The injected Git, Graphite, GitHub PR, and worktree-slot fact seams that keep **Land Domain Core** independent of real subprocesses and presentation.
*Avoid*: raw `git`/`gt`/`gh` calls, `ctx` bag, CLI dependencies

**Flow Stack Preflight Adapter**:
The internal Flow adapter that maps Flow's land-stack gateways and current stack facts into `@nseng-ai/flow/land` stack preflight planning, then maps the result back to Flow's existing land-stack shapes.
*Avoid*: public API, downstream extension integration point, presentation layer

**Flow Submit Boundary**:
The Flow ownership boundary for branch or stack submission, checkpoint composition, PR inventory generation, publication policy, and related lifecycle policy. Its command edge returns one semantic result in execution order — checkpoint facts followed by reconciled publication and inventory facts — while typed failures retain authoritative PR and metadata effects known after publication. A successful reconciliation always contains at least one authoritative PR; an empty reconciliation is an invariant failure, not a supported result state. Settled rendering belongs to the command edge; reusable provider facts and command mechanics remain below Flow in capability-specific adapters.
*Avoid*: process-shaped submit result, captured settled stdout/stderr as machine data, stack-provider implementation, downstream extension submit owner, land-domain behavior

**Submit Plan**:
The typed, renderer-independent result of inspecting the Graphite submit scope after readiness and any required restack, containing stack branches, existing PR links, and the partition of branches eligible or ineligible for metadata prewrite.
*Avoid*: stale pre-checkpoint topology, command transcript, metadata generation result, submit execution result

**Initial PR Title Prefix**:
An optional invocation-wide Flow Submit Boundary policy that deterministically prepends one validated prefix to generated titles only for PRs newly created by that submit invocation. Flow preserves the prefix, truncates only the generated candidate to the shared title limit, and keeps pre-existing PR titles unprefixed even when complete metadata regeneration widens the edit batch.
*Avoid*: Objective-specific meaning in Flow, machine-readable title protocol, existing-PR annotation, full-title override, generated-candidate prefixing

**Flow Branch Publication**:
The narrow **Flow extension package API** behavior used by trusted Objectives publication to bind the current non-trunk branch to its existing PR, reverify the bound source before mutation, push the exact commit without force, and preserve non-managed PR prose while updating the managed Objective Runner region. Objectives owns publication eligibility, checkpoint judgment, and Objective Runner summary policy.
*Avoid*: implementation-child external write, generic submit client, Objective Runner policy owned by Flow, force push, whole-body PR replacement

**Flow Autobranch Boundary**:
The Flow ownership boundary for public `ns flow autobranch` behavior.
*Avoid*: Herdr extension public command owner, plain branch helper, Graphite primitive
