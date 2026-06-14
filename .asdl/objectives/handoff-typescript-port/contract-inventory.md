# Handoff Contract Inventory

This document captures the current public contract and implementation evidence for porting `handoff` from Python to TypeScript. It is a drift anchor for downstream implementers; re-read current source before editing if files have changed.

## Audit Summary — 2026-06-14

Fresh inventory found no active user-facing references to `asdl handoff`:

```bash
rg -n "\basdl handoff\b" README.md docs src packages ts .agents skills tests justfile pyproject.toml CONTEXT-MAP.md
# no matches
```

Active public references outside the Python package use the standalone `handoff` command and Pi slash-command surfaces:

- `docs/pi/README.md` and `docs/pi/handoff-artifacts.md` document `/handoff:create`, `/handoff:pickup`, `/handoff:list`, standalone `handoff list`, `handoff delete`, and `handoff gc`. They currently say deletion is available through the **Python CLI**; update that wording during the TypeScript shim cutover, not during contract inventory.
- `skills/handoff*.md` and `skills/handoff/references/*.md` use standalone `handoff list/delete/gc` and direct `brmem --namespace handoff` only for storage/admin fallback.
- `ts/packages/pi-extensions/src/handoff.ts` shells out to standalone `handoff list --format json` / `handoff list --branch <branch> --format json` / `handoff list --all --format json`; it does not invoke `asdl handoff`.
- `ts/packages/pi-extensions/src/handoff/shared.ts` uses direct TypeScript `brmem` discovery/helpers for create existence checks and direct `brmem get` for pickup reads.

Plugin and Python-package references are limited to current implementation/config/test ownership:

- `packages/asdl-handoff/pyproject.toml` exposes both the standalone `handoff` script and `asdl.plugins` entry point.
- root `pyproject.toml` includes `packages/asdl-handoff` in the uv workspace, optional `plugins`, dev dependencies, Ruff sources, known-first-party, and pytest testpaths.
- `justfile` installs Python `packages/asdl-handoff` in `install-tools` and publishes `asdl-handoff` in `publish`.
- `tests/scenario/test_plugins.py` contains the only active `asdl_handoff` plugin smoke coverage, including `asdl_handoff.cli.plugin:build_handoff_plugin` and a root-context JSON-mode regression test.
- `CONTEXT-MAP.md` still points Handoff domain language at `packages/asdl-handoff/CONTEXT.md` until the TypeScript package context exists.

Plugin-retirement policy from this audit: no active user-facing or agent-facing instruction requires `asdl handoff`. Retiring the Python `asdl.plugins` path is unblocked after TypeScript parity, public shim cutover, docs/skill wording updates, and deletion/config cleanup. Removal work must delete or replace the root plugin smoke tests that import `asdl_handoff`; no compatibility shim is required by current inventory.

## Current Source Files

Python package:

```text
packages/asdl-handoff/pyproject.toml
packages/asdl-handoff/CONTEXT.md
packages/asdl-handoff/src/asdl_handoff/cli/main.py
packages/asdl-handoff/src/asdl_handoff/cli/plugin.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/group.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/context.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/brmem_gateway.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/inventory.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/list.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/delete.py
packages/asdl-handoff/src/asdl_handoff/cli/handoff/gc.py
packages/asdl-handoff/src/asdl_handoff/testing/fake_brmem_gateway.py
packages/asdl-handoff/tests/scenario/test_handoff_cli.py
```

Related TypeScript/Pi consumers:

```text
ts/packages/pi-extensions/src/handoff.ts
ts/packages/pi-extensions/src/handoff/shared.ts
ts/packages/pi-extensions/src/handoff/identity.ts
ts/packages/asdl-core/src/brmem-cli.ts
ts/packages/pi-extension-runtime/src/machine-envelope.ts
ts/packages/brmem/src/index.ts
ts/packages/brmem/scripts/brmem-shim
ts/packages/brmem/test/wrapper/brmem-shim.test.ts
```

Root/workspace files that will need cutover or deletion edits:

