# Candidate Cost/Benefit Ranking

This document rank-orders the candidates from `assessment.md` by expected value per unit of implementation and conceptual complexity. It is the durable rationale behind the roadmap ordering in `roadmap.md`.

## Scoring frame

Scores are intentionally coarse:

- **Impact**: expected safety, locality, reuse, test leverage, user-visible correctness, and future-agent navigability. 5 is highest.
- **Cost**: implementation effort plus the durable complexity introduced by a new Interface, new tests, migration churn, and risk of behavior regressions. 5 is highest.
- **Ratio**: impact divided by cost. Higher means better first-slice value.

The scoring follows the deletion test from `assessment.md`: a new Module is worth adding only when deleting it would scatter real complexity back across callers. Pure line-count reduction is not enough.

## Ranked order

| Rank | Candidate                                                         | Impact | Cost | Ratio | Roadmap stance                                                      |
| ---: | ----------------------------------------------------------------- | -----: | ---: | ----: | ------------------------------------------------------------------- |
|    1 | Candidate 6 — Presentation and linkification policy               |    4.5 |  1.5 |   3.0 | Implement first                                                     |
|    2 | Candidate 4 — Branch Memory CLI Adapter                           |    4.0 |  2.0 |   2.0 | Implement early                                                     |
|    3 | Candidate 3 — Clinkr Machine envelope parser                      |    3.5 |  1.8 |   1.9 | Implement with or immediately after Candidate 4                     |
|    4 | Candidate 9 — Runner subagent contract cleanup                    |    3.0 |  1.6 |   1.9 | Implement as a small cleanup slice                                  |
|    5 | Candidate 5 — Skill expansion and prompt handoff                  |    2.7 |  1.8 |   1.5 | Implement only as a narrow pure helper                              |
|    6 | Candidate 10 — Vibecoded extension promotion / retirement         |    5.0 |  3.7 |   1.4 | Triage now; promote `/submit` only if accepted                      |
|    7 | Candidate 1 — Pi host seam                                        |    4.3 |  3.3 |   1.3 | Implement narrowly; fold in Candidate 12 only as test-adapter work  |
|    8 | Candidate 11 — Objective extension and Objective-list integration |    2.8 |  2.4 |   1.2 | Park broad split; keep contract tests current                       |
|    9 | Candidate 7 — `worktree-status` internal seams                    |    4.5 |  4.2 |   1.1 | Do after lower-level helpers land                                   |
|   10 | Candidate 8 — `land-stack` internal modules and test surface      |    4.0 |  4.4 |   0.9 | Defer until landing behavior changes                                |
|   11 | Candidate 2 — Command execution runtime beyond pure helpers       |    4.0 |  4.8 |   0.8 | Do not start here; wait for `/submit` promotion evidence            |
|   12 | Candidate 12 — Test fake consolidation as a standalone project    |    2.3 |  3.2 |   0.7 | Do not implement standalone; fold selectively into Candidate 1 only |

## Detailed reasoning

### Rank 1: Candidate 6 — Presentation and linkification policy

**Why impact is high**

Presentation and linkification policy appears in several live paths:

- `land-stack/command-stream.ts` already has the healthiest pattern: plain message content, URL metadata in `message.details`, defensive renderer parsing, OSC 8 output, URL sanitization, and renderer tests.
- `worktree-status.ts` repeats terminal hyperlink and URL sanitizer helpers and wraps a whole status line in one hyperlink.
- `runner-subagent-demo.ts` repeats `customMessageText()` and `truncateDisplayLine()` style presentation helpers.
- `.pi/extensions/submit.ts` has local OSC 8 notification formatting and a local ANSI stripper whose alternative ordering differs from the documented OSC-stripping gotcha.

A shared low-level presentation Module would improve user-visible consistency, transcript readability, and terminal-link safety. It also gives higher-risk future work, especially `/submit` promotion, a safer foundation.

**Why cost is low**

The candidate can be implemented mostly as pure functions with straightforward tests:

- sanitize `http` / `https` URLs and reject control characters;
- construct OSC 8 hyperlinks;
- strip ANSI and OSC escapes in the documented safe order;
- extract plain text from custom message content;
- truncate visible display lines;
- linkify PR references from explicit metadata.

Those helpers do not need to own command execution, UI lifecycle, or domain policy.

**Complexity risk**

