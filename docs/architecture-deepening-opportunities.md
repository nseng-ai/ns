# Architecture Deepening Opportunities

Generated: 2026-05-08

## Purpose

This report captures four candidate refactors that would deepen shallow modules in `asdl-tools`. It is intended for a downstream agent to read before choosing implementation work. Each opportunity is framed in terms of:

- **Module** — anything with an interface and an implementation.
- **Interface** — everything callers must know: types, invariants, error modes, ordering, and config.
- **Implementation** — code inside the module.
- **Depth** — leverage at the interface: more behavior behind less caller knowledge.
- **Seam** — where an interface lives; behavior can vary there without editing callers.
- **Adapter** — concrete code satisfying an interface at a seam.
- **Leverage** — caller benefit from depth.
- **Locality** — maintainer benefit from depth.

No `CONTEXT.md` or `docs/adr/` files were present during exploration, so there were no domain-glossary terms or ADR decisions to apply.

## How to use this report

1. Pick one opportunity. Do not attempt all four in one branch unless explicitly asked.
2. Read the relevant package instructions before editing:
   - Root `AGENTS.md`.
   - `packages/asdl-objectives/AGENTS.md` for objective work.
   - `packages/brmem/AGENTS.md` for brmem work.
   - `packages/asdl-core/AGENTS.md` and subpackage `AGENTS.md` files for core gateway work.
3. Preserve the repo convention that CLI scenario tests cover standalone CLIs via `build_cli()` and plugin smoke tests live under top-level `tests/scenario/test_plugins.py`.
4. After implementation, run the relevant focused tests first, then `just`. If formatting or lint failures appear, use the autofix recipes from root `AGENTS.md`.

---

## 1. Deepen reviewer findings publication

### Files to inspect

- `packages/asdl-reviewer/src/asdl_reviewer/cli/reviewer/exec/format_findings_comment.py`
- `packages/asdl-reviewer/src/asdl_reviewer/cli/reviewer/exec/post_inline_findings.py`
- `packages/asdl-reviewer/src/asdl_reviewer/cli/reviewer/exec/classify_inline_findings.py`
- `packages/asdl-reviewer/src/asdl_reviewer/cli/reviewer/exec/post_findings_comment.py`
- `packages/asdl-reviewer/src/asdl_reviewer/inline_commentability.py`
- Tests:
  - `packages/asdl-reviewer/tests/unit/test_format_findings_comment.py`
  - `packages/asdl-reviewer/tests/unit/test_inline_commentability.py`
  - `packages/asdl-reviewer/tests/scenario/test_exec_cli.py`

### Current shape

`format_findings_comment.py` is more than a command adapter. It owns:

- `FindingRow`
- `FindingsPayload`
- `InlinePostingStatus`
- parse errors for findings payloads and inline-posting status
- parsing clinkr JSON envelopes from stdin
- parsing inline-posting result JSON
- Markdown rendering for the findings summary comment
- the `click.command` adapter for `reviewer exec format-findings-comment`

`inline_commentability.py` imports `FindingRow` from that CLI exec module, then owns the logic that decides whether findings can become GitHub inline comments.

`post_inline_findings.py` also imports parsing and `FindingRow` from `format_findings_comment.py`, then owns marker generation, duplicate detection, inline body rendering, and posting via the issue gateway.

`post_findings_comment.py` separately owns summary-comment marker extraction, activity-log preservation, and post/update behavior.

### Problem

The current module seams are shallow. The command module’s interface effectively includes domain models, JSON envelope parsing, Markdown rendering, inline-posting status, and Click behavior. Callers outside the command layer need to know about a CLI exec file to work with reviewer findings.

The clearest friction is this import direction:

```python
# packages/asdl-reviewer/src/asdl_reviewer/inline_commentability.py
from asdl_reviewer.cli.reviewer.exec.format_findings_comment import FindingRow
```

That means reusable review logic depends on a command adapter. Understanding the findings publication path requires bouncing between the exec command modules and `inline_commentability.py`.

### Deletion test

If `format_findings_comment.py` were deleted as a command module, its complexity would not vanish. The findings payload type, parser, renderer, and inline status model would reappear across `post_inline_findings.py`, `classify_inline_findings.py`, `inline_commentability.py`, and tests. That is a signal that there is a deeper module trying to exist.