```text
pyproject.toml
uv.lock
justfile
tests/scenario/test_plugins.py
CONTEXT-MAP.md
.agents/skills/handoff/SKILL.md
.agents/skills/handoff-create/SKILL.md
.agents/skills/handoff-pickup/SKILL.md
skills/handoff/SKILL.md
skills/handoff-create/SKILL.md
skills/handoff-pickup/SKILL.md
```

Some `skills/` paths may not exist or may be generated/vendored depending on checkout state; inspect before editing.

## Current Package Metadata

`packages/asdl-handoff/pyproject.toml` currently declares:

```toml
[project]
name = "asdl-handoff"
version = "0.1.0"
description = "Manage directed handoff artifacts for asdl"
requires-python = ">=3.11"
dependencies = [
  "click>=8.1.7",
  "asdl-core",
]

[project.scripts]
handoff = "asdl_handoff.cli.main:main"

[project.entry-points."asdl.plugins"]
handoff = "asdl_handoff.cli.plugin:build_handoff_plugin"
```

Durable:

- standalone `handoff` command exists;
- root `handoff --runtime` exists and currently prints `runtime: python` plus `entry_point: asdl_handoff.cli.main:main`;
- package version is `0.1.0` unless changed by broader release policy.

Likely retirement candidate:

- `asdl.plugins` entry point for `asdl handoff` should be retired unless active inventory finds user-facing dependence.

## Current Command Tree

`build_handoff_group()` registers one group:

```text
handoff
  list
  delete
  gc
```

Durable:

- these three operations are the CLI scope.

Explicitly absent from CLI scope:

- no `handoff create` command;
- no `handoff pickup` command.

Create/pickup are skill/Pi workflows using Branch Memory and `handoff list` inventory.

## Handoff Storage Contract

Canonical vocabulary from `packages/asdl-handoff/CONTEXT.md`:

- Handoff Artifact: directed durable Markdown work-context artifact for future continuation.
- Continuation Focus: future work/decision/verification/implementation target.
- Handoff Slug: user-facing semantic name derived from Handoff Key by removing `.md`.
- Handoff Key: flat Branch Memory Entry Key shaped as `<handoff-slug>.md`.
- Handoff Namespace: Branch Memory Namespace named `handoff`.
- Handoff Summary: inventory record including branch, Branch State, Handoff Slug, Handoff Key, Entry Locator, and updated timestamp.
- Branch State: `active` or `deleted` local Git branch state.
- List Scope: one branch, all active local branches, or all branches including deleted local branches.
- Handoff Garbage Collection: explicit cleanup of Handoff Artifacts whose local branch is deleted.

Durable:

- Namespace: `handoff`.
- Key shape: flat `<slug>.md`.
- User-facing delete/pickup selectors are slugs without `.md`.
- Branch Memory locators are technical evidence, not the user-facing model.

Not durable / avoid reviving:

- legacy namespace `handoffs`;
- nested Handoff Keys;
- manifests or indexes.

## Branch Memory Adapter Details

Python `brmem_gateway.py` currently defines a handoff-local gateway over the public `brmem` CLI plus read-only git metadata.

Gateway methods:

```text
list_entries(namespace, branch | None) -> HandoffEntryRef[]
check(namespace, key, branch) -> HandoffEntryDiagnostic | None
delete(namespace, key, branch) -> commit sha
get_entry_updated_at(namespace, key, branch) -> timestamp | None
```

Important detail: `get_entry_updated_at` uses direct git plumbing:

```text
git cat-file -e <snapshot-ref>:<key>
git log -1 --format=%cI <snapshot-ref> -- <key>
```

Reason: public `brmem check` exposes Snapshot head metadata, not necessarily per-Entry last-change time. Handoff Summary `updated_at` should remain per-entry updated timestamp.

Current adapter intentionally ignores stale deleted Python venv scripts when finding `brmem`:

```text
if candidate.parts[-3:] == (".venv", "bin", "brmem"):
    continue
```

TypeScript replacement should prefer `@asdl/core/brmem-cli` public command discovery and PATH behavior. If venv shadowing is still possible for `handoff`, preserve the same public-shim preference or document why not.

## Handoff Key and Branch Validation

Durable slug rules from delete path:

- slug must not be empty;
- slug must not end with `.md`;
- slug must not contain `/`;
- generated key is `<slug>.md`;
- generated key must satisfy Branch Memory Entry Key validation.

