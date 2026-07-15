# @nseng-ai/flow

This context captures Flow language for lifecycle commands, the `@nseng-ai/flow/api` compatibility seam consumed by the cmux capability, and the current boundary between Flow-owned presentation/orchestration and the `@nseng-ai/flow/land` domain core subpackage.

## Language

**Flow**:
The ns Capability that owns public lifecycle workflows such as changes, copy, autoslot, autobranch, submit, pull-trunk, regenerate-pr, push, and land.
*Avoid*: cmux capability source-control helper, Pi workflow package, Graphite wrapper

**Flow Command Face**:
The user- and agent-facing `ns flow ...` command surface and its Pi mirrors, including CLI parsing, completions, renderer registration, prompts, progress, and human output for Flow workflows.
*Avoid*: land domain core, cmux capability adapter, standalone land command surface

**Flow Pi Presentation Boundary**:
The `@nseng-ai/flow/pi` host surface owns generic `/ns:flow:*` mirrors and `/gt:squash-stack`. Repository-specific `/code-workflows`, `/gh-ci-debug`, and `/code:gt-restack-resolve` presentation belongs to `@internal/pi-tools/code-workflows`; `.pi/extensions/code.ts` is the discovery-layer composition seam for internal smart restack plus Flow stack squash.
*Avoid*: Flow-owned code-workflow skill policy, Internal Pi-tool import from Flow, cross-owner aggregate inside a package

**Flow Capability API**:
The curated `@nseng-ai/flow/api` in-process compatibility surface consumed by downstream packages, especially the cmux capability, so they do not import Flow private source modules.
*Avoid*: package-root import, private `@nseng-ai/flow/src/...` import, narrowed land-only API, cmux capability-owned seam

**Flow Land Compatibility Boundary**:
The compatibility rule that land consumers continue to enter through **Flow Capability API** while Flow keeps renderer-independent planning in the `@nseng-ai/flow/land` subpackage.
*Avoid*: direct cmux capability import from `@nseng-ai/flow/land`, direct cmux capability import from Flow land-stack internals, removing existing `@nseng-ai/flow/api` exports during migration

**Flow Land Execution**:
The Flow-owned adapter layer around canonical land execution: command presentation, prompt rendering, the confirmation gateway, ParsedArgs-to-request mapping, and routing (no-op, isolated fast path, stack). Merge execution, Graphite maintenance, and post-landing managed-slot cleanup are owned by **Canonical Landing Execution** in the land domain core.
*Avoid*: direct `executeStackLandingPlan` call, Flow-side post-landing cleanup for stack landings, pure preflight plan, standalone land CLI behavior

**Canonical Landing Execution**:
The `executeLanding` entry point on **Land Capability API** that owns the full `LandingRequest` lifecycle — discovery, preflight planning, confirmation, pre-merge preparation, merge, per-merge maintenance, and post-landing managed-slot cleanup under the closed cleanup policy (`preserve` / `free-slot` / `force-cleanup`) — and returns a `LandingExecutionResult` whose completed and failed variants carry the same observed-fact `LandingExecutionReport`.
*Avoid*: phase synthesis from plan shape, gateway-level `LandResult` widening, second execution report model, Flow-owned cleanup ordering

**Land Domain Core**:
The deterministic land logic in the `@nseng-ai/flow/land` subpackage that consumes injected Git, Graphite, GitHub PR, and worktree-slot gateways to produce land-domain results.
*Avoid*: CLI parser, renderer, Pi command, direct subprocess script

**Land Capability API**:
The curated `@nseng-ai/flow/land/api` surface: `executeLanding`, planning entry points, result/failure vocabulary, confirmation/progress host seams, and domain types. Deliberately narrowed after the execution migration — execution internals (`executeStackLandingPlan`, isolated landing internals, pre-merge phase helpers) are not public; a runtime allowlist test guards the surface, package-local tests import implementation modules directly, and the sweep found no workspace production consumers of the removed exports.
*Avoid*: package-root import, Flow compatibility API, command export, execution-internal re-export

**Land Testing Surface**:
The `@nseng-ai/flow/land/testing` surface that provides in-memory fakes and fixture builders for land-domain tests.
*Avoid*: production gateway backend, CLI scenario harness, Flow test helper

**Stack Landing Target**:
The supported land-domain target shape: a Graphite stack path whose preflight can be planned without rendering or mutating merges.
*Avoid*: isolated PR land execution, arbitrary branch merge, fully general land target

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
*Avoid*: public API, cmux capability integration point, presentation layer

**Flow Submit Boundary**:
The Flow ownership boundary for submit, PR description regeneration, Graphite submit orchestration, and related lifecycle policy; reusable Graphite facts and command mechanics remain below Flow in Graphite/gateway packages.
*Avoid*: neutral Graphite domain, cmux capability submit owner, land-domain behavior

**Submit Plan**:
The typed, renderer-independent result of inspecting the Graphite submit scope after readiness and any required restack, containing stack branches, existing PR links, upstack status, and the partition of branches eligible or ineligible for metadata prewrite.
*Avoid*: stale pre-checkpoint topology, command transcript, metadata generation result, submit execution result

**Flow Minimal Submit Client**:
The narrow two-phase **Flow Capability API** client for read-only planning and clean-tree cheap execution of current/downstack Graphite publication. It reports structured stages and conservative local/remote mutation evidence while keeping submit gateways, runtime wiring, progress matrices, metadata, and prose generation private.
*Avoid*: full submit runtime API, Graphite display-prose parser, ship pipeline, metadata-free alias for default submit

**Minimal Submit Plan**:
The read-only tracked-source result produced by the **Flow Minimal Submit Client**, containing the verified source, Graphite trunk, and affected current plus non-trunk downstack branches. Definitive untracked state is distinct from provider or topology failure.
*Avoid*: authorization, mutation result, arbitrary Git ancestry, upstack PR-update scope

**Flow Autobranch Boundary**:
The Flow ownership boundary for public `ns flow autobranch` behavior and the compatibility path consumed by the cmux capability through **Flow Capability API**.
*Avoid*: cmux capability public command owner, plain branch helper, Graphite primitive

**Flow API Narrowing Candidate**:
An export on **Flow Capability API** that may become redundant after extraction, but must remain until consumers are deliberately migrated with a compatibility plan.
*Avoid*: immediate removal, accidental behavior change, package-root replacement
