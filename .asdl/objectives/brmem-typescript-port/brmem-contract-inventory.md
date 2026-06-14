# brmem Contract Inventory

## Purpose

This document records the current public and storage contract for the Python `brmem` implementation before designing or porting the TypeScript implementation. It classifies behavior as either a durable compatibility contract for the TypeScript port or likely incidental Python behavior that should not drive the design unless tests or users prove otherwise.

The central compatibility requirement is that Python-written and TypeScript-written Branch Memory Entries remain mutually readable through the same Git refs while the transition is active.

## Evidence sources inspected

Primary public-contract sources:

- `.agents/skills/brmem/SKILL.md` — public skill reference and user/agent operating rules.
- `packages/brmem/CONTEXT.md` — canonical Branch Memory vocabulary.
- `packages/brmem/AGENTS.md` — package boundary and dependency rules.
- `packages/brmem/pyproject.toml` — standalone console-script identity.
- `packages/brmem/src/brmem/group.py` — command tree and hidden `exec` subgroup.
- `packages/brmem/src/brmem/main.py` — standalone CLI construction, help, version, and runtime metadata.
- `packages/brmem/src/brmem/ref_layout.py` — Snapshot Ref, Entry Locator, branch encoding, Namespace, and parser rules.
- `packages/brmem/src/brmem/key_validation.py` — Entry Key rules.
- `packages/brmem/src/brmem/content_limits.py` — `put` ingestion limits.
- `packages/brmem/src/brmem/validation.py` — request-failure aggregation and `--key-glob` validation.
- `packages/brmem/src/brmem/put.py`, `get.py`, `check.py`, `list.py`, `delete.py`, `copy.py`, `export.py`, `exec/resolve_prompt.py` — operation behavior and renderers.
- `packages/brmem/src/brmem/gateway.py`, `real.py`, `fake.py` — storage gateway contract, real Git plumbing, and fake model.
- `packages/brmem/tests/scenario/test_brmem_cli.py` — user-facing CLI scenario behavior.
- `packages/brmem/tests/scenario/test_brmem_resolve_prompt.py` — prompt-resolution behavior.
- `packages/brmem/tests/unit/test_brmem_ref_layout.py` — ref/locator parsing and encoding.
- `packages/brmem/tests/unit/test_brmem_key_validation.py` — Entry Key validation.
- `packages/brmem/tests/unit/test_brmem_content_limits.py` — content limits and binary sniffing.
- `packages/brmem/tests/integration/test_real_brmem_gateway.py` — real Git snapshot-tree behavior.

## Package and CLI surface

### Durable contract

`brmem` is a standalone package and CLI, not an `asdl` plugin subgroup. The installed console script is declared as:

```toml
[project.scripts]
brmem = "brmem.main:main"
```

The standalone command group is named `brmem` and exposes these user-facing operations:

- `put`
- `get`
- `delete`
- `list`
- `check`
- `copy`
- `export`

It also exposes a hidden skill-facing subgroup:

- `exec resolve-prompt`

The `exec` subgroup is invocable but hidden from top-level `brmem -h` output. Scenario tests assert that top-level help shows the user-facing operations and does not show `exec`, `resolve-prompt`, legacy `branch`, `list-artifacts`, `check-artifact`, or `check-entry` commands.

The CLI supports `-h`/`--help`, `--version`, Clinkr machine JSON mode via `--format json`, and eager `--json-schema` for operations. The TypeScript port should preserve the command tree, help discoverability boundary, machine-mode envelope shape, and schema availability.

### Likely incidental

The Python `--runtime` output currently reports:

```text
runtime: python
entry_point: brmem.main:main
```

The existence of runtime metadata is useful for wrapper/debugging parity, but the literal Python entry-point output is expected to change during TypeScript cutover. Treat this as a distribution/wrapper compatibility concern, not a storage or public data contract.

## Package boundaries and dependencies

### Durable contract

`packages/brmem/AGENTS.md` defines `brmem` as the generic Branch Memory System backed by Git refs. It must stay agnostic of workflow-specific Namespace schemas, slugs, or higher-level state models.

