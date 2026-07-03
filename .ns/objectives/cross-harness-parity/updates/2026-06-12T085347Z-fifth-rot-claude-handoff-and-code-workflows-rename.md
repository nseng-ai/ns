# Fifth parity-table-rot materialization: /claude:handoff unlisted, code-workflows rename drift

## Summary

An objective-next Tracking Gate run (2026-06-12) found parity-relevant drift that accumulated within two days of the 2026-06-10 full record rewrite:

- **New Pi surface unlisted**: `/claude:handoff` plus its `claude_handoff_launch` tool (`pi-extensions/src/claude/handoff-command.ts`, landed 2026-06-12) had no parity-table row. It creates a handoff through the same shared brmem/`handoff`-CLI-backed launch flow as `/handoff-tab`, then stops the Pi TUI and hands the terminal to an interactive `claude` session that picks the handoff up via the `handoff-pickup` skill. Classified **WAIVED**: the interactive terminal handover is Pi-TUI session-native by construction (the `interactive-spawn.ts` adapter seam); the artifact and pickup contract stay CLI/skill-backed, with `handoff-create` + `handoff-pickup` as the agent-neutral fallback — the same rationale as the existing `/handoff-tab` waiver.
- **Skill-family rename left stale references**: the `internal-code-*` skills were renamed to `code-*` on 2026-06-11 (`code-workflows`, `code-submit`, `code-checkpoint`, `code-just-fix`), `stack-address` was promoted out of the router to a standalone skill, and the Pi router itself changed shape: `/internal-code-workflows` plus six per-route commands became a single `/code-workflows` selector command with route autocomplete (routes: `delete-stack`, `stackify-branch`, `stacker-agent`, `parity-review`, `gh-ci-debug`). `objective.md`, `roadmap.md`, and the parity table all still referenced the old names.
- **Minor, no parity effect**: the land-stack core in `@asdl/ccc` was hardened 2026-06-11/12 (cleanup, backup-ref rotation, post-submit validation). The `/code:land` gap row's substance is unchanged — bin + skill still missing.

This is the **fifth** materialization of the parity-table-rot risk, and it fires the standing trigger recorded in the 2026-06-10 update's follow-ups ("consider prioritizing the parked CI parity gate if a fifth materialization occurs").

## Objective Impact

- `parity-table.md`: targeted refresh dated 2026-06-12 (not a full sweep). Added the `/claude:handoff` + `claude_handoff_launch` WAIVED row. Rewrote the router row as `/code-workflows` (single selector command; per-route commands removed; `stack-address` noted as standalone skill-only). Updated the skill column on the `/just`, `/code:cp`, `/code:pr-regen`, and `/code:submit` rows to the renamed `code-*` skills. Appended the no-parity-effect hardening note to the `/code:land` gap row.
- `objective.md`: parity-review discipline, table-tracking rules, and completion criteria now name the `code-workflows` skill; delivered-scope prose records the 2026-06-11 rename; the rot risk is updated to five materializations with the fired trigger noted; a new open question asks whether the parked CI parity gate should be promoted to active work.
- `roadmap.md`: only the completed parity-review row's consolidation parenthetical updated to the renamed skill; no row state changed — no roadmap work was completed or added by this update.

## Follow-Ups

- Decide the new open question: promote the parked machine-checkable CI parity gate to active work, or accept continued reliance on corrective sweeps. Five materializations in nine days of tracking suggest change-time enforcement is needed.
- The `/claude:handoff` waiver assumed the existing `/handoff-tab` rationale; if a future change moves pickup-session launching into shared code with an agent-neutral entry point, revisit the verdict.