### Proposed deepened module

Create a non-CLI module or small package that owns reviewer findings publication. Possible names:

- `asdl_reviewer.findings_publication`
- `asdl_reviewer.findings.publication`
- `asdl_reviewer.findings_payload`

Do not treat this list as a final interface. The implementation agent should design the smallest interface that removes the current shallow seams.

The deepened module should likely own:

- findings payload data (`FindingRow`, `FindingsPayload`)
- parse result types for clinkr findings envelopes
- inline-posting status data and parsing
- summary comment rendering
- inline marker generation and extraction
- inline body rendering
- inlineability classification, or at least the shared finding data type it uses

The CLI exec files should become adapters:

- read stdin / options
- call the deepened module
- translate results to stdout, stderr, or a clinkr result
- load gateways from `ReviewerCliContext` only at the command seam

### Expected benefits

**Locality**

Findings schema, marker rules, rendering, and publication behavior become concentrated in one module. A future change to marker format or finding parsing should not require edits across several command files.

**Leverage**

Multiple commands get the same behavior from one interface:

- `format-findings-comment`
- `classify-inline-findings`
- `post-inline-findings`
- `post-findings-comment`

The same module can also support future CI automation without importing Click command files.

**Test improvement**

Move most unit coverage to the deepened module:

- parse malformed clinkr envelopes
- render empty/error/nonempty findings comments
- classify inlineable vs fallback-only findings
- generate and extract inline markers
- preserve summary comment activity logs

Keep scenario tests in `test_exec_cli.py` as wiring tests: stdin/options/context load correctly and produce expected command output.

### Suggested implementation sequence

1. Add the new non-CLI module with data types and pure functions copied from the current exec files.
2. Update `inline_commentability.py` to import `FindingRow` from the new module, not from `cli.reviewer.exec`.
3. Update `format_findings_comment.py` to become a thin adapter over the new module.
4. Update `post_inline_findings.py` to use the new module for parsing, marker generation, marker extraction, and body rendering.
5. Consider moving activity-log helpers from `post_findings_comment.py` into the same module if the summary comment is part of the same findings publication concept.
6. Move or duplicate tests first, then remove old duplicate helper coverage once scenario tests are green.

### Guardrails and risks

- Keep Click imports out of the deepened module.
- Keep gateway access at the CLI seam unless designing an explicit publication adapter.
- Preserve existing marker strings unless intentionally migrating old comments.
- Watch for circular imports between `inline_commentability.py` and the new findings module.
- If GitHub interaction changes, consult the `dev-gh` skill first per root `AGENTS.md`.

---

## 2. Deepen objective archive transitions

### Files to inspect

- `packages/asdl-objectives/src/asdl_objectives/close.py`
- `packages/asdl-objectives/src/asdl_objectives/reopen.py`
- `packages/asdl-objectives/src/asdl_objectives/closed_marker.py`
- `packages/asdl-objectives/src/asdl_objectives/gateway_access.py`
- Tests under `packages/asdl-objectives/tests/scenario/` and `packages/asdl-objectives/tests/unit/`

### Current shape

`close.py` moves an objective from the active namespace to the archive namespace and writes the canonical `.closed` marker.

`reopen.py` moves an objective from the archive namespace back to the active namespace and removes archived entries.

Both command modules define near-identical helpers:

- `_EntryIdentity`
- `_entries_for_slug`
- `_content_map`
- `_delete_entries`
- `_branch_count`

Both modules also implement payload comparison and verification logic around namespace movement.

### Problem

The archive transition rules are objective mechanics, not command presentation. Today those mechanics live inside two command modules and are duplicated. The interface a maintainer must understand is nearly as broad as the implementation: active namespace, archive namespace, canonical trunk branch, `.closed` marker, payload equality, idempotence, conflicts, verification, deletion ordering.

This reduces locality. A future change to archive movement safety must be made in both directions and kept semantically aligned.

### Deletion test

If the helper logic in `close.py` and `reopen.py` were deleted, it would reappear in both command modules or in their tests. The complexity is not accidental presentation logic; it is the objective archive transition model.

### Proposed deepened module

Create a module such as:

- `asdl_objectives.archive_transition`
- `asdl_objectives.archive`

