# Roadmap

## Work

- [ ] Decide and implement the kind round-trip: a durable, inspectable intended-kind
      record plus a reconcile path (e.g. `areg skill reconcile [--after-refresh]`) that
      re-applies recorded kinds after a vendored refresh destroys overlay artifacts.
      Decision-bearing: record location, artifact-vs-record precedence, and reconcile
      semantics come first.
      Evidence: refresh a vendored skill, run reconcile, `areg check` clean with prior
      kinds restored and no git archaeology.

- [ ] Build the removal/cleanup story: `areg doctor skills` cross-checks command-backed
      registry rows ↔ installed skills in both directions (dead rows flagged), and a fix
      path exists for stale `.pi/settings.json` exclusions (doctor `--fix` and/or
      `areg skill remove` owning full teardown: dir, symlinks, lock entry, exclusion).
      Registry-row mutation may stay report-only per the risk noted in `objective.md`.
      Evidence: removing a vendored skill end-to-end leaves doctor fully clean without
      hand edits.

- [ ] Make `areg skill apply` writes position-preserving (or canonically sorted) in
      `.pi/settings.json` so re-applies produce no no-op diff hunks.

- [ ] Decide `computedHash` semantics: document install-time snapshot behavior, or
      verify content hashes in `areg check` with first-class recorded-fork support
      (fork marker/note surviving refresh), mechanizing the recorded-fork concept in
      `docs/conventions/upstream-skill-melding.md`. Update that convention and the
      `skill-management` skill to match the decision.

- [ ] Surface the implied kind (what the on-disk artifacts look like) in
      `areg skill show` and mismatch warnings in `areg check`, so an apply that
      contradicts disk-derived state is self-evident.

## Parked

(none)
