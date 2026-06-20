# Full-Sweep Parity Refresh and Provider Lock-In Findings

## Summary

Ran an explicit full-sweep parity review (the `parity-review` route of `internal-code-workflows`) over every live Pi extension command and custom tool, plus a requested sweep for harness-specific agent references and provider-specific model references across skills and Pi extension/shared code.

Table drift found and corrected:

- The cmux command namespace was renamed: `/cmux:sidebar:*` → `/ccc:sidebar:*` and `/cmux:workspace:*` → `/ccc:workspace:*`; the driving skill is now `ccc-sidebar`.
- `/code:land` and `/code:land-stack` were unified into a single `/code:land` command ("Land the current PR or Graphite stack into trunk", `ts/packages/ccc/src/land.ts` + `land-stack/`). The merged row remains NONE: the stack orchestration is still TypeScript-trapped.
- New unlisted surfaces were added: the `/internal-code-workflows` router plus its six route commands (FULL — each command only injects a route; the playbooks are skill references Claude/Codex read directly), `/cp-preview` / `/checkpoint-preview` (PARTIAL — Pi-only preview re-assembling checkpoint prompt context instead of an `asdl-dev cp` preview mode), `/handoff-tab` with the `derive_handoff_slug_from_content` and `handoff_tab_launch` tools (WAIVED — cmux tab session UI over the CLI-backed handoff artifact), and `/grill-with-docs-ui` (folded into the existing `grill_ask` waiver row).
- The standalone `internal-code-parity-review` skill was consolidated into `internal-code-workflows` as the `parity-review` route; durable references updated.

Harness/model sweep findings: provider-specific model refs are hardcoded outside the backend-neutral text-generation abstraction in shared/neutral code paths — three duplicated `model-slug.ts` helpers (`pi-extensions`, `ccc/autobranch`, `planned-branch`) pinning `openai-codex/gpt-5.4-mini`, the ccc sidebar default model ref, per-harness model branching in `pi-extensions/src/fast-text-draft.ts`, Codex model refs in shared `asdl-core` prompt guidance (`prompts/defaults/subagent-launch.md`), and a hardcoded haiku model in the `refactor-swarm` skill. The checkpoint default is mitigated by the `ASDL_DEV_CHECKPOINT_MODEL` override. Deliberately harness-targeted code (roaster's Claude Code CI runner, install-layout docs, stacker-agent harness adapter files) was classified benign.

Evidence: clean working tree on `master`; full registration-site inventory over `pi.registerCommand` / `registerCliCommandExtension` / `registerTool` in `ts/packages/pi-extensions` and `ts/packages/ccc` plus `.pi/extensions/` wiring; skill inventory from `skills/*/SKILL.md` and `.agents/skills/`; targeted source reads of `land.ts`, `land-stack/constants.ts`, `checkpoint-preview.ts`, and `code.ts`.

## Objective Impact

`parity-table.md` is refreshed to the live 2026-06-09 surface. The parity-table-rot risk has now materialized a third time (namespace rename, land unification, and several unlisted surfaces accumulated before this sweep); the full-sweep workflow is confirmed as a working corrective control, but diff-scoped review at change time remains the weak point. The model-text assumption is marked partially validated, and a new provider lock-in drift risk is recorded. Two roadmap rows were added: reconcile `/cp-preview` with `asdl-dev cp`, and consolidate provider-specific model defaults behind the backend-neutral abstraction. The land and cmux dispatch rows now name the unified `/code:land` and the `/ccc:workspace:*` commands.

## Follow-Ups

- Close the new provider-default consolidation row alongside the autobranch and cmux extractions, since the slug helpers are the shared seam.
- Decide `/cp-preview`: CLI preview mode in `asdl-dev cp` or a recorded waiver.
- When running diff-scoped parity review, also check for command renames and command unification, not just additions — both drift modes appeared in this sweep.
