# Flow Submit Pre Hook Migration

## Summary

Local branch `point-system-flow-submit-pre-W5pCnV` commit `1e89a46a0` migrated Flow pre-submit hooks from the provisional `[flow.hooks].pre_submit` surface to the point system. The flow extension manifest now declares the additive hook point `flow.submit.pre`, repo-root `ns.toml` installs hooks at `[points]."flow.submit.pre"`, and the flow submit runtime reads hook installations through the kernel point catalog.

The slice also updates submit help text and diagnostics, rejects legacy `[flow.hooks]` for this migrated key, and removes Flow's direct `smol-toml` dependency.

## Objective Impact

This completes the `flow.submit.pre` first-consumer migration roadmap row and removes one of the ad-hoc `ns.toml` parsers targeted by the Objective. The remaining migrations are prompt points (`flow.submit.pr-description`, branch-context `plans-write`) and declared settings (roaster, areg, ns-init).

Validation evidence from the runner step: targeted Flow submit hook unit and scenario tests passed, including pass/fail and `--no-hooks` coverage; `just ts-format-check`, `just dprint-check`, `just ts-lint`, `just ts-check`, and `git diff --check` passed. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure already recorded in earlier updates.

## Follow-Ups

- Migrate prompt points next: `flow.submit.pr-description` and branch-context `plans-write`, with each prompt filename/reader cut over in the same slice.
- Continue tracking the known full-`just` style-guard failure separately from point-system implementation evidence unless a future point-system slice changes it.
