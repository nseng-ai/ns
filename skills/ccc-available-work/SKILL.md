---
name: ccc-available-work
description: "Use when the user asks what branch or Objective work can be continued right now, which branches are available because no cmux workspace/tab is open, or which live Objectives/branches are not already active in cmux. Produces a read-only continuation recommendation from cmux, Git/Graphite, Objective, PR, and diff evidence."
metadata:
  internal: true
---

# ccc-available-work

Answer: “what branches and Objectives can I continue to work on right now?” Produce a Graphite-stack-oriented continuation map: preserve stack shape where Graphite evidence exists, then annotate each row with availability, cmux occupancy, Objective links, PR state, and recommended next work.

## Default posture

This skill is observational and read-only. Collect evidence, rank candidates, and report availability. Do not mutate live state while using this skill.

Do not:

- rename, focus, close, or otherwise mutate cmux workspaces or surfaces;
- send text or keys to cmux panes;
- create, delete, clean, check out, rebase, restack, submit, land, or otherwise mutate Git or Graphite state;
- edit Objective records, Branch Memory, handoffs, branch-context attachments, or local files;
- call GitHub mutation commands.

If the user asks for cleanup or continuation after the report, treat that as a separate follow-up task with the appropriate skill.

## Mental model

Work in two layers:

1. **Collect and audit candidates.** Build separate branch candidates and Objective candidates from cmux, local Git branches, current-stack Graphite facts, Objective records, and selected PR/diff evidence.
2. **Filter and present availability.** Use cmux occupancy and cited branch↔Objective links to decide what is already open, then use LLM judgment to rank the remaining work.
3. **Render stack-first.** When Graphite facts exist, organize branch candidates by stack shape first. Availability sections are annotations on the stack, not the primary structure. Put off-stack local branches and Objective-only candidates after the stack view.

Branches and Objectives are separate candidate types. Link them only when you have evidence, and record the source and confidence for each link.

## Data sources

Use a quick pass first, then deepen only where relevance is ambiguous or the shortlist needs support.

1. `cmux tree --all --json` for windows, workspaces, surfaces/tabs, active workspace, and caller workspace facts.
2. For each window from the tree, `cmux workspace list --window <window-ref> --json` for workspace metadata and `current_directory`.
3. For each workspace `current_directory` that exists, inspect the checked-out branch and dirty state:

   ```bash
   git -C <cwd> symbolic-ref --short HEAD || git -C <cwd> rev-parse --short HEAD
   git -C <cwd> status --porcelain
   ```

   Display detached workspaces as `DETACHED@<short-sha>`.

4. Determine trunk for local branch filtering. Prefer:

   ```bash
   gt trunk
   ```

   If unavailable, use:

   ```bash
   git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##'
   ```

   If that is unavailable, fall back to local `main` or `master` when present. Exclude trunk only in presentation; keep it available as the comparison base for logs/diffs.

5. Inventory local branches newest first:

   ```bash
   git for-each-ref --sort=-committerdate --format='%(refname:short)%09%(objectname:short)%09%(committerdate:iso8601)%09%(upstream:short)' refs/heads
   ```

6. Enrich with structured Graphite facts only where available. In v1, Graphite evidence is current-stack/worktree-scoped: run this from the current checkout and from open cmux worktree directories when useful:

   ```bash
   asdl slot gt exec stack-branches --format json
   ```

   Do not claim complete Graphite topology for every local branch unless a future deterministic helper provides it. Never parse `gt ls`, `gt log`, or other human-facing Graphite display output for machine facts. If Graphite evidence is unavailable, say so.

7. Read open Active Objectives:

   ```bash
   objective list --format json
   ```

   Use `data.records[].updated_branches` as deterministic branch↔Objective evidence.

8. When Objective JSON is insufficient for semantic linking, read selected Objective prose:

   ```bash
   objective exec read-objective <slug> --format md
   ```

   Use this only for read-only evidence; do not edit Objective files.

9. For top candidates or ambiguous branches, optionally inspect targeted PR/diff evidence:

   ```bash
   gh pr list --head <branch> --state all --json number,state,title,url,isDraft,updatedAt,closedAt,mergedAt
   git log --oneline <trunk>..<branch>
   git diff --stat <trunk>...<branch>
   ```

   Avoid running expensive PR/diff inspection across every branch unless the quick pass is inadequate.

## Candidate model

Create branch candidates from local branch inventory. Annotate each branch with:

- cmux occupancy: open workspace refs, cwd, active/caller status, dirty state;
- local Git recency and upstream;
- Graphite evidence when available, with its scope;
- optional PR/diff evidence for relevance;
- linked Objective slugs, evidence source, and confidence.

Create Objective candidates from open Active Objective records. Annotate each Objective with:

- slug and status;
- `updated_branches` evidence;
- any semantic branch links inferred from Objective prose or branch/PR/diff context;
- whether an authoritative linked branch is already open.

LLM-inferred branch↔Objective links may affect Objective availability, but each inferred link must cite evidence and confidence. Good confidence labels are `high`, `medium`, and `low`. Prefer `low` when evidence is only naming similarity.