Current Python boundary rules:

- Allowed `asdl-core` imports are `asdl_core.clinkr` and `asdl_core.git` only.
- No imports from sibling consumers.
- Tests must be self-contained and not depend on unrelated `asdl_core` subpackages.
- Third-party dependencies must be declared in the package's own project metadata.

For the TypeScript port, preserve the same architectural boundary: `brmem` should be a reusable primitive package with package-local Git plumbing until a second consumer proves a shared gateway seam.

### Likely incidental

The exact Python import graph and class/module names are implementation details. The TS design should not mirror Python modules mechanically.

## Domain vocabulary to preserve

### Durable contract

Use the package context vocabulary consistently:

- Branch Memory System — the package, CLI, and Git-ref mechanism.
- Branch Memory — the collection of Entries attached to one branch across the Base Namespace and named Namespaces.
- Namespace — branch-scoped Entry bucket; named Namespaces are workflow-owned.
- Base Namespace — reserved canonical `base` Namespace, stored under `refs/brmem/base/<encoded-branch>`.
- Entry — small UTF-8 text record under one Entry Key.
- Entry Key — POSIX-like relative name within one Namespace.
- Snapshot — commit-backed view of all Entries in one Namespace on one branch.
- Snapshot Ref — real Git ref pointing to a Snapshot.
- Entry Locator — copy-pastable `git show` locator `<snapshot-ref-or-commit>:<entry-key>`.
- Namespace Copy — branch-to-branch copy within one Namespace.
- Copy Conflict — destination Entry that would be replaced unless replacement is explicit.
- Export — filesystem materialization of selected Entries.

The port should avoid stale wording such as `Entry Ref` / `Ref locator` for new docs and code comments, while preserving existing JSON field names where they are part of the machine contract.

### Likely incidental

Some Python DTOs still use `ref_name` as a legacy field name for Entry Locator strings. That field is durable in JSON envelopes for compatibility, but new internal TS naming can use `entryLocator` so long as public JSON remains compatible.

## Git-ref storage contract

### Durable contract

The storage layout is the central compatibility contract.

Snapshot Refs:

```text
refs/brmem/base/<encoded-branch>
refs/brmem/ns/<namespace>/<encoded-branch>
```

Rules:

- The Base Namespace has canonical identity `base` and is stored only under `refs/brmem/base/`.
- Named Namespaces are stored under `refs/brmem/ns/<namespace>/`.
- `refs/brmem/ns/base/...` is malformed/reserved and should be skipped/rejected, not treated as Base Namespace.
- Branch names are encoded by replacing `/` with `---`.
- Branch names containing `---` are rejected because they cannot round-trip unambiguously.
- Entry Keys keep their native `/` characters inside the Snapshot tree; only the branch is flattened into one ref segment.
- One `(namespace, branch)` pair maps to one Snapshot Ref.
- The Snapshot Ref points at a commit whose tree contains every Entry as a blob at path `<key>`.
- An Entry Locator is `<snapshot-ref>:<key>` and must be usable with `git show`.

Examples:

```text
refs/brmem/base/feat---x:scratchpad
refs/brmem/ns/scratch/feat---x:plan/plan.md
refs/brmem/ns/notes/feature---foo:body.md
```

Snapshot parser behavior:

- Accept only `refs/brmem/base/<encoded-branch>` and `refs/brmem/ns/<namespace>/<encoded-branch>`.
- Silently skip malformed refs during enumeration.
- Ignore refs outside `refs/brmem/base/` and `refs/brmem/ns/`.
- Preserve nested Entry Keys after the first `:` in Entry Locator parsing.

Real Git behavior:

- `put` creates or advances the Snapshot Ref with a new commit.
- Consecutive `put`s on the same Snapshot Ref form a linear history on that ref.
- `put` preserves sibling keys by building the next tree from the parent tree plus the new/replaced blob.
- `delete` creates a new commit whose parent is the previous Snapshot commit.
- Deleting the last key leaves the Snapshot Ref pointing at a commit with Git's canonical empty tree; the ref is not removed.
- Branch Memory writes do not modify repository `HEAD` or the working-tree status.
- Regular file tree entries are stored with Git mode `100644`.