This module should own active/archive payload movement for one objective slug. It should not own Click rendering.

Likely responsibilities:

- identify all entries for a slug in a namespace
- load a slug payload keyed by `(branch, key)`
- verify copied payloads before deleting source entries
- preserve existing `.closed` marker when close is idempotent
- omit/drop `.closed` marker when reopening
- classify conflicts between active and archived payloads
- return domain result or domain failure types that the CLI translates

Follow `packages/asdl-core/src/asdl_core/clinkr/AGENTS.md`: reusable helpers should return domain result/failure types, not `ClinkrExit`. CLI operations translate those results at the command seam.

### Expected benefits

**Locality**

Archive invariants live in one module:

- active namespace vs archive namespace
- canonical trunk body requirement
- `.closed` marker meaning
- verification before source deletion
- idempotent close/reopen behavior

**Leverage**

Both commands use the same implementation. Future commands such as archive inspection, archive repair, or migration can reuse the same module.

**Test improvement**

Unit tests can exercise archive mechanics without Click:

- close unknown slug
- close already closed slug
- close active slug with no archive conflict
- close with active/archive content mismatch
- reopen unknown slug
- reopen already open slug
- reopen archived slug
- reopen with active/archive conflict
- verification failure keeps source entries

Scenario tests then only assert command rendering and clinkr envelopes.

### Suggested implementation sequence

1. Add domain result/failure dataclasses for close and reopen outcomes.
2. Move duplicated helpers into the new module.
3. Move payload comparison and verification into the new module.
4. Rewrite `run_close_objective` as a thin adapter: load context, resolve trunk, call transition module, render result.
5. Rewrite `run_reopen_objective` the same way.
6. Add unit tests for the transition module using `FakeBranchMemoryGateway`.
7. Keep existing scenario tests green, updating expected wording only if necessary.

### Guardrails and risks

- `brmem` must stay generic; do not move objective concepts into `packages/brmem`.
- Preserve closed marker `closed_at` on idempotent close.
- Preserve the current safety rule: verify destination content before deleting source entries.
- Be careful with empty strings: current `_content_map` stores `content or ""` after proving content is not `None`.
- Resolve trunk dynamically through `resolve_trunk(mctx.git_gateway)` / gateway behavior, not hard-coded `master` or `main`.

---

## 3. Deepen brmem ref layout

### Files to inspect

- `packages/brmem/src/brmem/gateway.py`
- `packages/brmem/src/brmem/real.py`
- `packages/brmem/src/brmem/key_validation.py`
- `packages/brmem/src/brmem/validation.py`
- Tests:
  - `packages/brmem/tests/unit/test_brmem_parse_entry_ref.py`
  - `packages/brmem/tests/unit/test_brmem_branch_validation.py`
  - `packages/brmem/tests/integration/test_real_brmem_gateway.py`

### Current shape

`gateway.py` owns both the abstract `BranchMemoryGateway` interface and layout helpers:

- `BRMEM_REF_PREFIX`
- `BRMEM_BASE_SEGMENT`
- `BRMEM_NS_SEGMENT`
- `snapshot_ref_name`
- `ref_name_for_entry`
- `parse_entry_ref`
- `encode_branch_segment`
- `decode_branch_segment`
- branch and namespace validation

`real.py` privately mirrors part of that layout:

- `_snapshot_ref_name`
- `_parse_snapshot_ref`
- `_decode_branch`

The real gateway imports constants and `encode_branch_segment`, but still has its own snapshot-ref parser and decoder.

### Problem

The brmem storage layout is deep behavior with a small natural interface: encode/decode branch segments, build snapshot refs, build entry locators, parse snapshot refs, parse entry locators, validate branch and namespace constraints.

Today that behavior is split between the abstract gateway module and the real implementation. The private mirror creates drift risk around the most important invariant in brmem: how `refs/brmem/...` maps to `(namespace, branch, key)`.

### Deletion test

If the layout helpers were deleted, callers would need to rebuild `refs/brmem/ns/<namespace>/<encoded-branch>:<key>` and the `/` to `---` encoding in multiple places. If the private mirror in `real.py` were deleted without replacement, list parsing would need equivalent logic somewhere else. The complexity is essential and deserves its own module seam.

### Proposed deepened module

