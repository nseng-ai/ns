# Roadmap

## Work

- [ ] Define the three-zone layout (`src/{core,legacy,app}`) and the
      import-direction contract; add the import-boundary lint rule (initially over
      an empty `core/`) so the boundary is enforced before any code moves.
- [ ] Carve cleanly-salvageable leaves into `core/` — gateways, feedback
      collection/normalization, summarize/compaction, and the GitHub/manifest
      mirror schemas — until `core/` compiles with zero `legacy/` imports and
      their golden/scenario tests stay green.
- [ ] Split the mixed files, extracting into `core/`: the classify-exactly-once
      cardinality check, reply formatting + the four resolution modes, the
      resolve-decision validation, and body-on-demand lookup; leave any remaining
      residue in `legacy/`.
- [ ] `git mv` the remaining orchestration into `legacy/` untouched
      (`payload-store*`, `session-*`, `stdout-mode`, `prepare-run`,
      `stack-feedback-*`, checkpoint, finalization, the `exec` surface) and
      confirm the old `exec` commands still run.
- [ ] Build the `feedback` verb on `core/` only: a compact item list with bodies
      on demand and no store/session vocabulary in its contract; scenario-test it
      against in-memory gateways.
- [ ] Build the `status` verb on `core/` only: re-fetch GitHub and report
      unresolved/unskipped threads with no persisted artifact; confirm it is the
      demystified replacement for checkpoint + finalize.
      Evidence: carved-core golden tests, the new `feedback`/`status` scenario
      tests, and the import-boundary lint all pass.

## Parked

- `resolve` / `reply` mutation verbs and mutation parity validation on real PRs
  (the dangerous part) — follow-up Objective.
- Cutting the `pr-address` shim over to the new `app/` surface and deleting
  `legacy/`.
- Collapsing the ~2k lines of skill prose to the 5-verb description plus the
  preserved classification rules.
