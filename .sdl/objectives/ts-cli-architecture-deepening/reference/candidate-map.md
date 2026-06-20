# Candidate map — roadmap nine ↔ raw findings

The roadmap in `../roadmap.md` carries nine curated candidates. The exploration produced 24 raw findings across five passes. This file maps the nine back to their findings and records which raw findings were *not* promoted, with why.

## Roadmap nine → finding IDs

| Roadmap # | Title                                   | Finding | Strength        |
| --------- | --------------------------------------- | ------- | --------------- |
| 1         | Collapse PR-description pipeline        | A1      | Strong          |
| 2         | `TextGenerationGateway` real seam       | A2      | Strong          |
| 3         | Collapse slot-dispatch                  | B1      | Strong          |
| 4         | Occupancy reconciler (slot inventory)   | C1      | Strong          |
| 5         | Graphite stack-navigator adapter        | C2      | Strong          |
| 6         | Branch Memory entry locator             | D1      | Strong          |
| 7         | Plan-attachment module (branch-context) | D2      | Worth exploring |
| 8         | Objective markdown validator            | D3      | Worth exploring |
| 9         | Lift diff parsing to core (watch-point) | E1      | Speculative     |

## Strong findings deliberately held off the roadmap nine

Kept off only to balance package variety / candidate count — all are legitimate and recorded in full in the findings files. Promote them as the nine are dispositioned.

- **B2 — autobranch dirty/latest-commit strategy** (ccc). Strong. Next ccc follow-up after #3. Note: the strategy seam becomes "real" (two-adapter rule) once a third autobranch variant exists.
- **C3 — NavigationGateway / pure result-building** (slot). Strong. Next slot follow-up after #4/#5.

## Worth-exploring / speculative findings not promoted

- **A3 — github-pr-feedback pagination leak** (asdl-core). Worth exploring.
- **A4 — submit.ts hidden state machine** (asdl-core). Worth exploring. Higher effort; correctness-sensitive (note the `restack_required` recheck gap at submit.ts ~393).
- **A5 — shallow `submit/format.ts`** (asdl-core). Speculative / hygiene only.
- **B3 — worktree-status composition** (ccc). Worth exploring.
- **B4 — landing operations** (ccc). Worth exploring.
- **C4 — SDL extension discovery / catalog builder** (sdl). Worth exploring.
- **C5 — sdlcc tab registry** (sdlcc). Worth exploring; forward-looking (real seam only when the extension-backed registry exists).
- **D4 — handoff identity parsing** (handoff). Worth exploring; weak deletion-test signal — consider folding into #6's locator work.
- **D5 — branch-context plan-content-slug duplication** (branch-context/plans). Worth exploring; narrow payoff.
- **E2 — aretro pure session parser** (aretro). Worth exploring.
- **E3 — roaster harness output parser + registry** (roaster). Worth exploring; incremental deepening of already-good code.
- **E4 — areg skill-kind mutation consolidation** (areg). Worth exploring; mostly future-proofing.
- **E5 — unify PR feedback/review models** (roaster/pr-address). Speculative; needs cross-package agreement on `CodeFinding`.

## If the open list grows

Per the objective's open-list rule, add new candidates to `## Scope` (with a deletion-test argument) and `## Work` (with a strength tag). The two strong held findings (B2, C3) are the most likely near-term additions.

## Out of scope for this pass (future review targets)

- `pi-extensions` (~23.8k LOC) — largest package, not explored.
- `clinkr` and `pi-extension-runtime` — framework/runtime helpers.
- `plans` / `planned-branch` internals beyond their interaction with branch-context (D5).