The danger is over-unifying two different Interfaces: status-line rendering and chat-message rendering. The shared seam should be below those renderers. Keep command-specific renderers local unless another deletion-test-backed seam appears.

**Recommended first slice**

Create a small presentation/linkification module and migrate one or two consumers with tests. Use it to retire duplicated URL sanitization and escape stripping before broader rendering changes.

### Rank 2: Candidate 4 — Branch Memory CLI Adapter

**Why impact is high**

`create-brmem-plan.ts` and `worktree-status.ts` both rediscover the Branch Memory CLI using the same candidate pattern:

1. ancestor `.venv/bin/brmem`,
2. `brmem` on `PATH`,
3. `uv run --directory <project-root> brmem`.

That is real Branch Memory invocation policy. Deleting either copy would not remove the complexity; it would leave the remaining copy as the next place future callers imitate.

A shared adapter would localize Branch Memory CLI changes, improve tests, and make future Branch Memory Pi tools cheaper to write.

**Why cost is moderate**

The common discovery/execution policy is clear, but caller failure semantics differ:

- `persist_brmem_plan` needs detailed candidate failures and must fail loudly.
- `worktree-status` should quietly degrade to unavailable status when Branch Memory cannot be queried.

The adapter must expose rich enough results for both without forcing one fatal/nonfatal policy.

**Complexity risk**

A too-opinionated adapter could hide important caller policy. The shared Interface should own candidate resolution, command display, execution attempts, and structured failure details. It should not decide whether a status widget, tool call, or command handler treats failure as fatal.

**Recommended first slice**

Extract Branch Memory candidate resolution and run-attempt logic first. Then migrate `create-brmem-plan.ts`; migrate `worktree-status.ts` after the nonfatal status behavior is characterized.

### Rank 3: Candidate 3 — Clinkr Machine envelope parser

**Why impact is high enough to do early**

Objective and Branch Memory consumers both parse Clinkr Machine JSON envelopes with framework fields like `exit_code` and `data`:

- `objective-list.ts` validates the envelope and Objective-list fields.
- `create-brmem-plan.ts` validates the envelope and Branch Memory `put` fields.
- `worktree-status.ts` currently parses Branch Memory list output more loosely and degrades to unavailable.

The Machine envelope is a framework contract. It should not be reimplemented by every TypeScript CLI consumer.

**Why cost is low-to-moderate**

The useful shared Interface is small: parse JSON, require an object envelope, handle nonzero `exit_code`, require a data object, and produce useful diagnostics. Domain payload validation can remain local.

**Complexity risk**

The parser becomes expensive if it tries to become a generic schema system. Objective-list fields and Branch Memory fields should not move into one mega-parser.

**Recommended first slice**

Implement an envelope-only parser such as `parseMachineEnvelope(stdout, label) -> unknown data`. Reuse it from `objective-list.ts` and from the Branch Memory adapter or `create-brmem-plan.ts`.

### Rank 4: Candidate 9 — Runner subagent contract cleanup

**Why impact is meaningful**

The runner subagent helper is already a deep Module, but the mental model is split across code and docs:

- runner subagent helper,
- dispatch tool,
- demo command,
- generated runtime,
- terminal capture,
- final-text mode,
- older child-session / `runChildSession` terminology.

Future Objective-stack work depends on agents understanding this contract. Cleanup lowers the chance that an agent treats a non-final-text status as complete or revives slash-command completion handoffs.

**Why cost is low**

Most of the work is naming, docs, and result-presentation consolidation. It does not require changing the core process runner.

**Complexity risk**

A broad rename across code, docs, and tests can create churn. The cleanup should preserve the helper and focus on parent-facing terminology and presentation duplication.

**Recommended first slice**

Update stale docs and shared result formatting around final-text vs terminal-capture statuses. Keep any renaming tightly scoped.

### Rank 5: Candidate 5 — Skill expansion and prompt handoff

**Why impact is moderate**

Objective commands and `/just` both perform the same skill-expansion chores:

- call `pi.getCommands()`,
- find `source === "skill"` and `name === skill:<name>`,
- read the skill path,
- strip frontmatter,
- compute a base directory,
- embed a `<skill ...>` block into a follow-up prompt.

This repeated policy is sensitive to Pi command provenance and skill path semantics.

**Why cost is low if narrow**

