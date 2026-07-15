# Canonical Package README Onboarding Authored

## Summary

The pre-launch canonical documentation surface now carries the bare-core Objectives happy path. `ts/packages/hosts/ns/README.md` documents prerequisites, global or `npx` installation, repository activation, extension acquisition, and lifecycle prompts. A new `ts/packages/capabilities/objectives/README.md` explains Objectives, the install-core → initialize Claude Code → install Objectives order, the ten provisioned skills, and create → next → update → close. Package preparation now includes that Objectives README in future published artifacts.

## Objective Impact

This materially advances the customer-documentation row and aligns the Objective with the repository rule that package READMEs are the canonical pre-launch install/quickstart/usage surface. It does not complete the row: these README changes postdate the published `0.1.3` artifacts, the docs-site still carries stale release-gate copy, and the fresh-session Claude Code lifecycle has not been run without improvisation.

The Objective remains open and correctly unblocked. The next useful decision is the human-owned docs launch bar in `eve-parity-docs-site`; once that determines the minimal public corpus, the Objective-specific pages can be reconciled and the Claude Code steelthread can proceed.

## Follow-Ups

- Resolve the `eve-parity-docs-site` launch bar: hide, rewrite, or explicitly mark non-happy-path pages, and decide whether the first launch requires the full kernel/extensions IA restructure.
- Reconcile the four Objective customer pages with the verified `0.1.3` command order and remove stale release-gate copy.
- Ensure a future registry publication serves the canonical README guidance before treating it as public customer evidence.
- Run the fresh Claude Code create → next → update → close journey after the publishable documentation gate clears.