Create a module such as:

- `brmem.ref_layout`
- `brmem.refs`

This module should own ref/locator layout and validation-adjacent helpers. The exact migration choice depends on how much import churn is acceptable.

Likely responsibilities:

- storage constants
- branch segment encode/decode
- branch name validation that protects the flat encoding
- namespace validation
- `snapshot_ref_name(namespace, branch)`
- `ref_name_for_entry(namespace, key, branch)`
- `parse_snapshot_ref(ref)` returning namespace/branch or a small parsed type
- `parse_entry_ref(locator)` returning `EntryRef | None`

One design choice: whether `EntryRef` stays in `gateway.py` because it is part of `BranchMemoryGateway.list_entries`, or moves into the layout module because it is the parsed entry locator type. Either can work; prefer the option that minimizes pass-through modules while keeping the gateway interface clear.

### Expected benefits

**Locality**

All `refs/brmem/...` facts live in one place. The real gateway stops mirroring layout logic.

**Leverage**

The real gateway, fake gateway, objective package, tests, and any future tool that needs locators reuse one implementation.

**Test improvement**

Create focused unit tests for the layout module:

- base snapshot ref parse
- namespaced snapshot ref parse
- entry locator parse
- malformed refs and locators
- branch names with `/`
- rejection of branch names containing `---`
- namespace rejection for `/`

Then shrink real gateway tests to prove storage behavior:

- writes do not move `HEAD`
- multiple entries coexist
- list entries decodes branches
- malformed refs are skipped

### Suggested implementation sequence

1. Add the new layout module and move/copy helpers into it.
2. Update `real.py` to use `snapshot_ref_name`, `parse_snapshot_ref`, and `decode_branch_segment` from the new module; delete private mirror helpers.
3. Update `fake.py` and callers to import layout helpers from the new module where appropriate.
4. Decide whether to update existing imports from `brmem.gateway` to the new canonical module in the same PR. This repo is private/unreleased, so direct import updates are acceptable if tests are updated.
5. Move or add unit tests for the layout module.
6. Run `packages/brmem` tests first, then broader tests.

### Guardrails and risks

- Do not make `brmem` import from `asdl_objectives` or any consumer package.
- Keep key validation in `key_validation.py`; do not conflate key path rules with branch-ref layout unless there is a clear reason.
- Preserve the exact `---` collision rule for branch names.
- Preserve current behavior where malformed refs under `refs/brmem` are skipped by `list_entries`.
- Be wary of creating a shallow pass-through module. The new module should own layout behavior, not merely re-export functions.

---

## 4. Deepen the Pi objective command client

### Files to inspect

- `ts/packages/asdl-pi-objectives/src/commands/list.ts`
- `ts/packages/asdl-pi-objectives/src/commands/next.ts`
- `ts/packages/asdl-pi-objectives/src/commands/objective.ts`
- `ts/packages/asdl-pi-objectives/test/unit/objective-root.test.ts`
- Python helper already present:
  - `packages/asdl-objectives/src/asdl_objectives/exec/next_context.py`

### Current shape

`list.ts` owns command discovery and objective-list parsing:

- find ancestor project roots
- resolve candidate commands (`.venv/bin/objective`, `objective`, `uv run ... objective`)
- shell quoting and command display
- parse clinkr envelopes for objective list
- schema guards for repo and branch list data
- render list messages in the Pi TUI

`next.ts` duplicates several of those responsibilities:

- split args
- shell quoting and command display
- command candidate resolution
- clinkr envelope parsing
- successful-envelope handling
- objective list schema guards
- branch list schema guards
- objective show schema guards

`next.ts` also reimplements deterministic objective mechanics in TypeScript:

- git repo preflight
- current branch detection
- trunk branch resolution
- canonical objective selection on trunk
- branch objective selection off trunk
- objective content loading via `objective show`
- freshness advisory via `objective exec update-precheck`

Python now has `objective exec next-context`, which already emits deterministic objective-next facts: current branch, trunk branch, on-trunk status, resolved slug, files present, raw body/roadmap/notes, and freshness advisory.

### Problem

The TS command modules are shallow around command execution: each caller learns too much about finding the Python CLI, parsing clinkr envelopes, validating schemas, and formatting command labels.

