# ns-init Consumes Harness Artifacts Provisioner

## Summary

The steelthread now reaches the real `@nseng-ai/ns-init` consumer seam. `RealSkillMaterializer` implements ns-init's existing `SkillMaterializer` gateway over `@nseng-ai/harness-artifacts` apply: it resolves the static first-party `objective` skill catalog entry, provisions it into selected project-scope `claude-code`, `codex`, and `pi` harness roots, and returns the installed skill paths without changing ns-init's gateway contract.

Completion evidence is now end-to-end across the thread: the static catalog and harness path table feed provision-plan generation; apply copies the real skill files and writes `<targetRoot>/.ns-harness-artifacts-manifest.json`; the `ns skills list/path/install --dry-run|--force` CLI family exercises the same substrate; and ns-init's real adapter consumes that shared substrate through its activation seam instead of the previous pending stub.

## Objective Impact

This advances the implementation row's completion-gate slice by exercising catalog → path table → plan → apply → manifest → CLI + real consumer seam for the first-party `objective` skill, while preserving fake-driven tests for ns-init's higher-level activation flows.

## Follow-Ups

Parent should judge whether the Objective's completion criteria are now satisfied and handle any roadmap status changes or closure; this update intentionally does not close the Objective or edit roadmap statuses.
