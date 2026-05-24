# Pi Extension Deepening Assessment

This file preserves the context behind the `pi-extension-deepening` Objective. It is intentionally adjacent to `objective.md` rather than an update file because it is creation-time evidence and candidate inventory, not a Semantic Update produced after the Objective was underway.

## How the assessment was made

The review used the architecture vocabulary from the `improve-codebase-architecture` skill:

- **Module** — anything with an Interface and an Implementation.
- **Interface** — everything a caller must know to use the Module, including invariants, ordering, errors, config, and performance.
- **Depth** — leverage at the Interface.
- **Seam** — where an Interface lives; a place behavior can be altered without editing in place.
- **Adapter** — a concrete thing satisfying an Interface at a Seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth.

The review applied the deletion test: if deleting a Module only makes the same complexity reappear across callers, the Module was shallow or missing; if deleting it would scatter real complexity, it is earning its keep.

Inputs read or inspected:

- Repo context: `CONTEXT.md`, `CONTEXT-MAP.md`, and relevant `packages/asdl-core/CONTEXT.md` sections for Clinkr, Git, Gt, and Gh vocabulary.
- Pi extension docs: installed Pi `docs/extensions.md`, plus repo-local `docs/pi/README.md`, `docs/pi/runner-subagent-helper.md`, `docs/pi/objective-stack-subagent-rewrite-brief.md`, `docs/pi/session-cwd-semantics.md`, and `docs/pi/extension-message-linkification.md`.
- Project-local Pi extensions: `.pi/extensions/*.ts`.
- Engineered TypeScript package: `ts/package.json`, `ts/tsconfig.json`, `ts/packages/pi-extensions/package.json`, `ts/packages/pi-extensions/tsconfig.json`, `ts/packages/pi-extensions/src/**/*.ts`, and `ts/packages/pi-extensions/test/**/*.ts`.
- Existing Objective record: `.asdl/objectives/pi-extension-architecture-deepening/`.
- Post-pull Objective-list implementation: `packages/asdl-objectives/src/asdl_objectives/list*.py` and related unit/scenario tests.

Commands run during assessment:

```text
objective list --status all --format md
objective exec read-objective pi-extension-architecture-deepening --format md
objective exec read-objective pi-extension-deepening --format md
objective list --format json
bun --cwd ts -e 'import { parseObjectiveList } from "./packages/pi-extensions/src/objective-list.ts"; ...'
bun run --cwd ts check
bun run --cwd ts test
```

Validation evidence:

- Before the user pulled `master`, `bun run --cwd ts check` and `bun run --cwd ts test` passed with the then-current TypeScript extension package.
- After the user pulled `master`, the same TypeScript checks/tests passed again: 197 tests, 0 failures.
- Parsing live `objective list --format json` with `ts/packages/pi-extensions/src/objective-list.ts` succeeded after the `parent_branch` / `slice_commits` schema change.

A focused runner subagent also inspected the same TypeScript extension scope and returned an independent candidate list. Its output agreed with the main review on the largest sources of duplication: Pi host shapes and fakes, command execution, Branch Memory CLI discovery, linkification, `land-stack` test surface, runner subagent naming/presentation, `worktree-status`, and risky vibecoded extension promotion.

## Current TypeScript extension inventory

Project-local discovery adapters:

- `.pi/extensions/create-brmem-plan.ts`
- `.pi/extensions/dispatch-runner-subagent.ts`
- `.pi/extensions/land-stack.ts`
- `.pi/extensions/objective.ts`
- `.pi/extensions/runner-subagent-demo.ts`
- `.pi/extensions/worktree-status.ts`

Vibecoded project-local implementations:

- `.pi/extensions/just-fix.ts`
- `.pi/extensions/land.ts`
- `.pi/extensions/submit.ts`

Engineered TypeScript implementation Modules:

- `ts/packages/pi-extensions/src/command-runtime.ts`
- `ts/packages/pi-extensions/src/create-brmem-plan.ts`
- `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`
- `ts/packages/pi-extensions/src/land-stack.ts`
- `ts/packages/pi-extensions/src/land-stack/*`
- `ts/packages/pi-extensions/src/objective-list.ts`
- `ts/packages/pi-extensions/src/objective-picker.ts`
- `ts/packages/pi-extensions/src/objective.ts`
- `ts/packages/pi-extensions/src/runner-subagent.ts`
- `ts/packages/pi-extensions/src/runner-subagent/*`
- `ts/packages/pi-extensions/src/runner-subagent-demo.ts`
- `ts/packages/pi-extensions/src/worktree-status.ts`

Test package inventory:

- Direct TypeScript package tests cover command runtime, create-brmem-plan, dispatch-runner-subagent, land-stack, Objective list/parser/picker/extension behavior, runner subagent, and worktree status.
- The test suite has strong coverage but repeats fake Pi host definitions in several files.

## Objective-list updates from `master`

The user ran `git pull` and reported many new remote branches. After that, `master` had Objective-list changes that affect this assessment.

Relevant current commits include:

- `5c36a747` — refactored `objective list` into `list_models`, `list_render`, `list_status`, `list_inventory`, and `list_updates` modules.
- `965d695c` — scoped `path_last_touched` to revision ranges for work branches, excluding inherited-only objective updates.
- `7993fbef` — optimized branch-slice calculation with merged-into facts.
- `cba6e4cb` — batched Objective path-touch lookups through `path_touches_under`, `tree_oids_at_refs`, and `commit_graph_from_base` gateway methods.
- `965d695c` / related stack-aware work — replaced `ahead_base` with `slice_commits` and `parent_branch` in Objective-list branch entries.

Current `objective list --format json` branch entries use:

```json
{
  "branch": "...",
  "parent_branch": "...",
  "status": "open",
  "updated_iso": "...",
  "slice_commits": 2
}
```

The TypeScript `objective-list.ts` parser now maps those fields to `parentBranch` and `sliceCommits`. `objective-picker.ts` labels picker choices with `max +N slice commits` rather than `max +N ahead base`. The live parser was checked against current `objective list --format json` output and passed.

Architectural impact:

- Python `objective list` itself is no longer an obvious deepening target for this Objective. It already has meaningful internal Modules around models, rendering, status projection, inventory, branch slices, touches, and update attribution.
- The TypeScript Objective extension remains a relevant consumer of the Objective-list Machine envelope. Its parser should follow current Result type fields, and a shared Machine envelope parser may still be valuable across Objective and Branch Memory consumers.
- The Objective picker candidate should be evaluated from the current `slice_commits` vocabulary, not the older `ahead_base` vocabulary.

## Candidate 1 — Pi host seam

**Files**

- `ts/packages/pi-extensions/src/land-stack/types.ts`
- `ts/packages/pi-extensions/src/objective.ts`
- `ts/packages/pi-extensions/src/create-brmem-plan.ts`
- `ts/packages/pi-extensions/src/runner-subagent-demo.ts`
- `ts/packages/pi-extensions/src/worktree-status.ts`
- `.pi/extensions/just-fix.ts`
- `.pi/extensions/submit.ts`
- `.pi/extensions/land.ts`
- Tests defining fake Pi hosts: `land-stack.test.ts`, `objective.test.ts`, `create-brmem-plan.test.ts`, `worktree-status.test.ts`, `dispatch-runner-subagent.test.ts`, `runner-subagent-demo.test.ts`

**Problem**

Each Module restates a local subset of Pi's host Interface: `ExtensionAPI`, command context, tool context, UI, message, renderer, `exec`, `sendMessage`, `sendUserMessage`, status/widget calls, and test fakes. The duplicate type shapes are not just line duplication; callers and tests all need to know slightly different Pi host facts.

**Deletion test**

Deleting one local type/fake does not remove complexity. The same Pi host knowledge appears in another extension or test. The missing deeper Module would concentrate these host facts.