A pure helper that returns structured skill expansion data is cheap and testable. It can avoid owning any domain prompt.

**Complexity risk**

The helper becomes shallow or confusing if it tries to send messages, choose Objectives, format `just` output, or own fallback domain prompts. Those policies are different across callers.

**Recommended first slice**

Only extract a helper like `expandSkillBlock(pi, skillName)`. Let callers build their own Objective or `just` prompts and call `sendUserMessage()` themselves.

### Rank 6: Candidate 10 — Vibecoded extension promotion / retirement

**Why impact is highest in absolute terms**

This candidate covers risky repo-local commands:

- `/submit` mutates Graphite/GitHub state, has raw `spawn` lifecycle handling, restack preflight, semantic submit failure detection, PR verification, and custom link formatting.
- `/land` overlaps with richer `/land-stack` merge behavior and imports the old Pi package path.
- `/just` is useful but mostly prompt orchestration around `just` and `dev-just-fix`.

If `/submit` is a durable workflow, keeping it untested in the vibecoded layer is the largest safety risk in the candidate list.

**Why cost is high**

Promoting `/submit` correctly is not a small extraction. It needs fake-driven tests for:

- Graphite dry-run and submit flows,
- restack confirmation,
- restack conflict detection,
- process timeout and kill behavior,
- startup failures,
- current-PR verification,
- semantic Graphite success-with-skipped-branch failures,
- output tailing,
- PR link extraction and notification rendering.

It also requires Graphite/GitHub workflow guidance and may overlap with `/land-stack` and command streaming.

**Complexity risk**

This is where over-abstraction is most tempting. Promoting `/submit` should start from concrete behavior and tests, not from a generic command runtime. Domain-specific Graphite semantics must stay visible.

**Recommended first slice**

First classify each vibecoded command as promote, retire, keep vibecoded, or split. Likely outcomes: promote `/submit` if retained, retire or justify `/land`, keep `/just` vibecoded unless Candidate 5 lands or `/just` becomes safety-critical.

### Rank 7: Candidate 1 — Pi host seam, with Candidate 12 folded in only where useful

**Why impact is high**

Multiple modules restate local subsets of Pi host facts: `ExtensionAPI`, command context, tool context, UI methods, message renderer shape, `exec`, `sendMessage`, `sendUserMessage`, and fake host behavior. Tests repeat fake Pi hosts and scripted exec machinery.

A narrow host seam can improve locality when Pi changes and reduce test setup duplication.

**Why cost is medium-high**

The wrong Interface becomes a god object. A broad `ProjectPiHost` type can make every extension depend on more host surface than it needs. A universal fake can also become harder to read than local test setup.

**Complexity risk**

This seam is only deep if it concentrates real host knowledge. It is shallow if it merely re-exports every possible Pi method or forces all tests through one large fake DSL.

**Recommended first slice**

Start with common test adapters and minimal structural types used by at least two callers. Keep per-extension production Interfaces narrow. Treat Candidate 12 as part of this work, not as standalone cleanup.

### Rank 8: Candidate 11 — Objective extension and Objective-list integration

**Why impact is moderate**

The TypeScript Objective extension is an important consumer of Python `objective list` output. The current contract now uses `parent_branch` and `slice_commits`; the TypeScript parser has been updated to `parentBranch` and `sliceCommits`.

Keeping that contract stable has value, especially if a Machine envelope parser lands.

**Why cost is moderate**

The obvious useful modules already exist: `objective-list.ts`, `objective-picker.ts`, and `objective.ts`. Python Objective-list implementation has also been split into meaningful modules on `master`. A broad TypeScript split may not improve depth.

**Complexity risk**

The complexity inside Objective commands is mostly UI selection plus skill-prompt choreography. Splitting it too far can create shallow pass-through modules.

**Recommended first slice**

Park broad extraction. Keep parser/contract tests current and reuse the Machine envelope parser if Candidate 3 lands.

### Rank 9: Candidate 7 — `worktree-status` internal seams

**Why impact is high**

`worktree-status.ts` mixes many responsibilities:

- session lifecycle,
- refresh scheduling,
- filesystem watchers,
- Git path discovery,
- Branch Memory status,
- Graphite status,
- PR hyperlink rendering,
- command registration,
- formatting.

The external Module is deep and useful, but its Implementation has low internal locality.

**Why cost is high**

