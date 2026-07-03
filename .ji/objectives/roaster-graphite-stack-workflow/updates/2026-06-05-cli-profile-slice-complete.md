# CLI/Profile Slice Complete

## Summary

Completed the first implementation slice, `roaster-stack/cli-profile`: roaster now exposes a visible `roaster stack` group and a `roaster stack run <profile-slug>` command shape, resolves loose markdown profiles from `.roaster/profiles/<slug>.md`, and includes the sample `.roaster/profiles/thermonuclear-stack.md` profile.

The command/profile work intentionally stops before Branch Memory, dashboard publication, Graphite mutation, agent runners, dry-run orchestration, and stack-domain parser contracts. Profile markdown is treated as raw loose guidance and is not deterministically parsed.

Evidence: local branch `roaster-stack/cli-profile`, commit `5ae8145f`; parent-side validation passed for `uv run pytest packages/roaster/tests/scenario/test_stack_cli.py -n auto` and existing roaster scenario coverage for review/exec/harness commands.

## Objective Impact

The first roadmap row is complete. The Objective remains open because the parser, storage, dashboard, triage, dry-run, Graphite gateway, resolver-loop, and docs/closeout slices remain outstanding.

## Follow-Ups

- Continue with `roaster-stack/contracts` to add pure stack models, slug helpers, and authoritative triage/resolver frontmatter parsing.
- Keep subsequent slices behind fake-driven tests and do not broaden profile markdown into deterministic configuration without a separate recorded decision.
