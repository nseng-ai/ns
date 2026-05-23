---
name: objective-close
description: "Command: objective-close"
---

# objective-close

Close an Objective without deleting its checked-in history.

For shared vocabulary and system-wide rules, use the `objective` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; add `## Closure` when closing.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: minimal Closure Marker; existence means closed.

Objective records are Markdown; read and edit Markdown directly. Use `objective exec` for deterministic read mechanics (candidate listing, file inventory, closed-marker detection). Mutation remains direct.

The Objective slug directory is durable identity. Closing an Objective keeps the existing directory in place; command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective list --format md` to enumerate candidates and ask the user to choose.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Run `objective exec read-objective <slug> --format md` to load the selected record's raw Markdown and closed state.
2. If already closed, stop unless the user explicitly asks to amend closure context.
3. Confirm the closure outcome is clear: completed or intentionally abandoned, with concise evidence or rationale.
4. Add or update `## Closure` in `objective.md` with outcome, key evidence, remaining assumptions or risks, caveats, and follow-ups if any.
5. Write `closed.md` as a minimal Closure Marker. Put closure meaning in `objective.md`, not in `closed.md`.
6. Leave `.asdl/objectives/<slug>/` in place. Do not archive, delete, move, or implement a reopen workflow.

## Closure timing

Closure does not have to wait for the closing work to land on the trunk branch. When the same branch and PR that finishes the Objective also writes `## Closure` and `closed.md`, the merge of that PR is the closure event on the trunk. Couple Objective tracking with the work that triggered it: prefer closing on the branch that ships the final work over carrying closure to a follow-up PR.

## Stop / ask

- Objective selection is ambiguous or absent.
- Required Objective files are missing.
- The closure outcome or rationale is unclear.
- The Objective is already closed and the user did not ask to amend closure context.
- The user asks to delete, archive, move, or reopen the Objective.

## Verify

- Confirm `objective.md` contains `## Closure`.
- Confirm `closed.md` exists under the selected Objective directory.
- Confirm the Objective directory remains under `.asdl/objectives/<slug>/`.
- Summarize the closure outcome and note that closed Objectives are no longer eligible for `objective-next` by default.
