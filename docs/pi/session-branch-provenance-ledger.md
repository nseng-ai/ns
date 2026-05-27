# Session-Local Branch Provenance Ledger

## Status

Proposed design note. No implementation has been made yet.

## Context

`aretro exec collect-evidence` currently associates Pi sessions with a branch mostly through repository/worktree cwd evidence. That is deterministic, but it is not branch provenance: a worktree can be reused across many branches, and sessions in the same cwd may cover adjacent branch work.

Pi session files already support extension-owned custom entries. A project-local Pi extension can append structured metadata to the same JSONL file that `aretro` already parses, without changing Pi core and without injecting anything into the language-model context.

## Problem

Branch retrospectives need to answer a narrower question than "which sessions happened in this repository?":

> Which session activity is actually connected to the branch being retrospected?

The current cwd-based association is useful as a fallback, but it cannot distinguish:

- the target branch from previous branches in the same worktree;
- a resumed session that starts on one branch and later switches to another;
- detached HEAD work during restacks or conflict resolution;
- branch renames or branch deletion after the session was recorded;
- unrelated work in the same worktree path.

When retrospectives feed process or tooling recommendations, silently treating cwd evidence as branch evidence can produce noisy recommendations.

## Goals

- Record branch provenance as structured, source-local facts in Pi session JSONL files.
- Avoid Pi core changes.
- Avoid raw prompt, assistant text, command output, or shell transcript retention beyond what Pi already stores.
- Support sessions that span branch switches by storing multiple observations.
- Let `aretro` classify association confidence explicitly instead of promoting cwd evidence to branch evidence.
- Keep older sessions readable through fallback inference and warnings.

## Non-goals

- Do not make Python emit semantic retro recommendations. `aretro` should emit facts and confidence only.
- Do not depend on Graphite for generic branch association. Graphite may appear as corroborating evidence, but ordinary git facts should be sufficient.
- Do not require every repository to install this extension before `aretro` can run.
- Do not mutate Pi session headers or patch Pi core.

## Proposal

Create a Pi extension that appends a session-local branch provenance ledger entry whenever it observes a meaningful git branch/head state.

Use Pi's custom-entry API:

```ts
pi.appendEntry("asdl.branch_context", data);
```

Pi persists that as a JSONL entry similar to:

```json
{
  "type": "custom",
  "id": "...",
  "parentId": "...",
  "timestamp": "2026-05-26T16:28:29.900Z",
  "customType": "asdl.branch_context",
  "data": {
    "schemaVersion": 1,
    "trigger": "session_start",
    "observedAt": "2026-05-26T16:28:29.900Z",
    "cwd": "/repo",
    "repoRoot": "/repo",
    "gitCommonDir": "/repo/.git",
    "gitDir": "/repo/.git/worktrees/slot-09",
    "branch": "slot-free-cleanup-modes",
    "fullRef": "refs/heads/slot-free-cleanup-modes",
    "headOid": "abc123...",
    "detached": false
  }
}
```

The ledger entry is an observation, not a claim that the whole session belongs to that branch. A session can have zero, one, or many branch observations.

## Ledger data model

Recommended `data` fields:

| Field                 | Required | Meaning                                                            |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `schemaVersion`       | yes      | Version for parser compatibility. Start with `1`.                  |
| `trigger`             | yes      | Why the extension sampled state.                                   |
| `observedAt`          | yes      | ISO timestamp from the extension at observation time.              |
| `cwd`                 | yes      | Pi extension `ctx.cwd` at observation time.                        |
| `repoRoot`            | no       | `git rev-parse --show-toplevel`; absent outside git repos.         |
| `gitCommonDir`        | no       | `git rev-parse --git-common-dir`; identifies shared repo metadata. |
| `gitDir`              | no       | `git rev-parse --absolute-git-dir`; distinguishes worktrees.       |
| `branch`              | no       | Short checked-out branch name, or `null` when detached/unresolved. |
| `fullRef`             | no       | Full symbolic ref, e.g. `refs/heads/feature`.                      |
| `headOid`             | no       | Current `HEAD` object id when resolvable.                          |
| `detached`            | yes      | Whether HEAD is detached at observation time.                      |
| `sessionId`           | no       | Pi session id if exposed by `ctx.sessionManager`.                  |
| `previousSessionFile` | no       | Session replacement provenance from `session_start`, when present. |
| `observerVersion`     | no       | Extension implementation version for diagnostics.                  |

Avoid recording raw command text, command output, diffs, prompts, assistant text, or user-entered branch descriptions. Branch names, refs, OIDs, repo paths, and session ids are enough for provenance.

## Sampling strategy

Record a baseline observation on `session_start`.

Record additional observations around events likely to change git state:

- `turn_start` or `turn_end` as a cheap periodic safety net;
- `tool_call` before `bash` when the command looks branch-affecting;
- `tool_result` after `bash` when a branch-affecting command completed;
- `user_bash` before/after interactive shell commands;
- `session_shutdown` as a final state sample.

Append only when the state signature changes:

