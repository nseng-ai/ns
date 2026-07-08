# areg Lifecycle Ergonomics

## Thesis

areg is reliable at inspecting invocation state but weak at the moments the vendored-skill
lifecycle actually stresses it: refreshing a vendored skill destroys the overlay artifacts
the kind is derived from, removing a skill leaves stale exclusions and dead
command-backed registry rows that nothing fixes, `apply` produces no-op ordering churn in
`.pi/settings.json`, and `computedHash` is silently unverified against forked vendored
content. This Objective makes areg round-trip-safe across refresh, removal, fork, and
apply, so an upstream-skills refresh session needs no git archaeology and no manual
teardown.

All five friction points were observed concretely in one session: the mattpocock/skills
v1.1 refresh (branch `pocock-upstream-refresh-melding-process`, 2026-07-08), which also
produced `docs/conventions/upstream-skill-melding.md` — the melding convention whose
"recorded fork" concept item 4 below would mechanize.

## Scope

Five friction points, each a roadmap row:

1. **Kind round-trip on vendored refresh.** `npx skills add` refresh deletes
   `agents/openai.yaml` and resets frontmatter — the very artifacts areg derives kind
   from. Restoring requires knowing the prior kind from git history (in the observed
   session, `writing-great-skills` was mis-applied `invoke-only` when its prior kind was
   `command-backed`). Design a durable intended-kind record plus a reconcile path
   (e.g. `areg skill reconcile [--after-refresh]`) that re-applies recorded kinds.
2. **Removal/cleanup story.** `npx skills remove` under-delivers (leaves the universal
   dir and lock entry), and areg has nothing to finish the job: `areg doctor` detects
   stale `.pi/settings.json` exclusions but offers no fix, and dead rows in
   `ts/packages/hosts/command-backed-skill-registry/src/index.ts` (e.g. the pre-existing
   `ts-morph-refactor` row) are not flagged at all. Add a doctor cross-check of
   command-backed registry rows ↔ installed skills (both directions) and a fix path
   (doctor `--fix` and/or an `areg skill remove` owning full teardown).
3. **`.pi/settings.json` ordering churn.** `areg skill apply` removes and re-appends the
   exclusion entry, producing a semantically-no-op two-hunk diff. Preserve position or
   keep the list sorted.
4. **Hash semantics.** `areg check` does not verify `computedHash` against vendored dir
   content — a forked `wayfinder` passed cleanly. Decide: either document install-time
   snapshot semantics, or verify content hashes with first-class recorded-fork support
   (e.g. a fork marker/note field), mechanizing the melding convention's recorded-fork
   concept.
5. **Implied-kind surfacing.** `areg skill show`'s Pi-replacement line was the only
   signal that caught the item-1 mis-apply. Surface the *implied kind* ("artifacts on
   disk look like command-backed") in `show`/`check` output so mis-applies are
   self-evident.

## Non-Goals

- No provisioning work: `ns skills`/`ns update`, the install manifest, and
  npm-module-bundled artifacts belong to the `skill-management-subsystem` umbrella and
  its children. This record is areg-local ergonomics only (prose cross-reference; no
  edge by decision).
- No wrapping or replacing `npx skills` (retired product decision in that umbrella);
  fixing what `npx skills remove` leaves behind is in scope, replacing the acquisition
  channel is not.
- No premature push-down: the umbrella parks "push areg's remaining local logic into
  `@nseng-ai/harness-artifacts`" with an explicit second-consumer trigger. Solutions here
  should not force that graduation, though they may inform it.
- No convergence of `skills-lock.json` and the install manifest (retired decision).
- No new hidden state: any intended-kind record must be an explicit, inspectable,
  git-tracked artifact.

## Completion Criteria

- A vendored-skill refresh can restore all invocation kinds without consulting git
  history, and a wrong `areg skill apply` is visibly flagged.
- Removing a vendored skill leaves no stale exclusion, no dead command-backed registry
  row, no orphan lock entry, and no leftover directory — either mechanically or via a
  documented one-command path — and `areg doctor skills` verifies all of it.
- `areg skill apply` diffs touch only semantically meaningful lines.
- `computedHash` semantics are decided, documented, and enforced (or explicitly
  documented as unenforced), with recorded forks representable.
- `docs/conventions/upstream-skill-melding.md` and the `skill-management` skill reflect
  whatever contracts change.

## Assumptions and Risks

Assumptions:

- areg remains a standalone whole-project inspector in `tools/` with zero inbound
  dependents (umbrella decision, 2026-07-07); this record's changes stay within that
  positioning.
- `npx skills` CLI behavior (partial removal, overlay-destroying refresh) is external
  and will not be fixed upstream on our schedule; areg must be robust around it.
- The observed session is representative: refresh/removal are the high-frequency
  lifecycle moments, not initial install.

Risks:

- A durable intended-kind record adds a second invocation-state source of truth;
  if artifacts and record drift, areg must define which wins or it worsens the problem
  it solves. Mitigation: reconcile semantics decided first (row 1 is decision-bearing).
- Hash verification with fork support could conflict with how `npx skills` recomputes
  hashes on refresh; a fork marker must survive refresh or be trivially re-applied.
- Doctor `--fix` mutating `.pi/settings.json` and a hand-maintained TS registry file
  crosses from inspection into mutation of first-party source; the registry cross-check
  may need to stay report-only.

## Open Questions

- Where does the intended-kind record live: lock-adjacent file, `.ns/*` artifact, or
  extension of an existing record? (Must honor the no-hidden-database rule.)
- Is `areg skill remove` worth owning end-to-end teardown, or is doctor `--fix` plus the
  existing `npx skills remove` sufficient?