**Potential solution**

Create a project-local Pi host Module with reusable minimal host Interfaces, fake Adapters, and perhaps helper constructors for command contexts and tool contexts. Keep per-extension adapters small when an extension needs a narrower Interface.

**Benefits**

- Better locality when Pi host behavior or import paths change.
- More leverage from a common fake host in tests.
- A natural place to fix import path drift from `@mariozechner/pi-coding-agent` to `@earendil-works/pi-coding-agent` in `.pi/extensions/land.ts` and `.pi/extensions/submit.ts`.

**Risks**

- A too-large host Interface could become shallower than the current local subsets.
- One adapter = hypothetical seam; the fake/test need may make this real, but the Module should still start from the common behaviors actually used.

## Candidate 2 — Command execution runtime beyond pure helpers

**Files**

- `ts/packages/pi-extensions/src/command-runtime.ts`
- `ts/packages/pi-extensions/src/land-stack/command-exec.ts`
- `ts/packages/pi-extensions/src/land-stack/command-stream.ts`
- `.pi/extensions/submit.ts`
- `.pi/extensions/just-fix.ts`
- `ts/packages/pi-extensions/src/objective.ts`
- `ts/packages/pi-extensions/src/create-brmem-plan.ts`
- `ts/packages/pi-extensions/src/worktree-status.ts`

**Problem**

The old Objective already extracted pure command-runtime helpers. However, deeper command lifecycle facts remain scattered: raw process spawning, timeout/kill behavior, startup failures, stream status updates, command output tails, post-command semantic failure detection, and UI/non-UI display behavior. `/submit` has a large raw `spawn` implementation and custom buffered-command helper outside the engineered package.

**Deletion test**

Deleting `command-runtime.ts` would now push pure display helpers back to callers, so it earns its keep. Deleting `.pi/extensions/submit.ts`'s command runner would not eliminate command lifecycle complexity; it would force another runner to appear.

**Potential solution**

Do not disturb the existing narrow `command-runtime.ts` decision. Separately evaluate whether `/submit` plus land-stack command streaming prove a deeper command execution Module with process, buffered, and streamed Adapters.

**Benefits**

- One place for timeout, kill, startup error, and output truncation policy.
- Easier fake-driven tests for risky Graphite/GitHub command workflows.

**Risks**

- Command execution can easily become a shallow generic wrapper if it tries to hide domain-specific semantics such as Graphite submit success/failure interpretation.

## Candidate 3 — Clinkr Machine envelope parser

**Files**

- `ts/packages/pi-extensions/src/objective-list.ts`
- `ts/packages/pi-extensions/src/create-brmem-plan.ts`
- `ts/packages/pi-extensions/src/worktree-status.ts`
- Python Result models under `packages/asdl-objectives/src/asdl_objectives/list_models.py`

**Problem**

TypeScript extension code parses Clinkr Machine envelopes and result payloads in several ways. `objective-list.ts` validates `exit_code`, `data`, and current Objective-list fields. `create-brmem-plan.ts` validates a Branch Memory `put` envelope locally. `worktree-status.ts` parses Branch Memory list output loosely and degrades to `unavailable`.

**Deletion test**

Deleting any one parser only moves Machine envelope knowledge to the next CLI consumer. The Machine envelope is a real shared contract from Clinkr.

**Potential solution**

Create a small Machine envelope parsing Module that owns `exit_code`, `data`, error-message shape, and caller-provided Result type validation. Keep domain Result type validation near the domain consumer unless there is broader leverage.

**Benefits**

- One place to absorb Clinkr envelope changes.
- Better tests for Objective and Branch Memory JSON parsing.
- Clear separation between framework envelope and domain Result type.

**Risks**

- Over-generalizing Result type validation could produce a noisy Interface that duplicates TypeScript schemas by hand.

## Candidate 4 — Branch Memory CLI Adapter

**Files**

- `ts/packages/pi-extensions/src/create-brmem-plan.ts`
- `ts/packages/pi-extensions/src/worktree-status.ts`

