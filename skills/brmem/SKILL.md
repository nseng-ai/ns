---
name: brmem
description: "Use when a task needs branch-scoped durable memory with the `brmem` CLI: storing, reading, listing, checking, deleting, or copying text context tied to a git branch, or resolving `.brmem/prompts/...` prompt plugins. Use whenever the user mentions brmem, Branch Memory, stashing plan/context on a branch, carrying scratch state across sessions, or asks how an agent should call `brmem`."
allowed-tools:
  - "Bash(brmem *)"
  - "Bash(git *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# brmem

Use `brmem` as the Branch Memory System for agents: small UTF-8 Entries that
stay attached to a Git branch without becoming working-tree files, commits, PR
comments, or issues.

This skill is a CLI reference. Prefer higher-level skills when they match the
whole workflow. Use this skill directly when you need to inspect, write, copy,
delete, or explain Branch Memory.

## Mental model

- **Branch Memory**: Entries attached to one branch, either in the ad-hoc base
  area or in a Namespace.
- **Entry**: a small text blob stored under an Entry Key such as `plan.md` or
  `plans/table-filter.md`.
- **Entry Key**: the path-like name for an Entry within Branch Memory.
- **Namespace**: a tool-owned bucket such as `notes`. Omit `--namespace`
  for ad-hoc base Entries.

Commands default to the current branch unless you pass `--branch`.

`brmem` is durable and inspectable, not secret. Do not store credentials,
private tokens, binary assets, generated build output, or large datasets.

## Command chooser

| Goal                                     | Command                                                         | Writes? |
| ---------------------------------------- | --------------------------------------------------------------- | ------- |
| Store or update text                     | `brmem put <key> --file <path>`                                 | Yes     |
| Print one Entry's content                | `brmem get <key>`                                               | No      |
| Probe one Entry and get locator/size     | `brmem check <key>`                                             | No      |
| List Entries on a branch                 | `brmem list`                                                    | No      |
| Export Entries to files                  | `brmem export --output-dir <dir>`                               | Files   |
| Remove one Entry                         | `brmem delete <key>`                                            | Yes     |
| Copy namespaced Entries between branches | `brmem copy --namespace <ns> --from-branch <a> --to-branch <b>` | Yes     |
| Resolve a repo/global prompt plugin      | `brmem exec resolve-prompt <name>`                              | No      |

Add `--namespace <ns>` to `put`, `get`, `check`, `delete`, `list`, or `export`
for namespaced Entries. Omit it for base Entries. `brmem copy` requires a
Namespace; base Entries are handled individually.

## Operating rules

1. **Be explicit about branches in automation.** If the task names a branch, pass
   `--branch <branch>` (or `--from-branch` / `--to-branch` for `copy`) instead
   of relying on the checkout. If no branch is provided, confirm the current Git
   branch before mutating memory.
2. **Choose the Namespace deliberately.** Use base Entries for ad-hoc scratch
   notes. Use a Namespace for tool-owned state so unrelated workflows do not
   collide. Namespaces are single path segments: no `/`.
3. **Use simple Entry Keys.** Prefer POSIX-like relative paths such as
   `plans/add-cache.md` or `session/summary.md`. Avoid spaces and punctuation.
   Entry Keys cannot be empty, start/end with `/`, contain `//`, contain `:`,
   contain a `..` segment, contain glob/ref metacharacters, or end a segment
   with `.lock`.
4. **Treat `put` as an overwrite.** If overwriting is not explicitly desired,
   preflight with `brmem check <key> ...`. Exit code `0` means present, `1`
   means absent, `2` means an invalid request or command failure.
5. **Keep Entries textual and small.** `put` accepts UTF-8 text, rejects likely
   binary content, and caps Entries at 1 MiB unless `--force` is supplied. Use
   `--force` only when the user explicitly accepts the storage cost/risk.
6. **Prefer JSON for machine parsing.** Add `--format json` when you need stable
   fields from `put`, `list`, `check`, `export`, `copy`, `delete`, or
   `resolve-prompt`. For `get`, the human output is intentionally just the
   stored content; use that when feeding the text directly into your workflow.
7. **Report mutations.** After `put`, `copy`, or `delete`, tell the user the
   branch, Namespace/base, Entry Key(s), Entry locator(s), and commit(s)
   printed by the CLI.

## Store an Entry

1. Pick the Branch, Namespace/base area, and Entry Key.
2. If preserving existing content matters, run `check` first:

```text
brmem check plans/add-cache.md --branch feature/add-cache
brmem check plans/add-cache.md --namespace scratch --branch feature/add-cache
```

