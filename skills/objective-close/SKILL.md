---
name: objective-close
disable-model-invocation: true
description: "Close an existing Objective without deleting its checked-in history — record a ## Closure in objective.md and write the closed marker. Use for explicit close intent: 'close this objective', 'mark the objective done', 'abandon this objective'. To record progress short of closing, or to let closure happen automatically when completion criteria are clearly met, use objective-update instead."
---

# objective-close

Close an Objective without deleting its checked-in history.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step remains self-contained for its own happy path.

## Required shape

Active root: `.sdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; add `## Closure` when closing.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: minimal Closure Marker; existence means closed.

Objective records are Markdown; read and edit Markdown directly. Use `sdl objective exec` for deterministic read mechanics (candidate listing, file inventory, closed-marker detection). Mutation remains direct.

The Objective slug directory is durable identity. Closing an Objective keeps the existing directory in place; command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.sdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `sdl objective list --minimal --format md` to enumerate active checkout-local open candidates and ask the user to choose.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Run `sdl objective exec read-objective <slug> --format md` to load the selected record's raw Markdown and closed state.
2. If already closed, stop unless the user explicitly asks to amend closure context.
3. Confirm the closure outcome is clear: completed or intentionally abandoned, with concise evidence or rationale.
4. Add or update `## Closure` in `objective.md` with outcome, key evidence, remaining assumptions or risks, caveats, and follow-ups if any.
5. When material PR evidence supports the completed or abandoned outcome, summarize it in `## Closure` with PR numbers and Objective impact. Use the shared Objective PR evidence bullet convention when a list is clearer than prose:

   ```markdown
   - PR #123: <short summary/title> — <Objective impact>
   ```

   Closure PR evidence is not a broad PR ledger and should not trigger historical backfill. Use `merged` wording only when merge state has been confirmed by PR evidence; otherwise use status-aware wording such as current PR, open PR, draft PR, or PR evidence.
6. If the Objective has an `orientation.md`, consult `roadmap.md`'s completion section and the durable `Direction`/`Getting to` lines of `orientation.md`. If a durable rule should survive the initiative, note it in `## Closure` (or to the user) as a candidate to graduate into AGENTS.md "Architecture rules". Do not delete `orientation.md`: writing `closed.md` drops it from the always-load set automatically.
7. Write `closed.md` as a minimal Closure Marker. Put closure meaning in `objective.md`, not in `closed.md`.
8. Leave `.sdl/objectives/<slug>/` in place. Do not archive as part of close, delete the record, or implement a reopen workflow. If the user explicitly wants retirement from active discovery, use `sdl objective archive <slug>` after or instead of closure, depending on intent.

## Closure timing

Closure does not have to wait for the closing work to land on the trunk branch. When the same branch and PR that finishes the Objective also writes `## Closure` and `closed.md`, the merge of that PR is the closure event on the trunk. Couple Objective tracking with the work that triggered it: prefer closing on the branch that ships the final work over carrying closure to a follow-up PR.

Do not create a duplicate Semantic Update solely for closure. Create one only when closure introduces distinct semantic information beyond the normal update guidance.

## Stop / ask

- Objective selection is ambiguous or absent.
- Required Objective files are missing.
- The closure outcome or rationale is unclear.
- The Objective is already closed and the user did not ask to amend closure context.
- The user asks to delete, move, or reopen the Objective as part of close. If they explicitly want retirement from active discovery, redirect to `sdl objective archive <slug>` after or instead of closure, depending on intent.

## Verify

- Confirm `objective.md` contains `## Closure`.
- Confirm `closed.md` exists under the selected Objective directory.
- Confirm the Objective directory remains under `.sdl/objectives/<slug>/`.
- If an `orientation.md` was present, confirm it was left in place (not deleted) and any durable-rule graduation candidate was noted.
- Summarize the closure outcome and note that closed Objectives are no longer eligible for `objective-next` by default.
