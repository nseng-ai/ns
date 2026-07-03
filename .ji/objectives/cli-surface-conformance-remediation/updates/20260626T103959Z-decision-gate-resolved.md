# Decision gate resolved via ADR 0015

## Summary

Recorded the six ADR-needed design calls the conformance audit surfaced as a
single omnibus ADR, `docs/adr/0015-cli-surface-conformance-decisions.md`
(Accepted), and reclassified every dependent row in
`docs/retros/cli-surface-conformance-audit.md` so none remains `ADR-needed`. This
completes the first open roadmap row (the decision gate) and unblocks the area
(a)/(d)/(c)/(b) remediation rows.

The six decisions:

1. **rawCommand / raw-exit** — narrow exemption: raw exit is sanctioned only for
   TUI / streaming / process-passthrough surfaces. Today's finite-result raw
   commands (`packagechk`, `sdlcc cmux report`, `vibechk run`,
   `roaster publish-findings`, `ccc autobranch`) migrate onto the Clinkr envelope
   (`land-now-fix`); even raw commands must map real failures to exit 2.
2. **Hidden `exec` external writes** — operation arguments are sufficient intent on
   the agent-only surface; no added `--yes`/confirmation flag required
   (`pr-address reply/resolve-review-thread` → conformant). Deliberate
   lower-friction exception, recorded explicitly so it is not reversed silently.
3. **`ccc land` single-PR fast path** — auto-merge to trunk is intentional (Pi
   surface, not Clinkr); recorded as an explicit lower-friction exception →
   conformant.
4. **Query-miss vs action-miss** — predicate/lookup misses use `ok(found:false)`;
   requested-target/action misses use `negative` (`pr-address` rows → conformant).
5. **Empty-success / presence-query `ok`** — ratified as the standard
   (`brmem export` empty → `ok`; `branch-context check`/`brmem check`
   `present:false` → `ok`).
6. **Dotfile / user-environment writes** — Tier 2 (`sdl shell install` →
   `land-now-fix`, add `--yes`/`-y` + `requireInteractiveOrUsageError`); explicit
   `--output <path>` and env-keyed external metadata writes (`sdlcc cmux report`)
   stay Tier 1.

`sdl-cli-design` authoring guidance was updated only where ADR 0015 changes it:
`references/danger-tiers.md` (dotfile Tier 2 rule), `references/agent-exec-tier.md`
(hidden-`exec` write intent), `SKILL.md` + `references/clinkr-api-map.md` (raw-exit
narrow exemption and ADR index).

## Objective Impact

- Roadmap "Decision (gates remediation)" row moves to `[x]`.
- All six Open Questions in `objective.md` are resolved by ADR 0015; the risk that
  "decisions invalidate classifications" is now retired for these calls — the
  audit matrix is internally consistent with the decisions.
- Unblocked remediation rows now ready to implement:
  - Area (a) land-now: `branch-context exec delete`, `brmem delete`,
    `sdl shell install` (Tier 2, ADR 0015 #6), `areg init`, `areg skill apply`,
    `packagechk claim-pypi`/`claim-npm` (rename `--skip-confirmation` → `--yes`/`-y`),
    `slot free --all`.
  - Area (d) land-now: not-found→`negative` / bad-or-missing-arg→`usageError` /
    operational-error→`failure` table across `areg`, `aretro collect-evidence`,
    `brmem get/delete/copy`, `plans exec resolve`,
    `objective exec runner-subagent-usage`, `ccc exec cmux-workspace-summary`,
    `vibechk show/diff`, `sdlcc cmux report`.
  - Area (c) land-now: kebab-case errorType fixes (`objective` storage codes,
    `areg skillx`, `brmem resolve-prompt`); replace `branch-context`/`plans`
    generic error-collapse wrappers; envelope migration for the raw commands
    (ADR 0015 #1).
  - Area (b) land-now: `aretro` (both), `vibechk runs/show/diff`,
    `roaster review log`.

## Follow-Ups

- Implement the area (a) safety remediations next, per the audit's safety-first
  sequencing, using `handoff delete`/`gc`, `slot gc`, `brmem put` as templates,
  with scenario tests (interactive confirm, `--yes`/`--force` bypass,
  non-interactive `usageError`).
- Note for decision #5: `brmem copy` with an empty source selection should become
  `negative` (requested action found nothing), distinct from `brmem export`'s
  empty → `ok`; classify under area (d).
- This slice is docs/decisions only; no command source under `ts/packages/*/src/`
  changed. `dprint check` passes for the edited docs/skills.