Watcher behavior is race-prone and platform-sensitive. Session replacement can make contexts stale. Splitting without characterization tests could cause stale UI, missed refreshes, duplicate refreshes, or cleanup leaks.

**Complexity risk**

Internal seams should not obscure lifecycle behavior. The first split should reuse accepted presentation and Branch Memory helpers; otherwise it may invent local abstractions that later need replacement.

**Recommended first slice**

Do this after Candidates 6, 4, and 3. Then split status gathering, rendering, and watcher/session observation with tests around refresh and shutdown behavior.

### Rank 10: Candidate 8 — `land-stack` internal modules and test surface

**Why impact is high**

Landing is safety-critical. `/land-stack` mutates PRs and local Graphite refs, and tests currently encode a large amount of conservative behavior. Better internal test surfaces could make future landing policy changes safer.

**Why cost is very high**

`land-stack.test.ts` scripts exact command choreography across stack facts, PR facts, worktree conflicts, landing planning, landing operations, command streaming, and presentation. Refactoring this without losing safety signals is expensive.

**Complexity risk**

A test-surface cleanup can accidentally weaken safety by making risky command-order or preflight changes less visible. The external `/land-stack` Interface is already valuable; the problem is not shallow module structure.

**Recommended first slice**

Defer broad work. Improve locality only when landing behavior changes require touching the area, or after shared presentation/host helpers lower the cost.

### Rank 11: Candidate 2 — Command execution runtime beyond pure helpers

**Why impact could be high later**

A deeper runtime could theoretically own process spawning, timeout/kill policy, startup failures, buffered output, streaming output, output tails, command display, and UI status updates. `/submit` and `/land-stack` provide possible evidence.

**Why cost is currently highest**

The shared Interface is not yet clear:

- buffered execution and streamed command presentation are different;
- `pi.exec` and raw `spawn` have different tradeoffs;
- cancellation semantics differ;
- domain-specific semantic failure detection, especially Graphite submit behavior, is not generic command execution.

**Complexity risk**

This is the easiest candidate to overbuild. A generic command runtime could become a large pass-through wrapper that hides domain policy while adding another layer to debug.

**Recommended first slice**

Do not start here. Preserve `command-runtime.ts` pure helpers. Revisit only after `/submit` promotion or another concrete consumer proves repeated lifecycle semantics.

### Rank 12: Candidate 12 — Test fake consolidation as a standalone project

**Why standalone impact is low**

Repeated fakes are evidence that host facts are duplicated, but deleting local fakes alone does not deepen production behavior. A standalone fake-consolidation project mostly reduces boilerplate.

**Why standalone cost is medium-high**

A universal fake host or scripted-exec DSL can become broad, indirect, and harder to read than local setup. It can also freeze accidental test implementation details.

**Complexity risk**

The fake layer can outrun the production seam. That produces test infrastructure that all tests must understand but no production caller actually needs.

**Recommended first slice**

Do not implement Candidate 12 standalone. Fold only common fake behavior into Candidate 1 after the narrow Pi host seam is clear.

## Execution implications

The best first work is not the highest absolute safety issue. It is the work that removes real repeated policy with the least new conceptual surface:

1. **Start with presentation/linkification.** It is pure, already documented, and immediately improves safety.
2. **Then do Branch Memory CLI plus Machine envelope parsing.** These are exact duplicated infrastructure contracts with clear caller boundaries.
3. **Then clean up runner subagent terminology/presentation.** It preserves an already-deep helper and reduces future-agent confusion.
4. **Then triage vibecoded extension ownership.** `/submit` probably deserves promotion, but that should be an explicit safety slice, not an incidental refactor.
5. **Then introduce a narrow Pi host/test seam.** Let the earlier slices reveal which host facts are genuinely common.
6. **Only then touch large high-risk internals.** `worktree-status`, `land-stack`, and deeper command execution should reuse foundations rather than creating them locally.

## Guardrails

- Do not extract Modules merely to reduce line count.
- Keep domain semantics near the domain unless multiple concrete consumers prove otherwise.
- Prefer pure helpers before lifecycle abstractions.
- Prefer caller-owned failure policy when callers intentionally differ.
- Treat `/submit`, `/land-stack`, Graphite, and GitHub behavior as safety-critical.
- Treat Candidate 12 as evidence for Candidate 1, not as an independent cleanup mandate.
