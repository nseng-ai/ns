# `objective exec claim` specification

`objective exec claim` attaches one objective snapshot to a target branch. It either applies a resolved claim, returns a user selection, or reports that the claim is blocked. It never edits, merges, summarizes, implements work, or mutates canonical objective state.

## Interface

```bash
objective exec claim [SLUG] [--target BRANCH] [--from BRANCH] [--from-file PATH]
```

- `SLUG` is optional. If supplied as `<slug>/<file>`, only `<slug>` is used.
- `--target` chooses the destination branch; otherwise the current branch is used.
- `--from` chooses an explicit source branch.
- `--from-file` bootstraps `<slug>/body.md` from a local file.
- `--from` and `--from-file` are mutually exclusive.
- Any source flag requires an explicit `SLUG`.

The command supports Clinkr JSON output and an eager `--schema` response.

## Resolution

1. Resolve the trunk branch.
2. Resolve the target branch:
   - use `--target`, or
   - use the current branch;
   - fail if HEAD is detached or git branch lookup fails.
3. Reject trunk as a target.
4. Resolve the slug:
   - if `SLUG` was supplied, use it;
   - otherwise, inspect reachable ancestor branches carrying objective entries, ranked by `branch..HEAD` commit distance and then branch name;
   - use the first ancestor with objectives;
   - if that branch has one slug, choose it;
   - if it has multiple slugs, return `needs_selection`;
   - if no ancestor supplies a slug, repeat against canonical trunk objectives;
   - if none exist, return `blocked`.
5. Reject the claim if the target already carries any key under `<slug>/`.
6. Resolve the source mode.

Ancestor checks are relative to current `HEAD`, even when `--target` names another branch.

## Source modes

### Snapshot source

This is the normal claim path. It copies an existing `<slug>/*` snapshot verbatim from one of:

1. explicit `--from BRANCH`, when supplied;
2. the nearest reachable ancestor branch carrying `<slug>/body.md`;
3. canonical trunk, when no ancestor source exists.

If `--from BRANCH` is supplied, that branch must carry `<slug>/body.md` or the command returns `blocked`.

When resolving ancestor sources, candidates are ranked by `branch..HEAD` commit distance and then branch name. If the nearest distance has multiple branches, the command returns `needs_selection` instead of choosing.

### Bootstrap source

`--from-file PATH` is an escape hatch, not normal carry-forward. It requires an explicit slug and an existing regular file. The file is read as UTF-8 and written as `<slug>/body.md` only. No companion files are copied or synthesized.

Use this mode only when the caller explicitly supplies a local file to bootstrap a missing objective snapshot.

## Apply

Before writing, re-check that the target still lacks the slug.

For a snapshot source:

- re-check that the source still carries `<slug>/body.md`;
- copy all entries matching `<slug>/*` from source to target;
- do not overwrite existing target entries;
- report copied files by filename and brmem key.

For a bootstrap source:

- re-check that the file still exists and is readable;
- write it as `<slug>/body.md` only.

## Output

All zero-exit executions return schema `claim/v1` with one status:

- `claimed`: the snapshot was written.
  - Includes slug, target branch, source kind, source branch if any, source label, files carried, destination ref, and destination commit SHA.
- `needs_selection`: no mutation occurred.
  - Includes selection kind, prompt, and options.
  - Each option includes `label`, `value`, `description`, and complete `rerun_args`.
- `blocked`: no mutation occurred.
  - Includes a stable `reason` and explanatory `message`.

Human rendering prints only `message`.

## Hard failures

The command exits non-zero for invalid flags, invalid target state, git failures, and apply-time drift, including:

- `conflicting_source_flags`
- `source_flag_without_slug`
- `detached_head`
- `git_failed`
- `target_is_trunk`
- apply-time `target_collision`
- apply-time `source_missing_slug`
- apply-time `from_file_unreadable`

## Invariants

- Claim writes only to the target branch snapshot.
- Claim may read canonical state but never mutates it.
- Snapshot-source claim copies the whole `<slug>/*` snapshot verbatim.
- The only partial-write mode is explicit `--from-file`, which writes `body.md` only.
- Ambiguity is surfaced to the caller; the command does not auto-pick among multiple valid choices.
