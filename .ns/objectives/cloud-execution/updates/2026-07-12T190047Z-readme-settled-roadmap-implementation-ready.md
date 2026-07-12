# README settled; roadmap reshaped implementation-ready

## Summary

The canonical README (`references/README-draft.md`) is settled: after three
grill passes on 2026-07-12 (decision trail in the
adopt-readme-driven-development update) it reads as coherent product
documentation of the in-harness dispatch experience with no silently
invented commitments, which is the readme-driven-development bar. Its three
remaining open questions stay visible in the README and are each owned by a
specific roadmap row: TUI command name / push notification (jobs-TUI row),
git-credential minting mechanism (credentials row), and nightly advancement
policy (durable-jobs row). The README remains the live contract during
implementation — row outcomes fold back into it; decisions never settle
elsewhere.

With the contract settled, this update reshapes the roadmap into an
implementation-ready form rather than spawning a separate implementation
Objective: this record was consolidated hours earlier as the single cloud
workstream, and its completion criteria already are the implementation, so
a second record would only re-fragment it.

What changed in the roadmap:

- The README-settling row is complete, with the open-question delegation
  recorded on the row.
- Every implementation row now cites the README sections it makes true —
  activating the drift mitigation `objective.md` already promised ("each
  implementation slice cites the README section it makes true").
- Dependency order is explicit: seam-design and credentials gate the steel
  thread; the plan/session/TUI/adapter/durable-jobs rows widen the thread
  after it lands.
- Rows are grounded in verified codebase facts: the capability package home
  is `ts/packages/capabilities/` with `flow` as the structural precedent
  (typed `exports["./ns-extension"]` descriptor, `./api`, per-command
  exports, `./pi/ns-extension` bridge, wrapper-skill parity metadata);
  `/ns:dispatch:session` builds on the existing handoffs capability
  (`ts/packages/capabilities/handoffs`, which already exports pickup/create
  command surfaces); plan references come from the existing plans capability
  (`ts/packages/capabilities/plans`).
- The seam-design row now explicitly owns two decisions the README exposes
  but does not settle: where the repo-level backend configuration lives,
  and the run-handle surface the jobs TUI queries for run state and logs.

Deliberately not added: `## Definition of Progress` / `## Runner Policy`
sections. The roadmap is now concrete enough for autonomous runner steps,
but durable execution permission is a separate user decision (concrete
roadmap rows alone do not imply it); the objective stays
planning/recommendation-first until the user opts in.

## Objective Impact

- `roadmap.md`: restructured as above — README row `[x]`, implementation
  rows sharpened with README citations, gating, and grounding; `## Parked`
  unchanged.
- `objective.md`: unchanged — scope, completion criteria, risks, and open
  questions all remain accurate.
- `orientation.md`: re-derived as a no-op — the direction, README-canonical
  rule, and what-you-see-now lines all still hold.

## Follow-Ups

- Next row: seam and capability design — package name/home, backend gateway
  contract (including the run-handle status surface), durable-jobs
  contract, command shapes, and the repo backend-configuration location,
  recorded in a `references/` seam-design note plus a Semantic Update.
- If the user wants this objective driven by `objective-autorun`, add
  `## Definition of Progress` and `## Runner Policy` first.