**Problem**

Both Modules rediscover the Branch Memory CLI through `.venv/bin/brmem`, `brmem`, and `uv run --directory ... brmem`, with duplicated ancestor search and candidate ordering. Error handling then diverges: `create-brmem-plan` accumulates detailed candidate failures, while `worktree-status` quietly reports `unavailable`.

**Deletion test**

Removing either copy only moves Branch Memory command-resolution knowledge to the remaining or next Branch Memory consumer.

**Potential solution**

Concentrate Branch Memory CLI discovery, execution, candidate fallback, and JSON envelope reading in one Module, while letting callers decide whether failure is fatal or status-only.

**Benefits**

- Branch Memory invocation changes become local.
- More leverage for future Branch Memory extension tools.
- Tests can fake Branch Memory once.

**Risks**

- Caller failure semantics differ; the shared Interface must expose enough information without forcing all callers into one fatal/nonfatal policy.

## Candidate 5 — Skill expansion and prompt handoff

**Files**

- `ts/packages/pi-extensions/src/objective.ts`
- `.pi/extensions/just-fix.ts`
- `ts/packages/pi-extensions/src/create-brmem-plan.ts`

**Problem**

Objective commands and `just-fix` both manually search `pi.getCommands()` for `skill:<name>`, strip frontmatter, calculate a base directory, build `<skill ...>` blocks, and send prompts. This is sensitive to Pi command provenance and `sendUserMessage()` semantics.

**Deletion test**

Deleting one implementation does not remove skill expansion knowledge; it reappears in another extension.

**Potential solution**

Introduce a shared skill-expansion Module only if the Objective and just-fix flows have enough common Interface. It might return structured expanded skill text and provenance rather than send the prompt itself.

**Benefits**

- Less drift in skill prompt format.
- Easier tests around missing skills and fallback prompts.

**Risks**

- The workflows differ: Objective selection is domain-specific, while just-fix is failure-output driven. A shared Module should not hide those domain differences.

## Candidate 6 — Presentation and linkification policy

**Files**

- `docs/pi/extension-message-linkification.md`
- `ts/packages/pi-extensions/src/land-stack/command-stream.ts`
- `ts/packages/pi-extensions/src/worktree-status.ts`
- `.pi/extensions/submit.ts`
- `ts/packages/pi-extensions/src/runner-subagent-demo.ts`

**Problem**

OSC 8 hyperlinks, URL sanitization, message text extraction, line truncation, and renderer behavior are implemented multiple ways. `land-stack` follows the documented `message.details` plus renderer pattern. `worktree-status` directly wraps the whole status line in OSC 8. `submit.ts` builds OSC 8 notification labels and has a local ANSI stripper; earlier assessment found its generic ESC alternative ordering contradicted the documented OSC-stripping gotcha.

**Deletion test**

Deleting any one helper does not remove linkification or rendering policy; the concept appears across presentation paths.

**Potential solution**

Create a shared presentation/linkification Module for terminal hyperlinks, URL validation, OSC/ANSI stripping, custom message text extraction, display truncation, and PR link detail parsing.

**Benefits**

- Safer hyperlinks.
- Consistent transcript/plain-message behavior.
- One test surface for OSC stripping and URL sanitization.

**Risks**

- Status-line rendering and chat message rendering have different Interfaces; shared helpers should be lower-level unless a deeper presentation Module emerges.

## Candidate 7 — `worktree-status` internal seams

**Files**

- `ts/packages/pi-extensions/src/worktree-status.ts`
- `ts/packages/pi-extensions/test/worktree-status.test.ts`

**Problem**

`worktree-status.ts` is a 900+ line Module that owns session lifecycle, refresh scheduling, filesystem watchers, Git path discovery, Branch Memory status, Graphite status, PR hyperlink rendering, command registration, and formatting. It has a small useful external Interface, but its Implementation has low internal locality.

**Deletion test**

