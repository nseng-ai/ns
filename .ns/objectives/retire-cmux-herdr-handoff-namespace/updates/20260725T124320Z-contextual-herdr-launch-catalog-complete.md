# Contextual Herdr Launch Catalog Complete

## Summary

The public Herdr launch catalog now expresses only payload and destination: `/ns:herdr:launch:prompt:space`, `/ns:herdr:launch:plan:space`, and `/ns:herdr:launch:plan:tab`. The five earlier `br`/`tr` launch commands remain accurate historical evidence but are superseded and have no visible or hidden compatibility aliases.

One shared contextual branch-basis resolver now selects the launch source. Named `main` or `master` uses the complete refreshed Graphite trunk workflow automatically; other named branches offer current branch or refreshed trunk; detached HEAD and current-branch lookup failures offer confirmed trunk fallback. Cancellation, declined fallback, unavailable interaction, changed current-branch revalidation, and trunk-preparation failure all stop before downstream mutation. Plan-to-tab captures caller workspace identity before Git inspection or interaction, and plan dry-run previews rather than executes trunk refresh.

## Objective Impact

This completes the new roadmap slice and rebaselines the Objective from the earlier eleven-command `br`/`tr` contract to the nine-command contextual-selection contract: eight base registrations plus optional `/ns:herdr:tab:handoff`.

Implementation retains existing ownership boundaries: Capability Kit owns Graphite trunk preparation and prompt branch creation, Branch Context owns plan branch creation and attachment, and Herdr owns contextual selection plus prepared destination launch. Prompt text remains free-form and is not parsed for branch flags.

Evidence:

- `pnpm --dir ts --filter @nseng-ai/herdr test` and package check pass with fake-driven resolver, prompt, plan-space, plan-tab, catalog, preflight, dry-run, cancellation, and acknowledgement-ordering coverage.
- `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`, `just ts-test-typescript-style-guard`, `just dprint-check`, and the repository `just` entrypoint pass.
- Bounded stale-name classification finds the five removed names only in explicit absence assertions and immutable historical Objective evidence.
- `ns objective check retire-cmux-herdr-handoff-namespace` still reports only the three known missing-heading errors in immutable legacy update `20260719T181812Z-reference-based-herdr-handoff-launch.md`; no historical update was changed.

## Follow-Ups

Objective closure remains blocked by the pre-existing immutable legacy-update checker incompatibility. Do not rewrite that historical Semantic Update to close the record; use an authorized compatibility mechanism when one exists.