Branch validation:

- branch name must not be empty;
- branch names containing `---` are rejected because `/` is encoded as `---` in Branch Memory refs;
- use public `@asdl/brmem` validation helpers where available instead of copying rules.

## `handoff list` Contract

Command:

```text
handoff list [--branch <branch>] [--all] [--include-deleted] [--format human|json|markdown|md]
```

Flags:

- `--branch <branch>`: explicit branch.
- `--all`: list across every active branch by default.
- `--include-deleted`: include handoffs whose local branch no longer exists.
- `--all-branches` is intentionally not accepted.

Conflicts:

- `--branch` and `--all` are mutually exclusive.

Current branch behavior:

- if neither `--branch` nor `--all` is passed, resolve current branch;
- detached HEAD is a failure with message instructing `--branch <branch> or --all`.

Filtering:

- only namespace `handoff`;
- only keys ending `.md`;
- keys must be flat: no `/`;
- key must be longer than `.md`;
- invalid Branch Memory keys are ignored;
- legacy namespace `handoffs` is ignored.

Deleted branches:

- Branch State is `active` if local branch exists, else `deleted`;
- deleted entries are skipped unless `--include-deleted` is passed;
- skipping deleted entries should happen before loading per-entry timestamps, so stale deleted entries without readable timestamps do not break active-only lists.

JSON result:

```json
{
  "exit_code": 0,
  "data": {
    "scope": "branch",
    "branch": "feat/x",
    "include_deleted": false,
    "handoffs": [
      {
        "branch": "feat/x",
        "branch_state": "active",
        "slug": "alpha",
        "key": "alpha.md",
        "entry_locator": "refs/brmem/ns/handoff/feat---x:alpha.md",
        "updated_at": "2026-01-01T00:00:01+00:00"
      }
    ]
  }
}
```

All-branches JSON uses:

```json
"scope": "all-branches",
"branch": null
```

Sorting from Python `collect_handoff_summaries`:

1. sort slug ascending;
2. stable sort updated timestamp descending;
3. stable sort branch ascending.

Effective ordering: branch ascending, then newest first within branch, then slug as tie-breaker.

Human empty messages:

```text
No handoffs found on branch <branch>.
No handoffs found across active branches.
No handoffs found across branches.
```

Human headings:

```text
Handoffs on <branch>
Handoffs across active branches
Handoffs across branches
```

Markdown current branch output shape:

```text
Handoffs on feat/x

| handoff | updated |
| --- | --- |
| alpha | 2026-01-01T00:00:03+00:00 |
| bravo | 2026-01-01T00:00:02+00:00 |
```

Markdown all-branches output shape:

```text
Handoffs across branches

| branch | state | handoff | updated |
| --- | --- | --- | --- |
| feat/a | active | alpha | 2026-01-01T00:00:03+00:00 |
| feat/a | active | charlie | 2026-01-01T00:00:02+00:00 |
| feat/b | deleted | bravo | 2026-01-01T00:00:01+00:00 |
```

Markdown cells escape `|` as `\|`.

## `handoff delete` Contract

Command:

```text
handoff delete [--branch <branch>] [-f|--force] <slug>
```

Behavior:

- Converts slug to key `<slug>.md` after validation.
- Resolves branch from `--branch` or current branch.
- Explicit `--branch` works even in detached HEAD.
- Omitted branch in detached HEAD fails.
- Checks the handoff exists before prompting.
- Without `--force`, prompts for confirmation on stderr.
- With `--force`, deletes without prompt.

Prompt:

```text
Delete handoff `<slug>` on branch `<branch>`? [y/N]:
```

Prompt responses:

- `y`, `yes`: delete;
- empty, `n`, `no`: cancel;
- invalid input: print `Error: invalid input` and prompt again;
- EOF currently raises Click abort; TypeScript should preserve exit-2 failure behavior or record intentional divergence.

JSON result:

```json
{
  "branch": "feat/x",
  "slug": "alpha",
  "key": "alpha.md",
  "entry_locator": "refs/brmem/ns/handoff/feat---x:alpha.md",
  "deleted": true,
  "cancelled": false,
  "commit": "<commit>"
}
```