Deleting the file would scatter real complexity, so the external Module has depth. The issue is not pass-through shallowness; it is missing internal Seams.

**Potential solution**

Keep the external command/status Interface small. Add internal Modules around observation/watchers, status gathering, and rendering. Introduce fake-friendly Adapters for watcher and session lifecycle tests if needed.

**Benefits**

- Safer changes to session replacement and watcher behavior.
- Less reliance on real temp filesystem setup.
- Clearer separation of facts from presentation.

**Risks**

- Watcher behavior is subtle and platform-sensitive; splitting without characterization tests could lose behavior.

## Candidate 8 — `land-stack` internal modules and test surface

**Files**

- `ts/packages/pi-extensions/src/land-stack.ts`
- `ts/packages/pi-extensions/src/land-stack/*`
- `ts/packages/pi-extensions/test/land-stack.test.ts`

**Problem**

`/land-stack` is a deep user-facing Module, but its top-level file re-exports many internals for tests. The test file is large and scripts exact command order across stack facts, PR facts, worktree facts, landing plan, landing operations, command streaming, and presentation.

**Deletion test**

Deleting `/land-stack` would scatter real landing complexity, so the external Module is valuable. Deleting the re-export surface could remove pass-through complexity if tests target more meaningful internal Modules directly.

**Potential solution**

Keep `/land-stack` as the external Interface. Improve internal test surfaces around the stage Modules and preserve safety invariants without freezing every command choreography detail.

**Benefits**

- Landing policy changes become more local.
- Tests can better distinguish domain invariant changes from implementation order changes.

**Risks**

- `land-stack` is safety-critical because it mutates PRs and local Graphite refs. Refactors must preserve conservative failure behavior.

## Candidate 9 — Runner subagent contract cleanup

**Files**

- `ts/packages/pi-extensions/src/runner-subagent.ts`
- `ts/packages/pi-extensions/src/runner-subagent/*`
- `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`
- `ts/packages/pi-extensions/src/runner-subagent-demo.ts`
- `docs/pi/runner-subagent-helper.md`
- `docs/pi/objective-stack-subagent-rewrite-brief.md`

**Problem**

The runner subagent helper is deep and useful, but the same concept appears as runner subagent, dispatch tool, demo command, generated runtime, terminal capture, final-text mode, and in some docs as child-session / `runChildSession`. Result formatting and progress presentation are duplicated between the generic tool and demo.

**Deletion test**

Deleting the core helper would spread process/runtime details to consumers, so it earns its keep. Deleting duplicated presentation/naming layers would reduce confusion.

**Potential solution**

Preserve the helper. Tighten parent-facing naming, terminal capture wording, result presentation helpers, and stale docs.

**Benefits**

- Future Objective stack work depends on one mental model.
- Less ambiguity for agents deciding whether a subagent result is complete.

**Risks**

- Renaming churn can break docs and project-local adapters if not done coherently.

## Candidate 10 — Vibecoded extension promotion / retirement

**Files**

- `.pi/extensions/submit.ts`
- `.pi/extensions/land.ts`
- `.pi/extensions/just-fix.ts`
- `docs/pi/README.md`

**Problem**

The docs say vibecoded extensions are valid until stability, risk, reuse, or test need justifies promotion. `/submit` mutates Graphite/PR state with raw process handling and no package tests. `/land` overlaps with `/land-stack` merge behavior and imports the old Pi package path. `/just` repeats skill expansion and prompt construction logic.

**Deletion test**

Deleting `/submit` loses substantial Graphite submit/restack semantics, so behavior is valuable. Deleting `/land` may reveal overlap with `/land-stack` rather than unique complexity. Deleting `/just` would lose a useful workflow but not necessarily a deep Module.

**Potential solution**

Classify each vibecoded extension explicitly:

- keep vibecoded,
- promote to engineered package,
- retire in favor of an engineered command,
- or split shared pieces into Modules while leaving the command local.

**Benefits**