3. Store bytes from a file (preferred for agents):

```text
brmem put plans/add-cache.md --branch feature/add-cache --file /tmp/plan.md
brmem put plans/add-cache.md --namespace scratch --branch feature/add-cache --file /tmp/plan.md
```

Use `--stdin` only for interactive human-mode writes. Do not combine `--stdin`
with `--format json`.

## Read Branch Memory

List first when you do not already know the Entry Key:

```text
brmem list --branch feature/add-cache --format json
brmem list --base --branch feature/add-cache
brmem list --namespace scratch --branch feature/add-cache --format json
```

Then read Entries by Entry Key:

```text
brmem get plans/add-cache.md --branch feature/add-cache
brmem get plans/add-cache.md --namespace scratch --branch feature/add-cache
```

`get` prints only content in human mode. If a task asks you to load all Branch
Memory for a branch, list with JSON and then `get` every returned Entry,
preserving content verbatim in your working context before summarizing it for
the user.

Use `--at <treeish-or-commit>` with `get` or `check` only when you need a
historical Branch Memory version rather than the current Branch Memory.

## Export Branch Memory to files

Use `export` when a workflow needs Branch Memory materialized as ordinary UTF-8
files in a chosen directory:

```text
brmem export --branch feature/add-cache --output-dir /tmp/brmem-export
brmem export --namespace scratch --branch feature/add-cache --output-dir /tmp/scratch-export
```

Important details:

- Omitting `--namespace` exports **base Entries only**. It does not mean "all
  Namespaces."
- Each key becomes a relative path under `--output-dir`; for example,
  `notes/session.md` writes `<output-dir>/notes/session.md`.
- Export fails before writing if no Entries match, the output directory is not a
  directory, a target already exists, or a target path is unsafe. Pass
  `--overwrite` only when replacing existing files is intentional.
- Use `--dry-run` to see planned writes without creating directories or files.
- Add `--format json` when another tool needs the planned/exported paths and
  sizes.

## Check or inspect an Entry

Use `check` to test existence or get the locator without printing the full text:

```text
brmem check plans/add-cache.md --branch feature/add-cache --format json
brmem check plans/add-cache.md --namespace scratch --branch feature/add-cache
```

Interpret exit codes carefully:

- `0`: Entry exists; metadata is available.
- `1`: Entry is absent; this is a normal negative result, useful before `put`.
- `2`: invalid Namespace/Entry Key/Branch, detached HEAD when branch was
  omitted, or another command failure.

## Copy namespaced Branch Memory between branches

Use `copy` when namespaced Branch Memory should travel from one branch to
another.

Preview first:

```text
brmem copy \
  --namespace notes \
  --from-branch main \
  --to-branch feature/table-filter \
  --dry-run \
  --format json
```

Then perform the copy:

```text
brmem copy \
  --namespace notes \
  --from-branch main \
  --to-branch feature/table-filter
```

Important details:

- Without `--key-glob`, the whole Namespace is copied. If `--overwrite` is
  used, the destination Branch Memory for that Namespace is replaced.
- With `--key-glob 'slug/*'`, only matching Entry Keys are copied and unrelated
  destination Entries are preserved. In this CLI, `*` matches `/`, so `slug/*`
  covers nested Entry Keys too.
- Existing matching destination Entries make `copy` abort unless `--overwrite` is
  supplied. Do not add `--overwrite` unless replacement is intentional.

## Delete an Entry

Only delete one explicit Entry the user or workflow has identified:

```text
brmem check stale-note.md --branch feature/add-cache
brmem delete stale-note.md --branch feature/add-cache
brmem delete stale-note.md --namespace scratch --branch feature/add-cache
```

After deletion, report the Branch, Namespace/base, Entry Key, ref, and commit.

## Resolve prompt plugins

Some skills let a repo customize one narrow prompt file. Resolve those with:

```text
brmem exec resolve-prompt <prompt-name> --format json
```

The JSON result gives `data.path` and `data.tier` (`project` or `global`). Read
that file verbatim and follow the owning skill's rules for what the plugin is
allowed to decide. If resolution exits `2`, surface the CLI message and abort;
do not invent an inline fallback or create the prompt file unless the user asked
you to configure prompts.

## Good final summaries

For read-only work, summarize what you inspected and which Entries were loaded.
For mutations, include:

```text
Branch: <branch>
Entry: <namespace-or-base>/<key>
Ref: <locator printed by brmem>
Commit: <commit printed by brmem>
```

If an operation aborted because an Entry already exists, an Entry Key is
invalid, the branch is detached, or `copy` found conflicts, say exactly which
CLI command was run and quote the relevant error message.