Branch-context and Branch Memory attachment inspection is future work, not required for v1. Do not read or mutate Branch Memory as part of this skill unless a future revision explicitly adds a read-only attachment source.

## Availability rules

A branch is **already open** when any open cmux workspace has an existing `current_directory` whose Git HEAD is that branch. Workspace title and description labels are useful hints but are not authoritative occupancy evidence.

An Objective is **already open** when an already-open branch is authoritatively linked to it. Authoritative links include deterministic `updated_branches` matches and evidence-cited LLM-inferred links with enough confidence to affect availability.

If occupancy evidence is incomplete, keep the candidate visible and mark it uncertain rather than suppressing it.

## Relevance rules

Use LLM judgment over branch names, Objective prose, PR state, commit logs, and diffs to label relevance. Relevance ranks candidates; it does not hide branch candidates.

Suggested branch relevance labels:

- `live` — likely continuable now;
- `blocked_or_needs_restack` — meaningful work exists but continuation likely needs prerequisite cleanup;
- `probably_stale` — old or low-confidence work that may still be useful;
- `superseded` — evidence suggests another branch/Objective replaced it;
- `unknown` — not enough evidence.

Put stale, superseded, blocked, or low-confidence branches in `Available but stale/uncertain` rather than omitting them. Already-open branches go in `Already open elsewhere` even if they are relevant.

## Output template

Default to a Graphite-stack-oriented report. Lead with a compact recommendation line, then show a stack-shaped table for every Graphite stack where you have structured evidence. Keep the user's eye on branch order and dependency shape; do not force them to reconstruct the stack from four separate lists.

Use section labels as row annotations:

- `READY` — best continuation target now;
- `OPEN` — already open in cmux;
- `BLOCKED` — meaningful but likely needs restack/review/other prerequisite;
- `STALE` — merged, superseded, or probably old;
- `UNKNOWN` — insufficient evidence.

```text
Recommended now: <branch> (<why this row is the next useful continuation>)

Graphite stacks
TOPO      | BRANCH        | STATE   | CMUX        | PR        | OBJECTIVE              | WHY
----------+---------------+---------+-------------+-----------+------------------------+-----------------------------
◯         | parent        | BLOCKED |             | #123 open | objective-slug         | needs downstack review
│ ◉       | child         | OPEN    | ◎ ws57 clean| #124 open | objective-slug         | current session
│ │ ●     | next-child    | READY   |             | #125 open | objective-slug         | available, latest actionable PR
◯─┴─┴─┘   | master        | TRUNK   | ws60 clean  |           |                        |

Off-stack available branches
- <branch> — <READY|BLOCKED|STALE|UNKNOWN>; confidence <...>; evidence: <terse cited evidence>

Objective-only candidates
- <objective slug> — no available linked branch found; confidence <...>; evidence: <objective status/prose/updated_branches evidence>

Already-open workspaces not represented above
- <branch or DETACHED@sha> — <workspace refs/cwds>; <active/caller/dirty notes>
```

For stack rows, include branch name, state, cmux occupancy, PR state, linked Objective, confidence/evidence in `WHY`, and enough topology glyphs to make parent/child order obvious. If a complete stack shape is unavailable, still group known current/open-worktree stack branches together and clearly label the stack as partial. If Graphite evidence is entirely unavailable, fall back to the same sections without topology and say why.

Do not hide candidates only because they are stale or already open. Stale and open rows stay visible in stack order; row state tells the user why they are not recommended.

## Read-only command recipe

Use this as the normal collection sequence:

```bash
cmux tree --all --json
```

For each returned window:

```bash
cmux workspace list --window <window-ref> --json
```

For each existing workspace directory:

```bash
git -C <cwd> symbolic-ref --short HEAD || git -C <cwd> rev-parse --short HEAD
git -C <cwd> status --porcelain
```

From the current repo checkout:

```bash
gt trunk || true
git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##' || true
git for-each-ref --sort=-committerdate --format='%(refname:short)%09%(objectname:short)%09%(committerdate:iso8601)%09%(upstream:short)' refs/heads
objective list --format json
```

When useful from current or open worktree directories:

```bash
asdl slot gt exec stack-branches --format json
```

For selected Objectives or shortlist branches only:

```bash
objective exec read-objective <slug> --format md
gh pr list --head <branch> --state all --json number,state,title,url,isDraft,updatedAt,closedAt,mergedAt
git log --oneline <trunk>..<branch>
git diff --stat <trunk>...<branch>
```

## Future CCC exec helper boundary

If repeated use makes this workflow token-heavy, slow, or brittle, push deterministic evidence collection into a read-only CCC `exec` helper under the private CCC orchestration layer, for example in `ts/packages/ccc`. That helper should return a compact manifest of cmux workspace facts, branch facts, Objective records, Graphite evidence scope, and evidence locators. The skill should then consume that manifest and perform the LLM judgment and presentation.

Do not implement that helper as part of this v1 skill-only workflow.
