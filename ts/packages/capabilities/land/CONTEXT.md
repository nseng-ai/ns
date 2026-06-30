# sdl-land

This context captures `sdl-land` language for renderer-independent land domain planning, gateway-owned facts, and the boundary that keeps command presentation and compatibility in Flow while extraction continues.

## Language

**Land Capability**:
The SDL Capability package `sdl-land`, which owns land-domain types, gateway contracts, fakes, and renderer-independent preflight/dry-run planning.
*Avoid*: Flow command package, CCC integration seam, Graphite wrapper

**Land Domain Core**:
The deterministic land logic in `sdl-land` that consumes injected Git, Graphite, GitHub PR, and worktree-slot gateways to produce land-domain results.
*Avoid*: CLI parser, renderer, Pi command, direct subprocess script

**Land Capability API**:
The curated `sdl-land/api` surface for Flow and land tests to consume domain types and planning entry points.
*Avoid*: package-root import, Flow compatibility API, command export

**Land Testing Surface**:
The `sdl-land/testing` surface that provides in-memory fakes and fixture builders for land-domain tests.
*Avoid*: production gateway backend, CLI scenario harness, Flow test helper

**Stack Landing Target**:
The currently supported `sdl-land` landing target shape: a Graphite stack path whose preflight can be planned without rendering or mutating merges.
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

**Land CLI Absence Boundary**:
The current rule that `sdl-land` does not export CLI parsing, completions, renderer registration, prompt, or presentation helpers; those remain Flow concerns while `sdl-flow/api` compatibility is preserved.
*Avoid*: `sdl-land` command face, Pi registration, CCC direct land presentation

**Land Execution Gap**:
The explicit current-state gap where mutation-heavy merge execution and post-merge orchestration remain in Flow even though preflight and dry-run planning have a `sdl-land` domain core.
*Avoid*: claiming all land behavior moved, hidden behavior change, compatibility narrowing