```text
repoRoot + gitDir + branch + fullRef + headOid + detached
```

This makes the ledger compact while still capturing branch switches, commits, resets, rebases, and detached-head transitions.

On extension reload or session resume, reconstruct the last observed signature from existing `asdl.branch_context` entries before appending a new observation. That prevents duplicate entries from repeated `/reload` or resume flows.

## Branch-affecting command hints

The extension does not need to parse command output. It can cheaply sample git state after commands whose text includes likely branch/head mutation operations, such as:

- `git switch`, `git checkout`, `git branch`, `git reset`, `git commit`, `git merge`, `git rebase`, `git cherry-pick`, `git revert`;
- `gt create`, `gt modify`, `gt restack`, `gt move`, `gt up`, `gt down`, `gt checkout`;
- repo-local commands known to create, free, or switch slots/worktrees.

For privacy, the command text should only be used in memory to decide whether to sample. It should not be stored in the ledger entry.

## `aretro` interpretation

The Pi JSONL parser should recognize:

```json
{"type": "custom", "customType": "asdl.branch_context", "data": {...}}
```

and normalize it into branch observation facts, for example:

```python
SessionBranchObservation(
    observed_at_iso="2026-05-26T16:28:29.900Z",
    source_ref=SessionSourceRef(...),
    cwd=Path("/repo"),
    repo_root=Path("/repo"),
    git_dir=Path("/repo/.git/worktrees/slot-09"),
    git_common_dir=Path("/repo/.git"),
    branch="slot-free-cleanup-modes",
    full_ref="refs/heads/slot-free-cleanup-modes",
    head_oid="abc123...",
    detached=False,
    trigger="session_start",
)
```

Then `aretro collect-evidence` can derive association confidence for a requested branch:

| Confidence                    | Meaning                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `session_branch_exact`        | Ledger observations for this repo/worktree all point to the target branch.                        |
| `session_branch_mixed`        | Ledger observations include the target branch and at least one other branch or detached interval. |
| `session_branch_other`        | Ledger observations exist for this repo/worktree, but none point to the target branch.            |
| `session_branch_detached`     | Relevant ledger observations are detached and cannot name the target branch.                      |
| `session_branch_absent`       | Session has no ledger observations; fall back to older evidence.                                  |
| `git_reflog_inferred`         | Branch was inferred from git reflog timestamps for historical sessions.                           |
| `session_log_branch_observed` | Branch was inferred from whitelisted git command output in the log.                               |
| `repo_cwd`                    | Existing cwd/repo association only; branch membership unverified.                                 |

The JSON envelope should surface top-level warnings when branch association is weak or mixed, for example:

```json
{
  "code": "branch_association_unverified",
  "message": "18 sessions matched by repo cwd only; branch membership was not verified."
}
```

For `session_branch_mixed`, `aretro` can either include the session with a warning or support a future strict mode that excludes mixed sessions by default.

## Branch intervals

Multiple observations let `aretro` reconstruct coarse intervals:

```text
10:00 branch=A head=111
10:30 branch=A head=222
10:45 branch=B head=333
11:15 branch=B head=444
```

This supports classifications such as:

- all observed intervals target branch: exact;
- some intervals target branch, some do not: mixed;
- no target intervals: other;
- detached intervals only: detached/ambiguous.

The first implementation can classify at session granularity. A later implementation can associate evidence items with intervals when message/tool timestamps are available.

## Privacy and safety

The ledger should only store git metadata and Pi session metadata already adjacent to the session file. Do not store:

- raw prompts;
- assistant prose;
- command output;
- shell command text;
- diffs or file contents;
- user-entered descriptions.

The extension should tolerate being outside a git repository by recording nothing or appending a minimal non-git observation only if useful for diagnostics.

## Placement in this repo

Start with a project-local Pi extension if the behavior is repo-specific:

```text
.pi/extensions/asdl-branch-context.ts
```

This ensures the extension is present in worktrees for this checkout and is discoverable after Pi session replacement. If the implementation becomes stable or needs tests/fakes, promote the durable logic to:

```text
ts/packages/pi-extensions/
```

and keep `.pi/extensions/asdl-branch-context.ts` as a thin discovery adapter.

If this should benefit all repositories, implement a global Pi extension or package later. `aretro` should still treat the ledger format generically once it exists.

## Tests and fixtures

Recommended parser/CLI fixtures:

1. no ledger entries: association remains cwd-only and warnings mention unverified branch association;
2. one ledger entry for target branch: `session_branch_exact`;
3. multiple ledger entries all target branch with different `headOid`: exact;
4. target branch then another branch: `session_branch_mixed`;
5. detached interval: detached or mixed depending on surrounding observations;
6. ledger for a different repo/worktree: ignored for the target query;
7. branch renamed after session: stored historical branch name remains evidence, `headOid` remains available for correlation;
8. malformed custom entry: parser warning, not command failure;
9. old sessions with whitelisted branch command output: log inference is lower confidence than ledger evidence;
10. historical sessions with reflog inference: lower confidence than ledger evidence and warning when ambiguous.

