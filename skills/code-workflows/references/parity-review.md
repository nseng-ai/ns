<!-- Loaded through `code-workflows`. -->

# parity-review

Review Pi extension command/tool changes for cross-harness parity. This skill is advisory: it reports findings and may update Objective parity tracking, but it does not declare a merge blocked.

## Core model

Pi is additive when deterministic workflow logic lives in a shared CLI plus an installed skill, or in documented primitive commands for very thin workflows. A parity concern exists when a Pi command/tool contains workflow orchestration that Claude/Codex cannot reach outside Pi, or when the counterpart skill/docs are missing.

Use live repo evidence as the source of truth. Documentation and Objective tables can drift; source registration sites, CLI surfaces, installed skills, and actual command behavior win. Use severity labels for review triage, not as merge-blocking authority.

## Modes

- **Default: diff-scoped review.** Review the current worktree plus current branch diff. Inspect changed files first, then use full inventory searches only to understand nearby patterns.
- **Explicit full-sweep review.** Inventory every current Pi command/tool surface and compare it to skills, CLIs, and the Objective parity table.

If full-sweep is requested and `.asdl/objectives/cross-harness-parity/parity-table.md` exists, check it against live evidence and refresh it when drift is found.

## Evidence collection

Start with narrow repo facts:

```bash
git status --short
git branch --show-current
gt parent --no-interactive 2>/dev/null || true
git diff --name-status
git diff --name-status <base>...HEAD  # when the branch base is known
rg -n "pi\\.registerCommand|registerCliCommandExtension|registerTool\\(" ts/packages/pi-extensions/src -g '!**/node_modules/**'
find skills -maxdepth 2 -name SKILL.md | sort
```

Prefer the Graphite parent from `gt parent --no-interactive` as the branch diff base when available, because this repo uses Graphite stacks. If Graphite is unavailable, use a best-effort plain git base (`origin/master`, `master`, `origin/main`, `main`) without failing the review.

Do not parse `gt branch info`, `gt ls`, `gt ls --stack`, or `gt log` display output for machine topology decisions. For current-stack topology use `slot gt exec stack-branches` or `slot gt exec stack-branches --format json`; reserve display commands only for human visual confirmation or diagnostics.

For diff-scoped review, inspect changed files before the full inventory. For full-sweep review, inspect all registration sites and the current skill inventory.

## Inspecting Pi surfaces

Look for these source shapes under `ts/packages/pi-extensions/src/`:

- Direct command registration: `pi.registerCommand(...)`.
- Direct custom tools: `pi.registerTool(...)`.
- CLI bridge registration: `registerCliCommandExtension(...)` in `ts/packages/pi-extensions/src/cli-command-extension.ts`.
- Current bridge example: `ts/packages/pi-extensions/src/asdl-dev-extension.ts` maps `asdl-dev` commands to `/dev:*` and `/code:*` Pi commands.

Commands registered through `registerCliCommandExtension` are presumed CLI-backed. Verify skill/docs discoverability and flag surprising extra Pi-only behavior, but do not treat every generated bridge command as an orchestration gap.

Custom tools are in scope because they can create harness lock-in. Genuinely Pi-native UI/session primitives may be WAIVED only when dependent workflows document an agent-neutral fallback. Workflow/data-mutation tools should have a CLI/skill path, sibling Objective ownership, or a tracked gap.

Existing waiver examples from the parity table:

- `dispatch_runner_subagent` is WAIVED with host Task/subagent fallback.
- `grill_ask` is WAIVED with prose `grill-me` / `grill-with-docs` skill fallback.
- `write_saved_plan_file` is sibling-owned by the `enriched-plan` CLI / branch-context skill workflow, not closed by this Objective.

## Parity judgment rubric

Use case-by-case judgment; do not impose a rigid always-CLI requirement.

Higher concern / likely needs shared CLI extraction:

- multi-step mutations;
- safety guards or preflight checks;
- external write effects such as GitHub, Graphite, cmux, or worktree creation;
- generated names/text that must be backend-neutral;
- duplicate orchestration in TypeScript and skills/CLI.

Lower concern / may be skill-only or WAIVED:

- read-only summaries;
- card rendering or UI-only behavior;
- very thin one-command wrappers when a skill documents exact primitive commands and guards;
- genuinely Pi-native UI/session primitives with fallbacks.

## Finding categories

Use advisory labels:

- `major gap` — likely trapped Pi-only workflow/orchestration or missing non-Pi reachability for meaningful workflow behavior.
- `discoverability gap` — CLI/primitive path exists but no skill/docs make it reachable to Claude/Codex.
- `table drift` — Objective parity table differs from live repo evidence.
- `waiver check` — Pi-native waiver/fallback needs confirmation or docs.
- `note` — UI/cosmetic or already-covered observation.
- `covered` — positive evidence for a changed surface that already has parity.

## Report format

```markdown
## Parity review

Mode: diff-scoped | full-sweep
Base/evidence: <branch/base, changed files, source searches>

### Findings

- Severity: <major gap | discoverability gap | table drift | waiver check | note | covered>
  Surface: `<Pi command/tool or file>`
  Evidence: <source paths, command names, skill paths>
  Cross-harness path: <CLI/skill/primitive/waiver/tracked gap>
  Recommendation: <what to do next>

### Objective table sync

- <No table changes needed | Updated parity-table.md and wrote update file | Suggested table change but did not edit because...>

### Validation

- <commands run and result>
```

## Objective table sync

`.asdl/objectives/cross-harness-parity/parity-table.md` is the single durable parity table when present. Do not keep a duplicate exhaustive table in this skill.

If review edits `parity-table.md` or other Objective tracking, also create a new immutable Semantic Update under `.asdl/objectives/cross-harness-parity/updates/` with:

```markdown
# <Update Title>

## Summary

## Objective Impact

## Follow-Ups
```

Never edit existing files under `updates/`; create a new update. If the Objective table is missing, still produce findings from live evidence and report that durable table sync was unavailable.

## Stop and ask

Stop before editing when:

- requested edits would touch multiple Objective slugs;
- the Objective is archived/closed or the table location is ambiguous;
- live evidence and requested interpretation are materially ambiguous;
- a finding would require write-capable external actions beyond review/documentation;
- the user asks for a machine-checkable CI gate or manifest in this slice.

The CI/manifest path is parked future work; plan it separately instead of adding it opportunistically.

## Verify

For ordinary reviews, report the evidence commands you ran. When editing this router reference or Objective tracking, also run targeted formatting and whitespace checks such as:

```bash
dprint check skills/code-workflows/SKILL.md \
  skills/code-workflows/references/parity-review.md \
  .asdl/objectives/cross-harness-parity/objective.md \
  .asdl/objectives/cross-harness-parity/roadmap.md \
  .asdl/objectives/cross-harness-parity/parity-table.md \
  .asdl/objectives/cross-harness-parity/updates/<new-update>.md \
  skills-lock.json
git diff --check
```
