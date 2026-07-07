---
name: objective-retro
disable-model-invocation: true
description: "Use when asked for an Objective retro/retrospective, post-merge or closed-Objective review of delivered scope, Objective archaeology, or reconstructing an Objective's delivered PR/commit set for downstream review (formerly objective-review-briefing). Two phases: reconstruct the delivered unit of work into a review-agnostic Branch Memory basis, then write a source-backed retrospective with findings and recommendations. Read-only on Objective records. For a branch/session retro use branch-retro."
metadata:
  internal: true
---

# objective-retro

Run a retrospective over one ns Objective's delivered unit of work, in two phases:

1. **Evidence** — reconstruct the delivered PR/commit set and store a durable, review-agnostic basis in Branch Memory. The basis stands alone: any downstream review prompt or skill can consume it, and a user may ask for the basis only.
2. **Judgment** — write a source-backed retrospective over that basis: findings, lessons, and actionable recommendations, aligned with `branch-retro`'s findings/recommendations shape.

This is part of the Objective skill family. Use the `objective` umbrella for shared Objective vocabulary and selection rules when needed.

## Boundaries

- **Read-only on Objective records.** Read `.ns/objectives/<slug>/`; never edit, create, move, delete, close, or update Objective files.
- **No formal tooling changes.** Do not add `ns objective exec` operations, TypeScript, Graphite/GitHub gateways, or package code.
- **No reviews/handoff coupling.** Do not store in reviews or handoff namespaces and do not depend on their retention, runner, diff cap, review log, or artifact formats.
- **Basis stays review-agnostic.** The evidence-phase basis carries no quality claims, risk ratings, or recommendations; judgment lives only in the separate retro artifact. Neither artifact is an approval gate or merge gate.
- **Advisory archaeology.** Post-merge git rarely preserves an Objective boundary. Report confidence and gaps instead of fabricating completeness.

Stop if the user asks this workflow to mutate Objective records, become a handoff artifact, depend on reviews, or add first-class CLI/tooling. If the delivered PR/commit set cannot be reconstructed with reasonable confidence, still produce a low-confidence basis with explicit gaps unless the user asked for an exact-only result.

## Storage contract

Use Branch Memory in the objective-owned namespace:

```text
namespace: objective-retro
basis key:  basis/<slug>/<YYYYMMDD-HHMMSSZ>.md
digest key: digest/<slug>/<YYYYMMDD-HHMMSSZ>.md  # only when a digest is produced
retro key:  retro/<slug>/<YYYYMMDD-HHMMSSZ>.md   # the judgment artifact
```

