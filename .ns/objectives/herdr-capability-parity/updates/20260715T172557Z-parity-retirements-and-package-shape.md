# Parity Retirements Land Locally and Package Shape Narrows

## Summary

The first local stack branch publishes `docs/herdr/cmux-parity-checklist.md` and removes the rejected cmux Claude plan tab, session summary, branch-state summary, and `ns-cmux-sidebar` skill while retaining deterministic cmux objective summary and `ns cmux exec workspace-summary`.

The Herdr package decision is now explicit: a private `core` feature consumed by a `pi` host surface, exporting only `./pi` and `./pi/extension`. No selected behavior requires an `ns` host command or cross-package Capability API, so speculative `ns` and `api` doors would fail the subpackage rank test.

Installed Herdr runtime evidence also narrows objective-summary parity for now: the explicit caller workspace will be labeled/renamed, but objective/slot/branch metadata reporting is deferred because the installed CLI lacks `workspace report-metadata`.

## Objective Impact

Roadmap row 1 is complete on local branch `herdr-capability-parity-pr1`. Targeted cmux/areg/foundation tests, `areg check`, and full `just` pass. Full validation required isolating the default Vitest lane from ambient `NS_FAST_MODEL` and `NS_SLUG_MODEL`; those shell variables had changed scripted model commands across otherwise unrelated fake-driven suites.

PR 2 can proceed without empty public doors or an invented metadata transport. The fixed `/ns:herdr:sidebar:objective-summary` command remains selected and will preserve deterministic objective selection plus explicit Herdr workspace targeting.

## Follow-Ups

- Implement the `core` + `pi` Herdr foundation and label-only objective-summary vertical in PR 2.
- Add objective/slot/branch metadata reporting only after the installed Herdr CLI exposes the required workspace operation.
- Keep PR 3 limited to the five selected dispatch/open-branch workflows.
