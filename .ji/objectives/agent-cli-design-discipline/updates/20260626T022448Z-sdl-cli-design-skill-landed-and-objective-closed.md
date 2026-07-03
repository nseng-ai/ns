# sdl-cli-design Skill Landed; Objective Closed

## Summary

Authored and registered the `sdl-cli-design` skill (`skills/sdl-cli-design/`),
the last active roadmap row, and closed the Objective.

Decisions made in this session's grill and applied:

- **Invocation kind: `invoke-only`** (zero ambient; `/skill:sdl-cli-design`
  only). This is a deliberate deviation from the Objective's original
  "registered via `areg` as `normal`/ambient" wording in Scope/Completion
  Criteria. Rationale: the skill only fires when someone authors/reviews a CLI,
  so paying a recurring ambient-context cost in every session was not worth it.
  Registered via `areg skill apply invoke-only sdl-cli-design`; `areg check`
  reports `All skills OK`.
- **Structure:** lean `SKILL.md` (hard gates, tier overview, naming, output-volume
  discipline, pre-ship checklist, known Clinkr limitations) plus `references/`:
  `human-tier.md`, `agent-exec-tier.md`, `danger-tiers.md`, `clinkr-api-map.md`.
- **Authority placement (absorb + stub):** the skill is the canonical CLI-design
  authority. Root `AGENTS.md` shrank the former "CLI Scenario Testing Convention"
  and "Skill-Invoked CLI Commands (exec Subgroups)" sections into a single "CLI
  Design Discipline (`sdl-cli-design`)" section that keeps the two binding hard
  gates ambient (scenario `--version`/`--runtime`/`-h` coverage; hidden `exec`
  subgroups) and points to the skill for the full reasoning. This preserves
  always-on enforcement of the hard gates despite the skill being invoke-only.
- **Pre-ship checklist:** prose markdown, each item anchored to its ADR
  (0010–0014) and the Clinkr API symbol that satisfies it; no net-new conformance
  tooling (consistent with ADR 0012's YAGNI posture).

Skill content is grounded in `docs/research/agent-era-cli-design-survey.md`, the gap audit
(`references/clinkr-agent-era-gap-audit.md`), ADRs 0010–0014, and verified Clinkr
API symbols (`ok`/`negative`/`failure`/`usageError`, `toMachineEnvelope`,
`exitCodeForExit`, `ClinkrInteraction.isInteractive`/`confirm`,
`requireInteractiveOrUsageError`, `--json-schema`, hidden `exec` `ClinkrGroup`).

Validation: `areg check` → All skills OK; `just dprint-check` → clean (table
alignment autofixed via `just dprint-fix`). Skill is discoverable across Claude
Code, Codex, Cursor, GitHub Copilot, and OpenClaw via the symlink chain
(`skills/sdl-cli-design` ← `.agents/skills/sdl-cli-design` ←
`.claude/skills/sdl-cli-design`); `skills-lock.json` source normalized to the
repo-relative `skills/sdl-cli-design`.

## Objective Impact

All Completion Criteria are satisfied:

- Research survey checked in (`docs/research/agent-era-cli-design-survey.md`).
- An ADR per contested decision exists (`docs/adr/0010`–`0014`), each with dissent.
- `sdl-cli-design` authored and registered, reflecting the ADR outcomes — with the
  `normal` → `invoke-only` deviation recorded here and in `## Closure`.
- High-agreement Clinkr changes landed with tests (ADRs 0011, 0013, 0014
  conformance); ADR 0012 output-volume framework features intentionally parked.

The remaining roadmap row "Author and register the `sdl-cli-design` skill" moves
`[ ]` → `[x]`. No active semantic work remains; the Objective is closed. Parked
backlog (not blockers): output-volume framework features (ADR 0012), first-class
command aliases, a declarative dry-run convention, first-class danger-tier
metadata, and typed `--confirm` phrases.

## Follow-Ups

- If repeated command pressure or one severe agent-context failure appears,
  reopen the ADR 0012 output-volume framework-extraction question.
- If a concrete command needs a required-confirmation phrase, revisit typed
  `--confirm` and first-class danger-tier metadata under a new ADR.
- Keep the skill's `references/clinkr-api-map.md` file:line anchors honest by
  re-grepping before quoting line numbers (Clinkr source may drift).