Cancellation result:

```json
{
  "deleted": false,
  "cancelled": true,
  "commit": null
}
```

Human success:

```text
Deleted handoff `<slug>` on branch `<branch>`.
Entry Locator: <locator>
Commit: <commit>
```

Human cancellation:

```text
Cancelled — no handoff deleted.
```

Error types to preserve:

- `invalid_handoff_slug`
- `handoff_not_found`
- `detached_head`
- `invalid_branch_name`
- gateway error types where surfaced from `brmem` or git

## `handoff gc` Contract

Command:

```text
handoff gc [--dry-run] [-f|--force]
```

Rules:

- `--dry-run` and `--force` are mutually exclusive; error type `conflicting_flags`.
- Loads all Handoff Summaries across branches, including deleted local branches.
- Active branches are kept.
- Deleted branches are deletion candidates.
- `--dry-run` previews only.
- `--force` deletes candidates without prompt.
- No flags: render preview, prompt, then delete or cancel.

Actions:

```text
kept_active
would_delete
deleted
error
```

JSON result fields:

```json
{
  "entries": [
    {
      "branch": "feat/deleted",
      "branch_state": "deleted",
      "slug": "stale",
      "key": "stale.md",
      "entry_locator": "refs/brmem/ns/handoff/feat---deleted:stale.md",
      "action": "would_delete",
      "commit": null,
      "message": null
    }
  ],
  "would_delete_count": 1,
  "deleted_count": 0,
  "kept_count": 1,
  "error_count": 0,
  "dry_run": true,
  "cancelled": false
}
```

Prompt:

```text
Delete <count> handoff(s)? [y/N]:
```

Human output snippets to preserve:

```text
No handoffs for deleted branches.
Would delete <n> handoff(s) for deleted branches:
Deleted <n> handoff(s) for deleted branches:
Would delete <count>; deleted <count>; kept <count>; errors <count>
Cancelled — no handoffs deleted.
```

Under `--format json`, preview and prompt must go to stderr so stdout is machine-readable JSON.

## Plugin Contract and Retirement

The Python package currently mounts as an `asdl.plugins` entry point. Root plugin tests verify the discovered plugin by invoking `handoff list --all --format json` under a synthetic parent command; this is plugin-discovery coverage, not evidence that users are instructed to run `asdl handoff`.

Fresh audit command:

```bash
rg -n "\basdl handoff\b" README.md docs src packages ts .agents skills tests justfile pyproject.toml CONTEXT-MAP.md
```

Result: no matches. Active docs, skills, and Pi extension code refer to standalone `handoff` and `/handoff:*`, not `asdl handoff`.

Retirement decision: retire the plugin during TypeScript cutover, as `pr-address` retired its Python plugin. The durable public surface is standalone `handoff` plus Pi/skills. A downstream implementer should still rerun the grep before deletion, but current inventory does not require preserving a plugin compatibility path.

Deletion/cutover implications:

- remove `asdl_handoff` imports and handoff plugin smoke cases from `tests/scenario/test_plugins.py`;
- remove `asdl-handoff` from root uv workspace/config/dev/plugin dependency lists after the TypeScript CLI is default;
- update `just install-tools` to install the TypeScript shim instead of the Python package;
- update docs that currently say "Python CLI" to refer to the TypeScript/default `handoff` CLI;
- move Handoff domain context ownership from `packages/asdl-handoff/CONTEXT.md` to `ts/packages/handoff/CONTEXT.md` when that package exists.

## Pi and Skill Consumer Contract

Current Pi and skill consumers depend on the standalone command and JSON payload shape:

- `/handoff:list` in `ts/packages/pi-extensions/src/handoff.ts` executes `handoff list --format json`, `handoff list --branch <branch> --format json`, or `handoff list --all --format json`.
- Pi parses `data.handoffs[]` items with `branch`, `key`, and flat `.md` Handoff Keys, deriving the displayed slug from the key. It also tolerates a legacy `data.entries[]` shape from older Branch Memory list output, but the TypeScript `handoff` port should preserve the current `data.handoffs[]` contract rather than relying on that fallback.
- Pi pickup reads artifact bodies with `brmem get <slug>.md --namespace handoff --branch <branch>` after resolving the handoff through `handoff list`.
- Pi create uses the `handoff-create` skill/fallback prompt and `brmem put` directly; no `handoff create` CLI operation is required or expected.
- `handoff-pickup` skill instructions require `data.handoffs` fields: `branch`, `branch_state`, `slug`, `key`, `entry_locator`, and `updated_at`.
- `handoff` umbrella/admin skills require standalone `handoff delete` and `handoff gc` for cleanup and use raw `brmem` only for storage recovery, copy, or move flows not covered by the CLI.