(The retired `objective-review` namespace holds historical bases written before this skill's rename from `objective-review-briefing`; read it when looking for old artifacts, never write to it.)

Branch Memory is branch-scoped; record the branch in the report and artifact. Default to the current branch unless the user explicitly names a storage branch. Use `brmem check` before `brmem put`; never overwrite an existing key unless the user explicitly requests replacement. Nested keys are valid for brmem.

Do not store full diff bytes in brmem. The durable basis stores the reconstruction spec: Objective identity, delivering PRs, trunk commits, file union, materialization commands, confidence, and caveats. Full diffs are materialized on demand from PRs/commits.

## Workflow

### 1. Select exactly one Objective

Require an explicit Objective slug or a path under `.ns/objectives/<slug>/`. If none is explicit, run:

```bash
ns objective list --format md
```

Ask the user to choose. Never infer the Objective from branch name, PR, changed files, or hidden attachment metadata.

### 2. Read Objective evidence

Read the selected record before looking at repository history:

```bash
ns objective exec read-objective <slug>
```

Then inspect the relevant Markdown directly, including:

- `objective.md` title, thesis, scope, completion criteria, and `## Closure` if present.
- `roadmap.md` if present.
- recent `updates/*.md`, especially Semantic Updates with PR evidence.
- `closed.md` presence for closure state.

Extract recorded PR evidence (for example `- PR #123: ...`) and closure PR spine as **entry points**, not ground truth.

### 3. Reconstruct the delivered unit of work

Determine the checkout's trunk branch with local repo evidence. Prefer the repository's configured/default trunk; if unclear, inspect `git branch -a` and ask rather than guessing.

Primary starting signal: trunk commits that touched the Objective directory:

```bash
git log --oneline <trunk> -- .ns/objectives/<slug>/
```

If the record was deleted from the active checkout, inspect git history for `.ns/objectives/<slug>/` rather than using an Objective-specific archive path.

Resolve each candidate commit to associated PRs with `gh`. Useful commands include:

```bash
gh pr list --state all --search <sha> --json number,title,state,mergedAt,url,headRefName
# or, when commit association is needed:
gh api repos/:owner/:repo/commits/<sha>/pulls \
  -H "Accept: application/vnd.github+json" \
  --jq '.[] | {number, title, state, merged_at, html_url}'
```

Cross-check three signals:

1. PRs recorded in Objective Markdown.
2. PRs associated with Objective-dir-touching trunk commits.
3. Commits/files inside those PRs that did **not** touch the Objective directory.

Report both-directional gaps:

- code/core commits in an Objective PR that do not touch `.ns/objectives/<slug>/`;
- `[cp]` or checkpoint commits that may be related but low-signal;
- non-objective interlopers that touch the same files;
- recorded PR evidence missing from git/gh history;
- git/gh-associated PRs missing from recorded Objective evidence.

### 4. Build the durable basis

Use the default materialization strategy: **per-PR diffs of the delivering PR set**. This is drift-safe because each PR diff is anchored to its merge-time base and avoids later live-file drift.

For each delivering PR, collect enough review-agnostic facts for the briefing:

```bash
gh pr view <number> --json number,title,state,mergedAt,url,headRefName,baseRefName,mergeCommit
# file list for file union
gh pr diff <number> --name-only
# on-demand full patch command for future reviewers
gh pr diff <number> --patch
```

For commit evidence and file union, use trunk shas and PR diffs:

```bash
git show --name-only --format= <sha>
git show --stat --oneline <sha>
```

Do not review live file contents as the primary basis. Live-file state is a documented alternate only; it is fast but drift-contaminated.

### 5. Decide whether to produce a structural digest

Use a producer-owned cutoff, independent of any review consumer. Default cutoff:

```text
Produce a digest when the temporary materialized per-PR patches exceed either
750 KiB total or 20,000 patch lines total.
```

It is okay to materialize patches under a temp directory to measure size; do not store patch bytes in brmem. If above cutoff, write a neutral digest under `digest/<slug>/<timestamp>.md` with per-PR/per-file paths, approximate patch sizes, and obvious touched areas/symbols. Keep it judgment-free: no quality claims, risk ratings, recommendations, or lens-specific summaries.

Below the cutoff, the basis can point reviewers directly at the per-PR materialization commands without a digest.

### 6. Write the basis artifact

Create a Markdown briefing with this shape:

````markdown
# Objective Retro Basis: <slug>

## Objective

- Slug: <slug>
- Title: <title>
- Closure state: <open|closed|deleted|unknown>
- Source record: <path>
- Storage branch: <branch>

## Delivering PRs

- PR #<n>: <title> — <url> — Confidence: <high|medium|low>; Evidence: <why included>

## Commit Set

- <sha> <subject> — PR #<n or unknown> — Evidence: <objective-dir touch|recorded PR|other>

## File Union

- `<path>`

## Materialization Strategy

Default: per-PR diffs.

Reproduce:

```bash
gh pr diff <n> --patch > /tmp/objective-<slug>-pr-<n>.patch
```

Alternates and caveats:

- live-file-state: fast but drift-contaminated; do not use as primary post-merge evidence.
- commit-set-union: faithful to selected commits but fragile around checkpoint/noise commits and attribution gaps.

## Confidence / Gaps

- Overall confidence: <high|medium|low>
- <explicit gap or caveat>

## Structural Digest

- <none; below cutoff>
- or: `objective-review:digest/<slug>/<timestamp>.md`

## How to Review From This Basis

Materialize the per-PR diffs above, then apply any review lens. Treat this basis as the delivered-scope evidence, not as findings or approval.
````

Write with explicit branch and namespace:

```bash
brmem check "basis/<slug>/<timestamp>.md" --namespace objective-review --branch <branch> --format json
brmem put "basis/<slug>/<timestamp>.md" --namespace objective-review --branch <branch> --file <briefing.md> --format json
```

If a digest exists, check and put the digest key the same way.

### 7. Write the retrospective

Skip this phase only when the user explicitly asked for the basis alone.

Materialize the per-PR diffs from the basis and read them alongside the Objective record (thesis, scope, completion criteria, roadmap, Semantic Updates). Then write the retro artifact — source-backed judgment over the delivered unit:

```markdown
# Objective Retro: <slug>

## Basis

- `objective-retro:basis/<slug>/<timestamp>.md` — confidence: <high|medium|low>

## Findings

- <finding> — Evidence: <PR/commit/file/update citation>

## Scope vs thesis

- Delivered scope vs the Objective's thesis and completion criteria: what shipped, what drifted, what was dropped — with citations.
- Roadmap-vs-delivered gaps: rows claimed done without evidence, or delivered work no row covers.

## What went well / what dragged

- <observation tied to evidence: PR shape, slice sizing, rework, review friction, tracking hygiene>

## Recommendations

- <actionable recommendation, smallest useful change first>
```

Every finding and recommendation cites something read in the diffs, the Objective record, or PR evidence — a claim that could have been written without reading the basis does not count. No approval verdicts, no merge gates. Store it at the `retro/<slug>/<timestamp>.md` key with the same `brmem check` / `brmem put` discipline.

### 8. Report completion

Summarize:

- Objective slug/title/closure state.
- Branch Memory locator(s): namespace, keys (basis, digest if any, retro if written), branch, and Entry Locator/commit from `brmem put`.
- Reconstructed PR set and commit set.
- Materialization strategy and whether a digest was stored.
- Top findings and recommendations, or that the run was basis-only.
- Overall confidence and explicit gaps.
- Confirmation that Objective records were read-only.

## Manual sanity check

When changing this skill, dry-run the reconstruction against `branch-context-plans-extension`. A healthy run should reconstruct PRs #2112, #2114, #2119, #2120, #2136, and #2138, and explicitly mention known gaps such as a non-objective `checkBranchRefFormat` drift commit and `[cp]` checkpoint noise.
