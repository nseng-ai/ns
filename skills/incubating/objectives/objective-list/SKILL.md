---
name: objective-list
disable-model-invocation: true
description: "List open Objective records from .ns/objectives by slug and lifecycle (open or blocked). Use when the user asks which Objectives are active or available."
---

# objective-list

List the direct open Objective records in the current checkout. Read the `objective` umbrella skill first for the shared storage model and Record Frontmatter semantics.

## Capability adaptation

The portable workflow below is complete and does not require `ns` or any Objective CLI.

Before using an optional enhancement, look before use by probing the exact operation, not merely the `ns` executable. For this skill, a successful `ns objective list --help` probe permits `ns objective list --format md`. If that exact probe is unavailable, fails, or cannot be performed safely, use the portable workflow without warning that ordinary portable behavior is degraded. Do not infer this capability from another `ns objective` operation.

The enhanced command may show richer checkout facts. Preserve its output rather than claiming those facts came from the portable workflow.

## Portable workflow

Run `node <this-skill-directory>/scripts/list-objectives.mjs` from the repository working directory. Resolve `<this-skill-directory>` from the installed skill location supplied by the harness; do not assume a repository checkout path. The script uses only Node and filesystem records—never `ns` or an Objective package.

Its contract is:

1. Resolve the Objective root as `.ns/objectives/` in the current working tree. If it is absent, report that no Objective records exist and stop.
2. Inspect only direct child directories of that root. A child is a record only when it contains a direct `objective.md` file. Do not recurse to discover records.
3. Exclude a record when that same direct child contains `closed.md`. A nested file such as `updates/closed.md` is not a Closure Marker.
4. Read the optional Record Frontmatter at the beginning of each remaining `objective.md`. Label the record `blocked` when it has a non-empty `blocked:` sentence; otherwise label it `open`. Do not validate the rest of the record or infer blockage from prose, edges, branches, or files.
5. Sort by slug and render one line per record as `<slug> — open` or `<slug> — blocked`. If no open records remain, report that no open Objectives exist.

## Boundaries

Portable output contains only direct open record slugs and `open`/`blocked` labels. Do not add titles, summaries, update recency, dirty state, branch attribution, Git-aware freshness, edge detail, or closed records. Those are enhancement facts, not portable guarantees.

This skill is read-only. Do not create, repair, update, or close Objective records while listing them.

## Verify

- Every reported slug is a direct record directory with `objective.md` and without a direct `closed.md`.
- Every label comes only from the record's Blocked Sentence presence.
- Output is slug-sorted and contains no rich enhancement-only fields.
- No files changed.