Scenario tests should assert the `collect-evidence --format json` contract: per-session association fields, warning codes, and absence of raw command output.

## Alternative approaches

### 1. Modify Pi core session header

Pi core could write branch/head metadata directly into the `session` header.

Pros:

- strongest startup provenance;
- no extension installation required;
- all future sessions get consistent metadata.

Cons:

- requires upstream/core changes;
- captures only startup state unless core also records branch changes;
- less useful for repo-specific semantics such as slot workflows;
- slower to iterate than a project-local extension.

This is attractive long-term, but it is not necessary for an MVP.

### 2. Infer branch from existing session log contents

`aretro` can parse whitelisted command/result pairs already in Pi logs, such as successful `git branch --show-current` or `git status --short --branch` commands.

Pros:

- works for some historical sessions;
- no extension or Pi changes;
- directly source-ref-backed.

Cons:

- only works when the agent happened to run branch-observing commands;
- requires careful command/output whitelisting;
- can prove observed branch state at one point, not necessarily the full session;
- branch names in command arguments may indicate topic or intent, not current branch.

This is a useful fallback below ledger evidence.

### 3. Infer branch from git reflog timestamps

`aretro` can reconstruct worktree branch intervals from HEAD reflog checkout entries and compare them to session timestamps.

Pros:

- helps with old sessions that lack ledger entries;
- can identify branch switch intervals even when the session log did not run branch queries;
- independent of model/tool behavior.

Cons:

- reflogs expire and are local mutable state;
- branch renames, deleted branches, detached HEADs, resets, and restacks are subtle;
- timestamps can be ambiguous for long-running sessions;
- worktree identity must be handled carefully.

This should be an inferred, warning-bearing fallback, not primary provenance.

### 4. Explicit session selection

Let users pass exact session ids/files or a session-set file to `aretro`.

Pros:

- precise when the user knows the target sessions;
- useful for ad hoc retros and debugging;
- avoids fragile inference.

Cons:

- does not solve automatic branch retros;
- burdens the user/agent with session discovery;
- still needs association confidence for mixed sessions.

This is a good escape hatch, not a replacement for provenance.

### 5. External sidecar metadata files

A wrapper or extension could write branch observations to a separate database or JSONL sidecar keyed by Pi session id.

Pros:

- no need to modify session JSONL parser immediately;
- can be shared across harnesses;
- can store richer indexes.

Cons:

- introduces sync and lifecycle failure modes;
- sidecars can be lost when sessions move or are copied;
- harder to source-ref evidence back to the session file;
- more privacy and cleanup surface.

Keeping provenance in the session file is simpler and more auditable.

### 6. Wrapper launcher around Pi

A shell wrapper could capture branch/head at process startup and export environment variables or write a sidecar.

Pros:

- simple for startup-only metadata;
- no Pi extension API dependency.

Cons:

- does not observe branch switches during a session;
- easy to bypass;
- poor integration with session resume/fork/reload;
- still needs sidecar or custom injection.

This is weaker than a Pi extension.

### 7. Git hooks

Git hooks could record branch/head changes whenever git operations occur.

Pros:

- observes real git mutations regardless of whether Pi caused them;
- useful outside Pi too.

Cons:

- hook installation is intrusive and repo-local;
- mapping hook events back to the active Pi session is hard;
- not all branch changes have convenient hooks;
- hooks increase contributor workflow risk.

This is too broad for the initial problem.

### 8. Keep cwd-only association with louder warnings

`aretro` can retain current behavior and simply warn when branch membership is unverified.

Pros:

- cheapest change;
- immediately reduces false confidence;
- preserves backward compatibility.

Cons:

- does not improve precision;
- retros remain noisy for reused worktrees;
- users still need manual interpretation.

This should be the minimum fallback behavior even if the ledger is implemented.

## Recommended phased plan

1. Add `aretro` warnings for cwd-only branch association so existing evidence is not overtrusted.
2. Add parser fixtures for `asdl.branch_context` custom entries and define normalized branch observation facts.
3. Implement a minimal project-local Pi extension that records `session_start` and `session_shutdown` observations with dedupe.
4. Extend sampling around branch-affecting bash/user-bash commands.
5. Teach `aretro collect-evidence` to classify `session_branch_exact`, `session_branch_mixed`, and `session_branch_other`.
6. Add lower-confidence fallbacks for whitelisted session-log inference and reflog inference.
7. Promote extension logic into `ts/packages/pi-extensions/` if it needs tests or reuse beyond this repo.

## Open questions

- Should `aretro` include `session_branch_other` sessions in JSON with warnings, or exclude them by default?
- Should strict mode be opt-in (`--association-mode strict`) or should branch retros eventually default to strict evidence?
- Should branch observations be exposed directly in `collect-evidence` JSON, or only summarized through `association`?
- How much of Pi's session tree should branch association respect in the first implementation?
- Should the ledger schema be named `asdl.branch_context` or a more harness-neutral name if other repos may adopt it?
