---
name: objective-close
disable-model-invocation: true
description: "Close an existing Objective without deleting its checked-in history — record a ## Closure in objective.md and write the closed marker. Use for explicit close intent: 'close this objective', 'mark the objective done', 'abandon this objective', 'park/defer this objective', or an explicit user request to reopen a closed one. To record progress short of closing, or to let closure happen automatically when completion criteria are clearly met, use objective-update instead."
---

# objective-close

Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, safety boundaries, and family policy.

## Capability adaptation

The workflow below is complete without `ns` or any Objective CLI; the `objective` umbrella skill owns the exact-operation probe rule. This skill's mechanics:

- **Record read**: portable form — read the record's files directly and treat a direct `closed.md` as the closed marker. A successful `ns objective exec read-objective --help` probe permits `ns objective exec read-objective <slug> --format md`.
- **Edge walk**: portable form — the closing record's own `edges:` frontmatter is the complete counterpart list because edges are mirrored; for each entry, record-read the counterpart to collect its closed state, back-edge annotation, and full tracking. A successful `ns objective show --help` probe permits `ns objective show <slug> --format md --should-include-closed-edges` for the counterpart/annotation inventory (the flag is required: the default view hides edges whose counterpart is closed). Either form must surface every declared edge, including closed counterparts.
- **Frontmatter Verification**: the umbrella skill's rule — `ns objective check` when its probe succeeds, otherwise the portable edge inspection.

## Resolve the Objective

Resolve exactly one Objective per the umbrella skill's Selection rules; the umbrella also owns the storage model and required file shapes — this skill does not restate them. The closure-specific delta: closing adds `## Closure` to `objective.md` and writes `closed.md`, and keeps the existing slug directory in place. Objective records are Markdown; read and edit them directly, using enhanced operations only per Capability adaptation above.

## Workflow

