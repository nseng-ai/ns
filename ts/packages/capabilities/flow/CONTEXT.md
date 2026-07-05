# @nseng-ai/flow

This context captures Flow language for lifecycle commands, the `@nseng-ai/flow/api` compatibility seam consumed by CCC, and the current boundary between Flow-owned presentation/orchestration and the `@nseng-ai/flow/land` domain core subpackage.

## Language

**Flow**:
The ji Capability that owns public lifecycle workflows such as changes, copy, autoslot, autobranch, submit, pull-trunk, regenerate-pr, push, and land.
*Avoid*: CCC source-control helper, Pi workflow package, Graphite wrapper

**Flow Command Face**:
The user- and agent-facing `ns flow ...` command surface and its Pi mirrors, including CLI parsing, completions, renderer registration, prompts, progress, and human output for Flow workflows.
*Avoid*: land domain core, CCC adapter, standalone land command surface

**Flow Capability API**:
The curated `@nseng-ai/flow/api` in-process compatibility surface consumed by downstream packages, especially CCC, so they do not import Flow private source modules.
*Avoid*: package-root import, private `@nseng-ai/flow/src/...` import, narrowed land-only API, CCC-owned seam

**Flow Land Compatibility Boundary**:
The compatibility rule that land consumers continue to enter through **Flow Capability API** while Flow keeps renderer-independent planning in the `@nseng-ai/flow/land` subpackage.
*Avoid*: direct CCC import from `@nseng-ai/flow/land`, direct CCC import from Flow land-stack internals, removing existing `@nseng-ai/flow/api` exports during migration

**Flow Land Execution**:
The Flow-owned land behavior that still includes command presentation, stack-mode orchestration, prompts, merge execution, Graphite maintenance, and cleanup behavior while land execution remains broader than the land-domain core.
*Avoid*: fully migrated land capability, pure preflight plan, standalone land CLI behavior

**Land Domain Core**:
The deterministic land logic in the `@nseng-ai/flow/land` subpackage that consumes injected Git, Graphite, GitHub PR, and worktree-slot gateways to produce land-domain results.
*Avoid*: CLI parser, renderer, Pi command, direct subprocess script

**Land Capability API**:
The curated `@nseng-ai/flow/land/api` surface for Flow internals and land tests to consume domain types and planning entry points.
*Avoid*: package-root import, Flow compatibility API, command export

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
*Avoid*: public API, CCC integration point, presentation layer

**Flow Submit Boundary**:
The Flow ownership boundary for submit, PR description regeneration, Graphite submit orchestration, and related lifecycle policy; reusable Graphite facts and command mechanics remain below Flow in Graphite/gateway packages.
*Avoid*: neutral Graphite domain, CCC submit owner, land-domain behavior

**Flow Autobranch Boundary**:
The Flow ownership boundary for public `ns flow autobranch` behavior and the compatibility path consumed by CCC through **Flow Capability API**.
*Avoid*: CCC public command owner, plain branch helper, Graphite primitive

**Flow API Narrowing Candidate**:
An export on **Flow Capability API** that may become redundant after extraction, but must remain until consumers are deliberately migrated with a compatibility plan.
*Avoid*: immediate removal, accidental behavior change, package-root replacement
