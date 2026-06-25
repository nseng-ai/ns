# Roadmap

## Work

- [x] Land the agent-era CLI design research survey doc under `docs/`.
  - Synthesize clig.dev (human-first) + the agent-era sources (Anthropic
    "Writing effective tools for AI agents"; Speakeasy; Agent Layer; dev.to) +
    the Clinkr critique. Represent contradictory positions with citations, not a
    single answer. Seed from this session's synthesis and critique.
- [x] Audit Clinkr against the survey and produce a classified gap list.
  - `.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`
    classifies the post-ADR-0011 state with
    file:line evidence: envelope, usage-error, failure-data, and schema gaps are
    resolved; error-type discipline can proceed as skill guidance; output volume,
    negative process-exit defaults, and danger tiers remain ADR-needed; dry-run /
    force / aliases stay backlog unless a danger-tier ADR pulls them forward.
- [x] Record ADRs in `docs/adr/` for each contested decision.
  - All contested decisions surfaced by the survey/gap audit now have ADRs
    (0010–0014); no contested-ADR candidates remain. Each ADR records
    decision + dissent.
  - ADR 0014 records the confirmation/danger-tier decision (authored under the
    `clinkr-confirmation-danger-tiers` subobjective): four danger tiers
    (0 read-only, 1 scoped/reversible, 2 destructive/external, 3 high blast
    radius), TTY-gated prompting, non-interactive fail-fast, dry-run as `ok(...)`,
    and the `--yes`/`-y` (Tier 2 confirm) vs `--force`/`-f` (Tier 3 precondition
    override) verb split. Tiers stay `sdl-cli-design` authoring discipline rather
    than a new Clinkr framework type; `ClinkrInteraction.confirm` remains the
    only confirmation primitive for now.
  - ADR 0010 records the exit-code decision: keep process exit codes
    coarse/stable and put detailed failure semantics in the structured machine
    envelope; dissent for richer numeric taxonomies is preserved.
  - ADR 0011 records the TypeScript-native JSON envelope decision: drop the old
    Python-parity snake_case contract, publish camelCase discriminated machine
    envelopes with `status`/`exitCode`, preserve structured failure `data`, and
    envelope JSON-mode usage errors.
  - ADR 0012 records the output-volume discipline decision: keep pretty JSON and
    add no compact/pagination/JSONL framework API now; teach command-local
    bounded-output guidance in `sdl-cli-design` and reopen framework extraction
    only after repeated command pressure or one severe agent-context failure.
  - ADR 0013 records the negative process-exit default decision: `ok=0`,
    `negative=1`, and `failure/usage_error=2`; remove the redundant
    `--shell-exit-code` and `shellNegative` surfaces.
- [ ] Author and register the `sdl-cli-design` skill.
  - Clinkr-grounded overlay; `normal`/ambient via `areg`. Sections: basics as
    hard gates, human tier (clig.dev), agent/`exec` tier (agent-era), naming,
    pre-ship checklist. Map each rule to the Clinkr API that satisfies it; flag
    current Clinkr limitations to design around. Resolve public-vs-internal first.
- [~] Land the high-agreement Clinkr changes accepted by ADRs.
  - ADR 0011's high-agreement envelope reset has landed: structured failure
    `data` is preserved, JSON-mode usage errors are enveloped, machine envelope
    schemas are published, and TS package tests/consumers were migrated to the
    new camelCase contract.
  - ADR 0013's negative-default migration has landed in Clinkr: rendered
    `negative(...)` exits `1` by default, human/markdown negative messages go to
    stderr, JSON envelopes remain stdout with `exitCode: 1`, and the redundant
    `--shell-exit-code` / `shellNegative` split is removed. Remaining
    implementation work should be gated by the remaining ADRs rather than by the
    old Python-parity concern.

## Parked

- [ ] Output-volume framework features parked by ADR 0012 until repeated command
      pressure or one severe agent-context failure justifies extraction: compact
      JSON, generic pagination/truncation/range primitives, generic
      bounded-result wrappers, and JSONL/streaming output.
- [ ] Other contested/large Clinkr items deferred pending ADR acceptance:
      first-class command aliases and a dry-run/declarative convention.
- [ ] Coordinate change boundaries with `ts-cli-core-structural-cleanup`
      (structural) and `clinkr-shell-completion` (completion) where edits touch
      shared Clinkr code; resolve the sequencing question vs. the
      `sdl-extension-architecture` pause.