1. Run the record read (Capability adaptation above) to load the selected record's raw Markdown and closed state.
2. If already closed, stop per Stop / ask.
3. Load every edge-connected Objective before authoring closure: run the edge walk to inventory counterpart states and both Edge Annotations — step 8 must assign a disposition, including `already closed`, to every declared edge. Read each active counterpart's `objective.md`, `roadmap.md`, and recent relevant updates; read `orientation.md` when present.
4. Confirm the closure outcome is clear: **completed**, **abandoned**, **deferred** (deliberately parked), or **superseded** (another record or landed reality took over), with concise evidence or rationale. Use these outcome words in the Closure Marker so closed records stay machine-legible. A deferred closure must include an explicit restart pointer in `## Closure`: which roadmap rows resume, what recorded evidence can be trusted as-is, and what must be re-baselined against the then-current tree. For an Umbrella Objective (see the `objective` skill's Objective patterns reference), also record cross-child lessons and synthesized closure evidence in the parent; open Subobjectives gate closure per Stop / ask.
5. Add or update `## Closure` in `objective.md` with outcome, key evidence, remaining assumptions or risks, caveats, and follow-ups if any. Also judge whether the record holds durable architecture facts — storage models, conventions, contracts, decided semantics — that no doc, README, or `CONTEXT.md` owns; if so, name the graduation candidates (fact → target doc) in `## Closure` rather than letting a closed record become the only home of load-bearing documentation.
6. When material PR evidence supports the completed or abandoned outcome, summarize it in `## Closure` with PR numbers and Objective impact, using the shared Objective PR evidence convention from the `objective` umbrella skill when a list is clearer than prose. Do not turn closure PR evidence into a broad PR ledger or historical backfill.
7. Re-judge the closing record's own Blocked Sentence. A closing record should not keep a live `blocked:` sentence; normally remove it as part of closure.
8. Propagate the closure through every Objective Edge. For each counterpart, use both Edge Annotations plus its full current record to assign and act on one disposition:
   - **`updated`.** Closure changes the active counterpart's durable meaning. Edit every affected surface needed to make its post-closure state true: clear or reword a Blocked Sentence; reword stale Edge Annotations on both endpoints; advance or complete synthesis/dependency rows in `roadmap.md`; update assumptions, risks, open questions, sequencing, or closure-adjacent narrative in `objective.md`; and re-derive `orientation.md` when the counterpart is orienting. Write a new Semantic Update under that counterpart when the event is a meaningful finding, completion event, plan change, risk change, or follow-up. Existing updates remain immutable.
   - **`unchanged`.** Closure has no durable effect on the active counterpart. Make no edits there and record a concise reason in the final report; an edge by itself does not justify churn.
   - **`already closed`.** Do not amend the counterpart unless the user explicitly requested it; report that no live tracking needed propagation.
     Common effects to look for are unblocking work, parent/Umbrella synthesis, dependency completion, changed sequencing, retired assumptions or risks, and newly exposed follow-up. Do not recursively close a counterpart as a side effect: if propagation leaves it closure-ready, report that and route it through a separate Objective Close.
9. Keep all Objective Edges in place unless closure itself proves an annotation's relationship is false; closure alone does not dissolve an edge. When only the relationship wording changed, reword both mirrored Edge Annotations rather than removing the edge.
10. Apply the umbrella skill's Frontmatter Verification after any Record Frontmatter edit. Fix every structural error before continuing.
11. If the closing Objective has an `orientation.md`, consult `roadmap.md`'s completion section and the durable `Direction`/`Getting to` lines of `orientation.md`. If a durable rule should survive the initiative, note it in `## Closure` (or to the user) as a candidate to graduate into AGENTS.md "Architecture rules". Do not delete `orientation.md`: writing `closed.md` drops it from the always-load set automatically.
12. Write `closed.md` as a minimal Closure Marker. Put closure meaning in `objective.md`, not in `closed.md`.
13. Leave `.ns/objectives/<slug>/` in place; deletion is source-controlled per the umbrella skill, never part of close. Reopening happens only on an explicit user request, as its own workflow (see Reopen below) — never as part of a close.

## Reopen

There is no routine reopen path: do not reopen to record progress, amend closure context, or because completion criteria later look unmet — those are `objective-update` or amend-closure conversations. On an **explicit user request** to reopen a closed Objective:

1. Delete `closed.md`.
2. Amend `## Closure` into a dated history rather than deleting it: keep the original closure text and append a `Reopened <date>:` line with the reason and what changed since closure.
3. Re-run the connected-Objective impact review in the reverse direction: restore or reword this record's `blocked:` sentence if a real gate exists, and re-judge every active counterpart whose frontmatter, narrative, roadmap, orientation, or Semantic Updates were affected by closure. Write new corrective Semantic Updates where reopening materially changes tracking; never amend the close-time updates.
4. If the record has an `orientation.md`, it rejoins the always-load set automatically once `closed.md` is gone; re-read it for staleness against the current tree before relying on it.
5. If the record closed as deferred with a restart pointer, start from that pointer and re-baseline whatever it marked as volatile.
6. Apply the umbrella skill's Frontmatter Verification after any frontmatter edit.

## Closure timing

Closure does not have to wait for the closing work to land on the trunk branch. When the same branch and PR that finishes the Objective also writes `## Closure` and `closed.md`, the merge of that PR is the closure event on the trunk. Couple Objective tracking with the work that triggered it: prefer closing on the branch that ships the final work over carrying closure to a follow-up PR.

Do not create a duplicate Semantic Update solely for closure. Create one only when closure introduces distinct semantic information beyond the normal update guidance.

## Stop / ask

- Objective selection is ambiguous or absent.
- Required Objective files are missing.
- The closure outcome or rationale is unclear.
- The record is an Umbrella Objective with Subobjectives still open that the user has not explicitly parked and synthesized.
- The Objective is already closed and the user did not ask to amend closure context.
- The user asks to delete or move the Objective as part of close; for removal from active checkout state, redirect per the Workflow's source-control deletion rule (step 9). A reopen folded into a close is also a stop: reopen is its own explicit user request handled by the Reopen section.

## Verify

- Confirm `objective.md` contains `## Closure`.
- Confirm `closed.md` exists under the selected Objective directory and its outcome uses the standard vocabulary (completed / abandoned / deferred / superseded, optionally qualified).
- For a deferred outcome, confirm `## Closure` carries an explicit restart pointer.
- Confirm the Objective directory remains under `.ns/objectives/<slug>/`.
- If an `orientation.md` was present, confirm it was left in place (not deleted) and any durable-rule graduation candidate was noted.
- If the closing record declared edges, confirm every counterpart received an explicit `updated`, `unchanged`, or `already closed` disposition based on both Edge Annotations and the counterpart's full current tracking — not only its Blocked Sentence.
- For each `updated` counterpart, confirm its durable files express the post-closure state, any warranted Semantic Update is new and counterpart-local, existing updates were not modified, and an orienting counterpart's `orientation.md` was re-derived when needed.
- Confirm no counterpart was recursively closed; report any counterpart now closure-ready.
- Confirm edges remain mirrored and were not removed merely because one endpoint closed.
- If any Record Frontmatter was edited, confirm Frontmatter Verification passed, naming which mechanic ran — `ns objective check` or the portable edge inspection.
- Summarize the closure outcome, connected-Objective dispositions and files changed, and note that closed Objectives are no longer eligible for `objective-next` by default.
