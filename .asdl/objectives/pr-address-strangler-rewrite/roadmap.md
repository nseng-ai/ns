# Roadmap

## Work

- [x] Define the three-zone layout (`src/{core,legacy,app}`), the
      import-direction contract, and the static enforcement rule (initially over
      an empty `core/`) so the boundary is enforced before any code moves.
      Evidence: `src/core`, `src/app`, and `src/legacy` are materialized with
      marker files, and the package-local import-boundary static test passes as
      part of both targeted and full TypeScript validation. Review hardening
      later moved the recursive source-file walker shared by this guardrail and
      the app contract guardrail into test support without changing the enforced
      import contract.
- [x] Define the new `PrAddressRunEngine`/RunKernel façade in `app/`: target
      verbs are `feedback`, `details`, `plan`, `batch`, `status`, and `reply`,
      while this first read-only strangler slice implements only the read-only
      subset. Preserve the pattern that future primitives get their own thin
      end-to-end strangler slices rather than one big replacement cutover.
      Evidence: `src/app/run-engine.ts` defines the self-contained façade
      contract, `test/unit/run-engine-contract.test.ts` covers the verb set,
      structured detail handles, read-only engine/kernel methods, and banned
      storage-vocabulary identifiers, and package-local check/test passed. The
      app contract and import-boundary tests now share the same source-file
      walker from `test/support/source-files.ts`, reducing drift risk between
      the two static guardrails.
- [x] Carve cleanly-salvageable leaves into `core/` — gateways, feedback
      collection/normalization, summarize/compaction, and the GitHub/manifest
      mirror schemas — until `core/` compiles with zero `legacy/` imports and
      their golden/scenario tests stay green.
      Evidence: `src/core/gateways.ts`, feedback snapshot/summary helpers, and
      feedback/GitHub manifest mirror schemas now live under `src/core` with
      root compatibility wrappers for the old exec surface. Old `get-feedback`
      and `summarize-feedback` semantics stayed green through targeted
      scenario/gateway tests, package-local check/test, and full TypeScript
      workspace check/test. Real subprocess adapters, payload/session handling,
      and command wrappers remain in bootstrap root for later strangler rows.
- [ ] Split the mixed files, extracting into `core/`: the classify-exactly-once
      cardinality check, reply formatting + the four resolution modes, the
      resolve-decision validation, and body-on-demand lookup; leave any remaining
      residue in `legacy/`.
- [ ] `git mv` the remaining orchestration into `legacy/` untouched
      (`payload-store*`, `session-*`, `stdout-mode`, `prepare-run`,
      `stack-feedback-*`, checkpoint, finalization, the old `exec` surface) and
      confirm the old `exec` commands still run.
- [ ] Build the `feedback` + `details` verb pair through RunEngine over `core/`:
      compact item list first, detail/body lookup on demand, and no
      store/session/payload-path vocabulary in the output contract.
- [ ] Build the `status` verb through RunEngine over `core/`: re-fetch GitHub and
      report unresolved/unskipped threads with no required agent-visible
      persisted artifact; confirm it is the demystified replacement for
      checkpoint + finalize.
      Evidence: carved-core golden tests, the new `feedback`/`details`/`status`
      scenario tests, and the import-boundary static test all pass.

## Parked

- Production `plan`, `batch`, and `reply` primitives, each with its own
  end-to-end strangler slice and mutation parity validation on real PRs (the
  dangerous part) — follow-up Objective.
- Cutting the `pr-address` shim over to the new `app/` surface and deleting
  `legacy/`.
- Collapsing the ~2k lines of skill prose to the 5–6 verb description plus the
  preserved classification rules.
