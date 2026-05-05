---
name: brmem
description: "Use when a task needs branch-scoped durable memory with the `brmem` CLI: storing, reading, listing, checking, deleting, or copying text context tied to a git branch, or resolving `.brmem/prompts/...` prompt plugins. Use whenever the user mentions brmem, branch memory, stashing plan/context on a branch, carrying objective/scratch state across sessions, or asks how an agent should call `brmem`."
allowed-tools:
  - "Bash(brmem *)"
  - "Bash(git *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# brmem

Use `brmem` as branch-scoped memory for agents: small UTF-8 text entries that
stay attached to a Git branch without becoming working-tree files, commits, PR
comments, or issues.

This skill is a CLI reference. Prefer higher-level skills when they match the
whole workflow. Use this skill directly when you need to inspect, write, copy,
delete, or explain branch memory.

## Mental model

- **Entry**: a small text blob stored under a key such as `plan.md` or
  `plans/table-filter.md`.
- **Namespace**: a tool-owned bucket such as `objectives`. Omit `--namespace`
  for ad-hoc base entries.
- **Branch snapshot**: the entries for one namespace on one branch. Commands
  default to the current branch unless you pass `--branch`.

`brmem` is durable and inspectable, not secret. Do not store credentials,
private tokens, binary assets, generated build output, or large datasets.

## Command chooser

| Goal                                     | Command                                                         | Writes? |
| ---------------------------------------- | --------------------------------------------------------------- | ------- |
| Store or update text                     | `brmem put <key> --file <path>`                                 | Yes     |
| Print one entry's content                | `brmem get <key>`                                               | No      |
| Probe one entry and get locator/size     | `brmem check <key>`                                             | No      |
| List entries on a branch                 | `brmem list`                                                    | No      |
| Remove one entry                         | `brmem delete <key>`                                            | Yes     |
| Copy namespaced entries between branches | `brmem copy --namespace <ns> --from-branch <a> --to-branch <b>` | Yes     |
| Resolve a repo/global prompt plugin      | `brmem exec resolve-prompt <name>`                              | No      |

Add `--namespace <ns>` to `put`, `get`, `check`, `delete`, or `list` for
namespaced entries. Omit it for base entries. `brmem copy` requires a namespace;
base entries are handled individually.

## Operating rules

1. **Be explicit about branches in automation.** If the task names a branch, pass
   `--branch <branch>` (or `--from-branch` / `--to-branch` for `copy`) instead
   of relying on the checkout. If no branch is provided, confirm the current Git
   branch before mutating memory.
2. **Choose the namespace deliberately.** Use base entries for ad-hoc scratch
   notes. Use a namespace for tool-owned state so unrelated workflows do not
   collide. Namespaces are single path segments: no `/`.
3. **Use simple keys.** Prefer POSIX-like relative paths such as
   `plans/add-cache.md` or `session/summary.md`. Avoid spaces and punctuation.
   Keys cannot be empty, start/end with `/`, contain `//`, contain `:`, contain a
   `..` segment, contain glob/ref metacharacters, or end a segment with `.lock`.
4. **Treat `put` as an overwrite.** If overwriting is not explicitly desired,
   preflight with `brmem check <key> ...`. Exit code `0` means present, `1`
   means absent, `2` means an invalid request or command failure.
5. **Keep entries textual and small.** `put` accepts UTF-8 text, rejects likely
   binary content, and caps entries at 1 MiB unless `--force` is supplied. Use
   `--force` only when the user explicitly accepts the storage cost/risk.
6. **Prefer JSON for machine parsing.** Add `--format json` when you need stable
   fields from `put`, `list`, `check`, `copy`, `delete`, or `resolve-prompt`.
   For `get`, the human output is intentionally just the stored content; use that
   when feeding the text directly into your workflow.
7. **Report mutations.** After `put`, `copy`, or `delete`, tell the user the
   branch, namespace/base, key(s), ref locator(s), and commit(s) printed by the
   CLI.

## Store an entry

1. Pick the branch, namespace/base, and key.
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

## Read branch memory

List first when you do not already know the key:

```text
brmem list --branch feature/add-cache --format json
brmem list --base --branch feature/add-cache
brmem list --namespace scratch --branch feature/add-cache --format json
```

Then read entries by key:

```text
brmem get plans/add-cache.md --branch feature/add-cache
brmem get plans/add-cache.md --namespace scratch --branch feature/add-cache
```

`get` prints only content in human mode. If a task asks you to load all branch
memory, list with JSON and then `get` every returned entry, preserving content
verbatim in your working context before summarizing it for the user.

Use `--at <treeish-or-snapshot-commit>` with `get` or `check` only when you need
a historical snapshot rather than the current branch memory.

## Check or inspect an entry

Use `check` to test existence or get the locator without printing the full text:

```text
brmem check plans/add-cache.md --branch feature/add-cache --format json
brmem check plans/add-cache.md --namespace scratch --branch feature/add-cache
```

Interpret exit codes carefully:

- `0`: entry exists; metadata is available.
- `1`: entry is absent; this is a normal negative result, useful before `put`.
- `2`: invalid namespace/key/branch, detached HEAD when branch was omitted, or
  another command failure.

## Copy namespaced memory between branches

Use `copy` when a namespaced tool record should travel from one branch snapshot
to another.

Preview first:

```text
brmem copy \
  --namespace objectives \
  --from-branch main \
  --to-branch feature/table-filter \
  --dry-run \
  --format json
```

Then perform the copy:

```text
brmem copy \
  --namespace objectives \
  --from-branch main \
  --to-branch feature/table-filter
```

Important details:

- Without `--key-glob`, the whole namespace snapshot is copied. If
  `--overwrite` is used, the destination namespace snapshot is replaced.
- With `--key-glob 'slug/*'`, only matching keys are copied and unrelated
  destination keys are preserved. In this CLI, `*` matches `/`, so `slug/*`
  covers nested keys too.
- Existing matching destination keys make `copy` abort unless `--overwrite` is
  supplied. Do not add `--overwrite` unless replacement is intentional.

## Delete an entry

Only delete one explicit entry the user or workflow has identified:

```text
brmem check stale-note.md --branch feature/add-cache
brmem delete stale-note.md --branch feature/add-cache
brmem delete stale-note.md --namespace scratch --branch feature/add-cache
```

After deletion, report the branch, namespace/base, key, ref, and commit.

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

For read-only work, summarize what you inspected and which entries were loaded.
For mutations, include:

```text
Branch: <branch>
Entry: <namespace-or-base>/<key>
Ref: <locator printed by brmem>
Commit: <commit printed by brmem>
```

If an operation aborted because an entry already exists, a key is invalid, the
branch is detached, or `copy` found conflicts, say exactly which CLI command was
run and quote the relevant error message.
