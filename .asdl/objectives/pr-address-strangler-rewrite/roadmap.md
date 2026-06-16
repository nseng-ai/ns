# Roadmap

## Work

- [~] Define the three-zone layout (`src/{core,legacy,app}`), the
  import-direction contract, and the static enforcement rule (initially over
  an empty `core/`) so the boundary is enforced before any code moves.
  Current-state note: this was previously completed, but branch
  `pr-address-stack-feedback-pruning` removes `src/app`, `src/legacy`, the
  import-boundary test, and the shared source-file walker, leaving `src/core`
  as the only materialized zone. Rebaseline whether to restore this guardrail
  or replace it with a smaller single-PR isolation rule before treating the
  row as complete again.
- [~] Define the new `PrAddressRunEngine`/RunKernel façade in `app/`: target
  verbs are `feedback`, `details`, `plan`, `batch`, `status`, and `reply`,
  while this first read-only strangler slice implements only the read-only
  subset. Preserve the pattern that future primitives get their own thin
  end-to-end strangler slices rather than one big replacement cutover.
  Current-state note: this was previously completed, but branch
  `pr-address-stack-feedback-pruning` deletes `src/app/run-engine.ts` and
  `test/unit/run-engine-contract.test.ts`. The RunEngine contract is not
  present if that branch lands, so the row is back in rebaseline rather than
  complete.
- [x] Carve cleanly-salvageable leaves into `core/` — gateways, feedback
      collection/normalization, summarize/compaction, and the GitHub/manifest
      mirror schemas — until `core/` compiles with zero `legacy/` imports and
      their golden/scenario tests stay green.
      Evidence: `src/core/gateways.ts`, feedback snapshot/summary helpers, and
      feedback/GitHub manifest mirror schemas remain under `src/core` with root
      compatibility wrappers for the old exec surface. Branch
      `pr-address-stack-feedback-pruning` removes the old standalone
      `summarize-feedback` exec command and stack-oriented schemas/tests, but the
      retained `download-feedback`/`get-feedback` paths still consume the carved
      core leaves; package-local check/test passed at this tip.
- [ ] Split the mixed files, extracting into `core/`: the classify-exactly-once
      cardinality check, reply formatting + the four resolution modes, the
      resolve-decision validation, and body-on-demand lookup; leave any remaining
      residue in `legacy/`.
      Schema consolidation evidence: `core/feedback-manifest-contracts.ts` now
      derives its tolerant parse-back manifest schemas from the canonical strict
      operation-output mirrors in `core/operation-schemas/manifest-mirrors.ts`,
      eliminating the hand-maintained duplicate field lists while preserving the
      old parse-back defaults. Single-PR pruning removes stack-only
      classification/planning paths, but it does not extract these remaining
      mixed leaves into `core`.
- [ ] `git mv` the remaining orchestration into `legacy/` untouched
      (`payload-store*`, `session-*`, `stdout-mode`, `prepare-run`,
      `stack-feedback-*`, checkpoint, finalization, the old `exec` surface) and
      confirm the old `exec` commands still run.
      Current-state note: branch `pr-address-stack-feedback-pruning` deletes the
      stack-wide orchestration instead of moving it to `legacy`, removes the
      `legacy` zone marker, and leaves the retained single-PR payload/session
      helpers in bootstrap root. Rebaseline the legacy-zone strategy before
      executing this row literally.
- [ ] Build the `feedback` + `details` verb pair through RunEngine over `core/`:
      compact item list first, detail/body lookup on demand, and no
      store/session/payload-path vocabulary in the output contract.
      Current-state note: `download-feedback`, `get-feedback`, and
      `read-feedback-detail(s)` are the retained single-PR read-only helpers; no
      RunEngine-backed replacement exists while `src/app/run-engine.ts` is
      absent.
- [ ] Build the `status` verb through RunEngine over `core/`: re-fetch GitHub and
      report unresolved/unskipped threads with no required agent-visible
      persisted artifact; confirm it is the demystified replacement for
      checkpoint + finalize.
      Current-state note: `finalize-run` remains on the retained single-PR exec
      surface; no RunEngine-backed `status` replacement exists while
      `src/app/run-engine.ts` is absent.
      Evidence target after rebaseline: carved-core golden tests, the new
      `feedback`/`details`/`status` scenario tests, and the chosen boundary
      guardrail all pass.

## Parked

- Production `plan`, `batch`, and `reply` primitives, each with its own
  end-to-end strangler slice and mutation parity validation on real PRs (the
  dangerous part) — follow-up Objective.
- Cutting the `pr-address` shim over to a new `app/` surface and deleting
  `legacy/`; after single-PR pruning, this requires an explicit rebaseline
  because the `app` and `legacy` zones are no longer present.
- Collapsing the ~2k lines of skill prose to the 5–6 verb description plus the
  preserved classification rules.