There is also drift risk between TypeScript objective mechanics and Python objective mechanics. The objective package owns deterministic objective behavior; the Pi extension should mostly present and interact with that behavior.

A concrete friction point: `list.ts` uses `ctx.cwd` to discover command candidates, but `executeObjectiveList` does not pass `cwd: ctx.cwd` to `pi.exec`. `next.ts` does pass `cwd`. This inconsistency is exactly the kind of bug a shared command-client module would make harder to introduce.

### Deletion test

If command discovery and clinkr-envelope parsing were deleted from either `list.ts` or `next.ts`, equivalent code would need to be copied from the other file. If TypeScript trunk/slug/freshness mechanics were deleted from `next.ts`, the behavior should move behind an existing Python exec command, not vanish.

### Proposed deepened modules

Create one or two shared TS modules, for example:

- `ts/packages/asdl-pi-objectives/src/objective-client.ts`
- `ts/packages/asdl-pi-objectives/src/objective-schemas.ts`

The command-client module should own:

- command candidate resolution
- `pi.exec` invocation with consistent `cwd`
- shell quoting and command display
- clinkr envelope parsing
- success/failure extraction
- common timeout behavior

The schema module should own shared shape guards:

- `ClinkrEnvelope<T>`
- repo list data
- branch list data
- objective show data if still needed
- next-context data

Then rewrite command modules as adapters:

- `/objective-list` renders list data using the shared client.
- `/objective-next` keeps argument validation, UI selection, Markdown interpretation, and TUI rendering, but loads deterministic facts through Python.

Important nuance: `objective exec next-context` currently resolves a unique slug or fails on ambiguity. If the Pi UI should still offer selection among multiple objectives, the extension may still need to call `objective list` for selection first, then call `objective exec next-context <slug> --format json` after a slug is chosen. Do not regress the current UI selection behavior unless product direction changes.

### Expected benefits

**Locality**

Python CLI discovery, clinkr envelope parsing, and schema validation live in one TypeScript client module. Objective mechanics stay in `asdl-objectives`.

**Leverage**

Any new Pi objective command can run Python objective commands through the same interface, with consistent error messages and command labels.

**Test improvement**

Add Vitest coverage for:

- command candidate ordering
- command display formatting
- clinkr envelope parsing
- failure envelope rendering
- schema guards
- `/objective-next` using next-context after slug selection
- `pi.exec` receives `cwd: ctx.cwd`

Keep command-specific tests focused on argument parsing, completion, and rendering.

### Suggested implementation sequence

1. Extract shared command-runner helpers from `list.ts` and `next.ts` into `objective-client.ts`.
2. Extract shared schema guards into `objective-schemas.ts`.
3. Update `list.ts` to use the shared client. Preserve current rendering and supported flags.
4. Update `next.ts` to use the shared client for all objective command invocations.
5. Replace TypeScript freshness/content gathering with `objective exec next-context <slug> --format json` after any needed UI slug selection.
6. Add tests proving `cwd` is consistently passed to `pi.exec`.
7. Run TS tests, then the repo suite as appropriate.

### Guardrails and risks

- Preserve the root `/objective` command completions in `objective.ts`.
- Preserve aliases `/objective-next`, `/objective-list`, and `/objective list` / `/objective ls` behavior unless explicitly changing UX.
- Do not push Markdown interpretation into Python just to reduce TS size. The current Python contract says `next-context` emits deterministic facts and raw Markdown; interpretation can remain in the Pi extension.
- Keep command-client code independent of TUI rendering so it remains reusable.
- Check Pi extension docs if changing extension registration or autocomplete behavior.

---

## Cross-opportunity notes

### Good first implementation candidates

- Lowest risk: **brmem ref layout**, if done as a pure move plus tests.
- Highest leverage for CI/reviewer work: **reviewer findings publication**.
- Best objective-system cleanup: **objective archive transitions**.
- Best Pi maintainability cleanup: **Pi objective command client**.

### Validation checklist for any chosen opportunity

- Unit tests cover the deepened module directly.
- Scenario tests still cover user-facing CLI behavior.
- No new public re-exports from package `__init__.py` files.
- No new Graphite dependency except inside explicit Graphite-named command paths.
- No vendored skill code is modified.
- `just` is green after autofixes if needed.