- Risky branch/PR mutation behavior gains tests where needed.
- Old Pi import path drift gets resolved.
- The vibecoded layer remains intentional rather than accidental.

**Risks**

- Promoting too early can turn experiments into over-engineered shallow Modules.
- Retiring too quickly can remove useful local workflow affordances.

## Candidate 11 — Objective extension and Objective-list integration

**Files**

- `ts/packages/pi-extensions/src/objective.ts`
- `ts/packages/pi-extensions/src/objective-list.ts`
- `ts/packages/pi-extensions/src/objective-picker.ts`
- `packages/asdl-objectives/src/asdl_objectives/list*.py`
- `ts/packages/pi-extensions/test/objective*.test.ts`

**Problem**

The TypeScript Objective extension owns command registration, Objective picker flow, Objective list presentation, argument parsing, skill prompt construction, and git diff selection. Some pure parsing and picker logic is already extracted. The Python Objective-list implementation is now deeper and has changed its Result type vocabulary to `parent_branch` and `slice_commits`.

**Deletion test**

Deleting `objective-list.ts` or `objective-picker.ts` would push parsing/picker facts back into `objective.ts`, so those Modules are earning some keep. A broader Objective extension split may or may not pass the deletion test yet.

**Potential solution**

Keep tracking the TS/Python contract. Consider a Machine envelope parser and Result type compatibility tests before extracting more Objective command logic. Do not reopen the old `ahead_base` vocabulary.

**Benefits**

- Better locality for future Objective-list Result type changes.
- Clearer contract between Python Clinkr Operations and TypeScript Pi extension consumers.

**Risks**

- Splitting Objective command code further may not improve depth if the actual complexity is UI + skill prompt choreography.

## Candidate 12 — Test fake consolidation

**Files**

- `ts/packages/pi-extensions/test/create-brmem-plan.test.ts`
- `ts/packages/pi-extensions/test/objective.test.ts`
- `ts/packages/pi-extensions/test/land-stack.test.ts`
- `ts/packages/pi-extensions/test/runner-subagent-demo.test.ts`
- `ts/packages/pi-extensions/test/dispatch-runner-subagent.test.ts`
- `ts/packages/pi-extensions/test/worktree-status.test.ts`
- `ts/packages/pi-extensions/test/runner-subagent-fakes.ts`

**Problem**

Each test file has its own fake host or scripted exec shape. Some duplication is harmless local setup; some encodes repeated host Interface knowledge and brittle command sequencing.

**Deletion test**

Deleting one fake does not remove the need; tests recreate host, exec, command registration, UI, and message recording behavior elsewhere.

**Potential solution**

This may be part of Candidate 1, not a standalone implementation. If a Pi host seam is accepted, include fake host consolidation as the test Adapter side of that seam.

**Benefits**

- Less boilerplate.
- More reliable characterization tests for extension commands.

**Risks**

- A universal fake can become too broad and less readable than local fakes. Consolidate only common host behavior, not every scenario script.

## Suggested triage order

Recommended first pass:

1. Decide Candidate 10 (`/submit`, `/land`, `/just`) because risk and layer ownership determine several later seams.
2. Decide Candidate 1 / Candidate 12 together because a host seam and fake consolidation are tightly coupled.
3. Decide Candidate 6 because presentation/linkification is duplicated and comparatively contained.
4. Decide Candidate 4 and Candidate 3 together because Branch Memory CLI execution and Machine envelope parsing overlap.
5. Decide Candidate 7 and Candidate 8 after the host/presentation decisions, so `worktree-status` and `land-stack` splits can reuse accepted foundations.
6. Decide Candidate 9 when runner subagent docs/code are next touched, unless Objective-stack work makes it urgent.

Alternative first pass:

- Start with `worktree-status` if the immediate pain is runtime UI correctness.
- Start with `/submit` if the immediate pain is Graphite/GitHub safety.
- Start with Machine envelope parsing if Objective-list and Branch Memory consumers change frequently.