Compatibility caution: `ts/packages/pi-extensions/src/handoff/identity.ts` uses a stricter lower-case-dash `parseFlatHandoffSlug` for Pi-authored slugs than Python `handoff delete` currently enforces. Do not accidentally narrow the standalone CLI delete/list contract to the Pi slug regex unless an explicit compatibility decision and tests say so; preserve Python's current slug-to-key validation for CLI deletion.

## TypeScript Implementation Anchors

Use existing TS package patterns:

- `ts/packages/brmem/src/cli.ts` for `buildCli`, `runCli`, runtime diagnostics, and Clinkr registration.
- `ts/packages/brmem/scripts/brmem-shim` and `test/wrapper/brmem-shim.test.ts` for run-from-source shim behavior.
- `ts/packages/brmem/src/context.ts` for real context construction.
- `ts/packages/asdl-core/src/git/index.ts` and `testing.ts` for ordinary Git facts.
- `ts/packages/asdl-core/src/brmem-cli.ts` for public `brmem` command execution/discovery.
- `ts/packages/pi-extension-runtime/src/machine-envelope.ts` for result-union machine envelope parsing patterns if needed.

Use TypeScript style rules:

- strict, erasable TypeScript;
- Zod request/result schemas at CLI boundary;
- string-literal unions instead of enums;
- result unions for expected gateway failures;
- top-level function declarations for module logic;
- package public exports only, no cross-package deep imports.

## Test Matrix to Preserve

Port the Python scenario test coverage into Vitest. Required scenario categories:

- root help/version/runtime;
- unavailable/non-git context failure;
- list help flags;
- delete help flags;
- gc help flags;
- delete force current branch;
- delete explicit deleted branch;
- delete prompt accept/decline;
- delete JSON prompt decline stdout/stderr separation;
- delete rejects `.md`, slash, invalid branch;
- delete not found exact branch error;
- delete detached HEAD without branch;
- list current branch;
- list ignores legacy namespace and nested/non-md keys;
- list explicit branch in detached HEAD;
- list explicit deleted branch requires `--include-deleted`;
- list all active branches;
- list all including deleted branches;
- markdown current branch sorting;
- markdown all-branches sorting;
- JSON all active branches;
- JSON all including deleted branches;
- rejects `--all-branches`;
- missing updated timestamp failure;
- active-only all-branch list skips deleted entries before timestamp loading;
- empty list messages;
- list detached HEAD;
- list git failure;
- `--branch`/`--all` conflict;
- gc dry-run;
- gc force;
- gc prompt accept/decline;
- gc no candidates skips prompt;
- gc dry-run/force conflict;
- gc JSON prompt decline stdout/stderr separation.

Add TypeScript-specific tests:

- `handoff --runtime` reports TypeScript entry point;
- wrapper shim behavior;
- real temp-repo smoke for list/delete/gc over TypeScript `brmem`.

## Validation Reference

Focused during implementation:

```bash
pnpm --dir ts/packages/handoff run check
pnpm --dir ts/packages/handoff run test
```

Framework row:

```bash
pnpm --dir ts/packages/clinkr run check
pnpm --dir ts/packages/clinkr run test
```

Workspace:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```

Python/config deletion rows:

```bash
uv lock --check
uv run pytest tests/scenario/test_plugins.py -q
uv run ruff check tests/scenario/test_plugins.py
uv run ty check
just
```

Docs/Objectives:

```bash
dprint check .asdl/objectives/handoff-typescript-port .asdl/objectives/port-asdl-toolkit-to-typescript CONTEXT-MAP.md
```

Use `just fix` for Ruff/format failures and `just dprint-fix` for dprint failures.