### Likely incidental

The exact commit messages generated by Python are mostly implementation detail, except where current tests assert them for specific copy-with-glob behavior. The TypeScript port should first preserve or test compatibility where messages are asserted, then decide whether those assertions represent durable contract or test overreach.

The temporary index implementation (`GIT_INDEX_FILE`, `brmem-index-*` temp dirs) is incidental. TypeScript can use any Git plumbing that produces the same tree/ref results.

## Branch, Namespace, and Entry Key validation

### Durable contract: branch names

Accepted branch examples include:

- `master`
- `feat/x`
- `feat/x/y/z`
- `user/feature`
- `a`

Rejected branch names:

- empty string
- any branch containing `---`

The real gateway additionally delegates to `git check-ref-format --branch` so invalid Git branch syntax is rejected as an invalid branch name. Detached HEAD when the branch is omitted is a command failure with exit code `2`.

### Durable contract: Namespaces

Namespace rules:

- `None` / omitted namespace normalizes to Base Namespace `base`.
- `base` is the canonical Base Namespace identity.
- Named Namespaces must be non-empty single path segments.
- `/` is forbidden in Namespaces.
- `--namespace base` selects the Base Namespace in commands where accepted.

### Durable contract: Entry Keys

Accepted Entry Key examples include:

- `plan`
- `plan.md`
- `plan/plan.md`
- `a/b/c/d/e`
- `a---b`
- `a-b_c.d`
- `UPPER`
- `with.dots.many`
- `foo..bar`
- `a.locker`
- `.lockfile`
- `unicode-é-ok`

Rejected Entry Keys:

- empty key
- leading `/`
- trailing `/`
- `//`
- `:`
- space
- `~`
- `^`
- `?`
- `*`
- `[`
- `\`
- ASCII control characters, including tab, newline, NUL, DEL
- any segment exactly `..`
- any segment ending `.lock`

Reason ordering is currently tested for a few overlapping cases. Exact user-facing reason text is less important than preserving validation semantics and JSON `error_type`, but changing reason text may break scenario tests or skill diagnostics.

### Durable contract: `--key-glob`

`copy --key-glob` uses Python `fnmatch.fnmatchcase` semantics today:

- `*` matches `/`.
- `?` and character classes are supported by the underlying fnmatch behavior.
- Empty glob is invalid.
- NUL and newline are invalid.

Examples:

- `foo/*` matches `foo/body.md` and `foo/sub/x.md`.
- `foo/*` does not match sibling prefix `foobar/body.md`.
- `*.md` can match Entry Keys across multiple prefix directories.

The TS port should preserve this behavior explicitly rather than assuming shell-glob semantics where `*` might not cross `/`.

## Content limits and ingestion rules

### Durable contract

`brmem put` stores UTF-8 text Entries.

Limits and checks:

- Raw bytes are read from `--file`, `--stdin`, or an inferred default file path.
- Unless `--force` is supplied, Entries larger than 1 MiB are rejected.
- Unless `--force` is supplied, likely binary content is rejected by scanning the first 8 KiB for a NUL byte.
- `--force` bypasses the 1 MiB size cap and NUL-byte binary-content heuristic.
- UTF-8 decoding is always required, even with `--force`.
- Empty content is accepted.
- NUL bytes just past the first 8 KiB pass the binary heuristic but still must decode as UTF-8.

Important edge case: Python text rendering through Click can append a trailing newline in human `get` output for content not ending in newline, and a forced file containing NUL bytes was tested through `CliRunner` as output ending with `\n`. Preserve CLI-level scenario expectations unless intentionally reclassified.

### Likely incidental

The exact human-readable byte formatting helper (`1024 -> 1 KiB`, `1_500_000 -> 1.4 MiB`) is user-facing but not central to storage compatibility. Preserve initially for low risk; do not design core TS types around it.

## Common CLI and machine-mode behavior

### Durable contract

All public operations use Clinkr-style outcomes:

- Success exits `0` and returns `{"exit_code": 0, "data": ...}` in JSON mode.
- Negative expected misses can exit `1` with data and message.
- Invalid requests or failures exit `2` with `error_type` and `message` in JSON mode.

Known negative/failure semantics:

- `check` present: exit `0`.
- `check` absent: exit `1`.
- `check` invalid request/failure: exit `2`.
- `export` empty selection: exit `1` and no files created.
- Missing `get`, missing `delete`, invalid validation, detached HEAD when branch omitted, Git failure, prompt resolution failure: exit `2`.

Machine mode rules:

- `--format json` produces stable JSON envelopes.
- `--json-schema` is eager and exits `0` for operations.
- Python `put --stdin --format json` is rejected because Python Clinkr machine input uses stdin for the request body.
- TypeScript Clinkr treats `--format json` as output-only and does not consume stdin for request input, so TypeScript `put --stdin --format json` is intentionally supported.
- `get` human mode intentionally prints only stored content; JSON mode includes metadata and content.

### Likely incidental

Exact human prose should be preserved during the first TS parity pass to avoid churn, but structured JSON, exit codes, and storage behavior are the higher-priority compatibility surface.

## Operation contracts

## `put`

### Durable contract

Purpose: write content to a Branch Memory Entry.

Inputs/flags:

- positional `key`
- `--namespace <ns>` optional, omitted means Base Namespace
- `--stdin`
- `--file <path>`
- `--branch <branch>` optional, omitted means current Git branch
- `-f` / `--force`
- `--format json`

Behavior:

- TypeScript supports `--stdin` with `--format json`; Python rejects that combination for Python runtime input-mode reasons.
- Rejects `--stdin` together with `--file`.
- If neither `--stdin` nor `--file` is supplied, infers a default source file from the Entry Key basename.
- If no basename can be inferred, fails with `source_file_missing`.
- Reads raw bytes from source.
- Applies size and binary checks unless `--force`.
- Always decodes as UTF-8.
- Resolves current branch when `--branch` is omitted; detached HEAD or Git failure exits `2`.
- Validates namespace, key, and branch before writing.
- Writes content through the gateway, preserving sibling keys.
- Repeated `put` to the same Entry Key overwrites that Entry by creating a new Snapshot commit.

Human output includes:

- Stored Entry Key
- source (`stdin` or file path)
- Namespace/Base Namespace
- Branch
- Entry Locator
- Commit
- `Inspect: git show <entry-locator>`

JSON `data` fields:

- `namespace`
- `key`
- `branch`
- `ref_name` (Entry Locator)
- `commit`
- `source_file`

Failure `error_type`s observed in tests/source include:

- `stdin_unsupported_in_json_mode` (Python-only runtime input-mode failure; not carried forward as a durable TS error)
- `stdin_and_file_conflict`
- `source_file_missing`
- `source_file_unreadable`
- `entry_too_large`
- `entry_appears_binary`
- `entry_not_utf8`
- `invalid_namespace`
- `invalid_key`
- `invalid_branch_name`
- `invalid_request`
- `git_failure`

### Likely incidental

The default-source-file inference from key basename is surprising but tested and public enough to preserve initially. It can be revisited only with an explicit compatibility decision.

## `get`

### Durable contract

Purpose: read one Entry's content.

Inputs/flags:

- positional `key`
- `--namespace <ns>` optional, omitted means Base Namespace
- `--branch <branch>` optional, omitted means current Git branch
- `--at <treeish-or-commit>` optional historical lookup target
- `--format json`

Behavior:

- Validates namespace, key, and branch.
- When `--at` is omitted, reads from the current Entry Locator.
- When `--at` is supplied, reads `<at>:<key>` while still reporting the branch and normal Entry Locator.
- Human mode prints only Entry content.
- Missing content exits `2` with a message including the Entry Key, Namespace, Branch, target, and `git show` inspection locator.

JSON `data` fields:

- `namespace`
- `key`
- `branch`
- `content`
- `ref_name` (normal Entry Locator)
- `target`
- `at`

### Likely incidental

Exact missing-content prose can be preserved initially, but the durable behavior is the `2` failure plus enough locator metadata for diagnostics.

## `check`

### Durable contract

Purpose: test existence and get Entry metadata without printing full content.

Inputs/flags:

- positional `key`
- `--namespace <ns>` optional, omitted means Base Namespace
- `--branch <branch>` optional, omitted means current Git branch
- `--at <treeish-or-commit>` optional historical lookup target
- `--format json`

Exit codes:

- `0`: Entry exists.
- `1`: Entry is absent; this is a normal negative result.
- `2`: invalid request, detached HEAD when branch omitted, or command failure.

Human present output includes:

- Namespace (`(base)` for Base Namespace)
- Entry Key
- Branch
- Entry Locator
- Target
- Head SHA and date
- Blob SHA
- Size

Absent behavior:

- exit `1`
- human stdout empty
- message on stderr
- JSON includes `exit_code: 1`, `message`, and `data` with nullable diagnostic fields

JSON `data` fields:

- `namespace`
- `key`
- `branch`
- `ref_name`
- `target`
- `at`
- `head_sha`
- `head_date`
- `blob_sha`
- `size_bytes`

This is one of the most load-bearing contracts for skill automation.

## `list`

### Durable contract

Purpose: list Entries.

Inputs/flags:

- `--namespace <ns>` optional
- `--key <key>` optional exact key filter
- `--branch <branch>` optional
- `--base` optional Base Namespace restriction
- `--all-branches` optional
- `--format json`

Behavior:

- Default scope with neither `--base` nor `--namespace` is all Namespaces on the selected branch.
- `--base` restricts to Base Namespace.
- `--namespace base` returns Base Namespace Entries.
- `--base` and `--namespace` are mutually exclusive.
- `--branch` and `--all-branches` are mutually exclusive.
- Without `--all-branches`, omitted `--branch` resolves current branch and can fail on detached HEAD.
- With `--all-branches`, no current branch is needed.
- Empty result exits `0` with no human output.
- Results sort with Base Namespace first, then named Namespaces, then key, then branch.

Human output line shape:

```text
<Base Namespace|Namespace ns> | Entry Key <key> | Branch <branch>
```

JSON `data` fields:

- `namespace_scope` (`all`, `base`, or namespace)
- `key`
- `branch` (`null` when all branches)
- `base`
- `all_branches`
- `entries` with `namespace`, `key`, `branch`, `ref_name`

## `delete`

### Durable contract

Purpose: remove one explicit Entry.

Inputs/flags:

- positional `key`
- `--namespace <ns>` optional, omitted means Base Namespace
- `--branch <branch>` optional, omitted means current Git branch
- `--format json`

Behavior:

- Validates namespace, key, and branch.
- Deletes only the selected Entry.
- Preserves sibling Entries in the same Snapshot.
- Missing Snapshot or missing key exits `2` with `key_not_found` in JSON mode.
- Deleting the last key leaves an empty-tree Snapshot commit and existing Snapshot Ref.
- Delete is non-idempotent: a second delete of the same missing key fails.

Human output includes:

- Deleted Entry Key
- Namespace/Base Namespace
- Branch
- Entry Locator
- Commit

JSON `data` fields:

- `namespace`
- `key`
- `branch`
- `ref_name`
- `commit`

## `copy`

### Durable contract

Purpose: atomically copy Branch Memory Entries from one branch to another within one Namespace scope.

Inputs/flags:

- exactly one of:
  - `--base`
  - `--namespace <ns>`
- required `--from-branch <branch>`
- required `--to-branch <branch>`
- optional `--key-glob <pattern>`
- `--overwrite`
- `--dry-run`
- `--format json`

Scope behavior:

- Omitting both `--base` and `--namespace` is invalid.
- Passing both is invalid.
- `--namespace base` targets Base Namespace.

Without `--key-glob`:

- Copies every Entry in the selected Namespace.
- Source Snapshot Ref must exist and contain Entries; otherwise CLI exits `2` with `no_matching_entries`.
- If destination Snapshot has Entries and `--overwrite` is false, copy aborts before mutation with destination conflict.
- Empty destination Snapshot is not a conflict.
- With `--overwrite`, destination Snapshot Ref is reassigned to the exact source Snapshot commit.
- Destination-only keys are dropped because the whole destination Snapshot is replaced.
- No new tree/commit is created for snapshot-level copy; the destination ref points to the source commit SHA.

With `--key-glob`:

- Source keys are filtered using fnmatch semantics.
- No matching source keys exits `2` at CLI level and does not create a destination ref.
- Non-matching destination keys are preserved.
- Matching destination keys conflict unless `--overwrite`.
- With `--overwrite`, only matching destination keys are replaced; non-matching destination keys survive.
- The destination tree is rebuilt as `dest_non_matching ∪ source_matching`.
- A new destination Snapshot commit is created.
- If destination already existed, the new commit has the prior destination Snapshot commit as parent.
- If destination did not exist, the new commit is parentless.
- Conflict checks run before ref mutation, so copy is atomic under conflict.

Dry-run:

- Computes and reports the copy plan.
- Does not mutate the gateway/ref state.

Human output includes:

- `Copied` or `Would copy`
- count and Entry/Entries pluralization
- Namespace/Base Namespace
- source and destination branches
- optional key-glob filter line
- per-entry key, source SHA, Source Entry Locator, Destination Entry Locator

JSON `data` fields:

- `namespace`
- `from_branch`
- `to_branch`
- `overwrite`
- `dry_run`
- `copied`
- `key_glob`

Each `copied` item has:

- `key`
- `source_ref`
- `destination_ref`
- `source_sha`

Failure `error_type`s include:

- `base_and_namespace_conflict`
- `copy_scope_missing`
- `invalid_namespace`
- `invalid_from_branch`
- `invalid_to_branch`
- `invalid_key_glob`
- `no_matching_entries`
- `destination_conflict`
- `source_sha_unavailable`
- `git_failure`

## `export`

### Durable contract

Purpose: materialize Branch Memory Entries as filesystem files.

Inputs/flags:

- `--namespace <ns>` optional, omitted means Base Namespace only
- `--branch <branch>` optional, omitted means current Git branch
- `--output-dir <dir>` optional
- `--overwrite`
- `--dry-run`
- `--format json`

Behavior:

- Omitting `--namespace` exports Base Namespace Entries only; it does not mean all Namespaces.
- `--namespace base` exports Base Namespace Entries.
- Omitting `--output-dir` creates a fresh temp directory path shaped like `brmem-export-<random-hex>` under the system temp directory.
- Relative `--output-dir` is resolved under `Path.cwd()`.
- Entries are sorted by key.
- Each Entry Key maps to a relative path under `output_dir`.
- Nested keys create directories.
- Empty selection exits `1`, writes nothing, and does not create the output directory.
- `--dry-run` reports planned writes but creates no directories/files.

Preflight safety:

- Output path must not be a broken symlink.
- Existing output path must be a directory.
- Parent paths must be directories and not unsafe symlinks.
- Target path must not be a symlink.
- Existing target directories are rejected.
- Existing target files require `--overwrite`.
- Duplicate target paths are rejected.
- Unsafe key path segments (`""`, `.`, `..`) are rejected in addition to normal Entry Key validation.
- Preflight happens before writing, so conflicts leave existing files untouched.

Human output includes:

- `Exported` or `Would export`
- count and Base/Namespace summary
- branch
- output directory
- per-entry `key -> path`

JSON `data` fields:

- `namespace`
- `branch`
- `output_dir`
- `overwrite`
- `dry_run`
- `exported`

Each exported item has:

- `key`
- `path`
- `ref_name`
- `size_bytes`

## `exec resolve-prompt`

### Durable contract

Purpose: skill-facing prompt plugin resolution, not an ordinary Branch Memory operation.

Inputs/flags:

- positional `name`
- `--format json`

Behavior:

- Command path is `brmem exec resolve-prompt <name>`.
- Requires running inside a Git repository so the project-local prompt path can be resolved.
- Resolution order:
  1. `<repo-root>/.brmem/prompts/<name>.md`
  2. `<home-root>/.brmem/prompts/<name>.md`
- Project-local prompt wins over global prompt.
- Failure to find either exits `2` with `prompt-not-found`.
- Not in a Git repo exits `2` with `not-a-git-repo`.

Human output:

- stdout: resolved path only
- stderr: `tier: project` or `tier: global`

JSON `data` fields:

- `path`
- `tier` (`project` or `global`)

### Likely incidental

The failure message currently mentions `just install-tools` and packaged `default-prompt.md`. Preserve initially for user continuity, but the durable contract is resolution order, exit code, and JSON data shape.

## Gateway/library contract

### Durable contract

The TypeScript package should expose a reusable library API as well as the CLI. The storage gateway must be capable of:

- listing one Namespace with optional key/branch filters
- listing all Namespaces with optional key/branch filters
- putting content and returning commit SHA
- getting content at current Snapshot or historical target
- checking diagnostics at current Snapshot or historical target
- obtaining per-Entry updated timestamp, if kept for consumers
- deleting Entries
- copying Entries atomically with snapshot-level and key-glob behavior

Current diagnostic fields:

- `head_sha`
- `head_date`
- `blob_sha`
- `size_bytes`

Real Git plumbing currently uses:

- `git for-each-ref`
- `git show`
- `git cat-file -e`
- `git cat-file -s`
- `git rev-parse`
- `git log`
- `git hash-object -w --stdin`
- `git update-index --cacheinfo`
- `git write-tree`
- `git commit-tree`
- `git update-ref`
- `git check-ref-format --branch`

The TypeScript seam should be package-local for now and fake-driven. Do not extract a shared `@asdl/core` git ref/blob/tree gateway until a second consumer proves the seam.

### Likely incidental

The fake gateway's synthetic commit IDs (`fake-0001`), blob IDs (`blob-fake-0001`), and epoch dates are test fixtures, not production contract. TypeScript tests can use their own stable fake identifiers as long as scenario golden expectations are updated deliberately or isolated from production JSON parity requirements.

## JSON envelope compatibility inventory

### Durable contract

The following JSON `data` shapes are part of the current machine contract and should be preserved unless explicitly reclassified.

`put` success:

```json
{
  "namespace": "scratch",
  "key": "plan/plan.md",
  "branch": "feat/x",
  "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
  "commit": "<commit>",
  "source_file": "<path-or-stdin>"
}
```

`get` success:

```json
{
  "namespace": "scratch",
  "key": "plan/plan.md",
  "branch": "feat/x",
  "content": "json\n",
  "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
  "target": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
  "at": null
}
```

`list` success:

```json
{
  "namespace_scope": "scratch",
  "key": null,
  "branch": "feat/x",
  "base": false,
  "all_branches": false,
  "entries": [
    {
      "namespace": "scratch",
      "key": "plan/a.md",
      "branch": "feat/x",
      "ref_name": "refs/brmem/ns/scratch/feat---x:plan/a.md"
    }
  ]
}
```

`check` present:

```json
{
  "namespace": "scratch",
  "key": "plan/plan.md",
  "branch": "feat/x",
  "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
  "target": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
  "at": null,
  "head_sha": "<snapshot-commit>",
  "head_date": "<commit-date>",
  "blob_sha": "<blob-sha>",
  "size_bytes": 6
}
```

`check` missing has the same data shape with nullable diagnostic fields and envelope `exit_code: 1` plus `message`.

`delete` success:

```json
{
  "namespace": "scratch",
  "key": "plan/plan.md",
  "branch": "feat/x",
  "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
  "commit": "<commit>"
}
```

`copy` success:

```json
{
  "namespace": "notes",
  "from_branch": "master",
  "to_branch": "feat/x",
  "overwrite": false,
  "dry_run": false,
  "copied": [
    {
      "key": "foo/body.md",
      "source_ref": "refs/brmem/ns/notes/master:foo/body.md",
      "destination_ref": "refs/brmem/ns/notes/feat---x:foo/body.md",
      "source_sha": "<source-snapshot-or-head-sha>"
    }
  ],
  "key_glob": null
}
```

`export` success:

```json
{
  "namespace": "base",
  "branch": "feat/x",
  "output_dir": "<dir>",
  "overwrite": false,
  "dry_run": false,
  "exported": [
    {
      "key": "plan.md",
      "path": "<dir>/plan.md",
      "ref_name": "refs/brmem/base/feat---x:plan.md",
      "size_bytes": 5
    }
  ]
}
```

`resolve-prompt` success:

```json
{
  "path": "<resolved-path>",
  "tier": "project"
}
```

Failure envelope:

```json
{
  "exit_code": 2,
  "error_type": "<stable-error-type>",
  "message": "<diagnostic>"
}
```

Negative envelope (`check` missing, `export` empty):

```json
{
  "exit_code": 1,
  "message": "<diagnostic>",
  "data": { }
}
```

## Human output compatibility inventory

### Preserve initially

Human output is used by agents and users and should be preserved in the first TS parity pass where practical:

- `get` human output is exactly the stored content.
- `check` hit prints metadata lines; miss prints message to stderr and stdout is empty.
- `list` prints one line per Entry with Namespace, Entry Key, and Branch.
- `put`, `delete`, `copy`, `export` print concise mutation/planning summaries and locators.
- `resolve-prompt` prints path to stdout and tier to stderr.

### Reclassify only with explicit rationale

Human prose is less important than JSON/storage compatibility, but changing it can break skills that parse or quote diagnostics. Any intentional change should be recorded with tests and compatibility rationale.

## Behavior that should not be blindly ported

The TypeScript implementation should not copy these Python details unless needed for compatibility:

- Python package/module/class names.
- Exact fake gateway IDs/dates.
- Temporary index implementation details.
- Internal exception class names.
- Clinkr Python type/model definitions beyond their public JSON/CLI consequences.
- Any source-code organization that would prevent an idiomatic TS library + CLI package.

## Compatibility test implications for the TypeScript port

The first TS implementation should include evidence for:

1. Ref-layout unit tests:
   - base and namespaced Snapshot Refs
   - Entry Locators
   - branch `/` to `---` encoding
   - branch names containing `---` rejected
   - malformed ref parsing skipped/rejected

2. Validation unit tests:
   - Entry Key allow/reject matrix
   - Namespace allow/reject matrix
   - branch allow/reject matrix
   - key-glob semantics including `*` matching `/`

3. Fake-driven gateway tests:
   - sibling-key preservation
   - linear Snapshot history
   - delete last key leaves empty Snapshot
   - copy conflict atomicity
   - snapshot-level copy reuses source commit/ref target behavior where real Git can prove it

4. Scenario tests:
   - all operations in human and JSON mode where public envelopes exist
   - exit code assertions, especially `check` `0/1/2`
   - detached HEAD when branch omitted
   - Base Namespace aliases and `--base` conflict rules
   - export preflight and dry-run behavior
   - resolve-prompt project/global/failure behavior

5. Cross-language parity probes in a throwaway real Git repo:
   - Python writes, TypeScript reads/lists/checks.
   - TypeScript writes, Python reads/lists/checks.
   - Base Namespace and named Namespace.
   - Nested Entry Keys.
   - Historical `--at` lookup.
   - Copy and delete Snapshot behavior.

## Open compatibility decisions surfaced by the inventory

These are not blockers for beginning the TS package shape, but they should be decided before cutover:

- Whether JSON field order and human prose must be byte-for-byte identical or only structurally compatible. Recommendation: structural JSON compatibility with stable field names; preserve human prose initially unless a test is clearly incidental.
- Whether commit messages are durable. Recommendation: classify most as incidental, but preserve messages currently asserted by real-gateway tests until tests are consciously updated.
- Whether `put` default-source-file inference from key basename remains public. Recommendation: preserve because it is scenario-tested and present in CLI behavior.
- Whether `get_entry_updated_at` is part of the public reusable library contract for TS. Recommendation: keep if any sibling consumers need it; otherwise treat as library-internal but cheap to preserve.
- Whether `--runtime` should remain available and what it should print after cutover. Recommendation: preserve the option but update runtime metadata to TypeScript in wrapper/distribution work.
