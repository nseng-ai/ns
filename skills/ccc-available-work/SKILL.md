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
3. **Render stack-first.** When Graphite facts exist, organize branch candidates by stack shape first. Render the left side as a `gt ls`-style tree derived from structured Graphite edges, then align minimal row facts to the right. Put off-stack local branches and Objective-only candidates after the stack view.

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

   Use `data.records[].updatedBranches` as deterministic branch↔Objective evidence.

8. When Objective JSON is insufficient for semantic linking, read selected Objective prose:

   ```bash
   objective exec read-objective <slug> --format md
   ```

   Use this only for read-only evidence; do not edit Objective files.

9. For top candidates or ambiguous branches, optionally inspect targeted PR/diff evidence:

   ```bash
   gh pr list --head <branch> --state all --json number,state,title,url,isDraft,updatedAt,closedAt,mergedAt,mergeStateStatus
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
- `updatedBranches` evidence;
- any semantic branch links inferred from Objective prose or branch/PR/diff context;
- whether an authoritative linked branch is already open.

LLM-inferred branch↔Objective links may affect Objective availability, but each inferred link must cite evidence and confidence. Good confidence labels are `high`, `medium`, and `low`. Prefer `low` when evidence is only naming similarity.

Branch-context and Branch Memory attachment inspection is future work, not required for v1. Do not read or mutate Branch Memory as part of this skill unless a future revision explicitly adds a read-only attachment source.

## Availability rules

A branch is `OPENED` when any open cmux workspace has an existing `current_directory` whose Git HEAD is that branch. Workspace title and description labels are useful hints but are not authoritative occupancy evidence.

An Objective is already open when an `OPENED` branch is authoritatively linked to it. Authoritative links include deterministic `updatedBranches` matches and evidence-cited LLM-inferred links with enough confidence to affect availability.

If occupancy evidence is incomplete, keep the candidate visible and mark it uncertain rather than suppressing it.

## Row states

Use this exclusive state set. Prefer a computable state over a judgment-heavy one.

- `TRUNK` — the trunk/base branch row.
- `OPENED` — this exact branch is checked out in an open cmux workspace. Occupancy is authoritative only from workspace `current_directory` Git HEAD, not workspace title/description.
- `READY` — the branch is available for local continuation now. This includes branches with known feedback or failing checks when the next action is local work.
- `NEEDS_RESTACK` — branch/PR evidence says the first local action is restack/update/conflict handling, such as PR `mergeStateStatus` `DIRTY` or explicit merge-conflict/rebase evidence.
- `STALE` — merged, superseded, empty/no-diff, or probably old.
- `UNKNOWN` — not enough evidence to classify.

Do not use `BLOCKED`, `WAITING`, `NEEDS_FIX`, or broad “not recommended” states. Put review/check details, if needed, in PR state or omit them; do not add a `WHY` column.

Relevance ranks candidates; it does not hide branch candidates. Stale, restack-needed, unknown, and already-open branches stay visible in stack order with one of the states above.

## Output template

Default to a Graphite-stack-oriented report. Lead with only the recommended branch name, then show a stack-shaped aligned plain-text block for every Graphite stack where you have structured evidence. Do not use Markdown pipe tables. Do not include a `WHY`, confidence, or evidence column in the main report.

The stack block has separate `TREE` and `BRANCH` columns so branch names start at one fixed column. The `TREE` column carries only topology glyphs and indentation. Use a `gt ls`-style shape derived from structured `stack-branches` edges; never parse human-facing `gt ls` output. A simple linear stack can use `◯`, `│ ◯`, `│ │ ◯`, etc.; use `◉` for rows whose state is `OPENED`.

```text
Recommended now
  <branch>

Graphite stacks

  TREE          BRANCH                                                   STATE          CMUX        PR       OBJECTIVE
  ◯             parent                                                   READY                     #123     objective-slug
  │ ◉           child                                                    OPENED         ws57 clean  #124     objective-slug
  │ │ ◯         next-child                                               READY                     #125     objective-slug
  ◯             master                                                   TRUNK          ws60

Off-stack branches

  STATE          BRANCH                                                   CMUX        PR       OBJECTIVE
  READY          available-branch                                         ws88 clean  #130     objective-slug
  NEEDS_RESTACK  merge-dirty-branch                                                   #131
  STALE          merged-or-empty-branch                                               #120
  UNKNOWN        insufficient-evidence-branch

Objective-only candidates

  OBJECTIVE                         STATUS
  objective-with-no-linked-branch   open

Already-open workspaces not represented above

  OPENED  DETACHED@abc1234  ws19 clean
```

Column alignment matters more than separators. Keep row text compact: branch name, state, cmux occupancy, PR number/state when known, and linked Objective slug when evidence supports it. If a complete stack shape is unavailable, still group known current/open-worktree stack branches together and clearly label the stack as partial. If Graphite evidence is entirely unavailable, fall back to the same aligned sections without topology and state that Graphite evidence was unavailable.

Do not hide candidates only because they are stale or already open. Stale and opened rows stay visible in stack order.

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
gh pr list --head <branch> --state all --json number,state,title,url,isDraft,updatedAt,closedAt,mergedAt,mergeStateStatus
git log --oneline <trunk>..<branch>
git diff --stat <trunk>...<branch>
```

## Future CCC exec helper boundary

If repeated use makes this workflow token-heavy, slow, or brittle, push deterministic evidence collection into a read-only CCC `exec` helper under the private CCC orchestration layer, for example in `ts/packages/ccc`. That helper should return a compact manifest of cmux workspace facts, branch facts, Objective records, Graphite evidence scope, and evidence locators. The skill should then consume that manifest and perform the LLM judgment and presentation.

Do not implement that helper as part of this v1 skill-only workflow.
