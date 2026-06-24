# Roadmap

## Work

- [ ] Land the agent-era CLI design research survey doc under `docs/`.
  - Synthesize clig.dev (human-first) + the agent-era sources (Anthropic
    "Writing effective tools for AI agents"; Speakeasy; Agent Layer; dev.to) +
    the Clinkr critique. Represent contradictory positions with citations, not a
    single answer. Seed from this session's synthesis and critique.
- [ ] Audit Clinkr against the survey and produce a classified gap list.
  - One entry per gap with file:line evidence, classified land-now /
    contested / large-backlog. Seed from this session's critique (output volume,
    `failure` lacks `data`, free-string `error_type`, `negative`→exit 0,
    un-enveloped usage errors, no confirmation tiers, manual aliases, no dry-run).
- [ ] Record ADRs in `docs/adr/` for each contested decision.
  - Candidates: exit-code taxonomy vs. envelope `error_type`; JSON
    compaction/streaming vs. Python-parity contract; pagination/truncation
    strategy; confirmation/danger tiers. Each ADR records decision + dissent.
- [ ] Author and register the `sdl-cli-design` skill.
  - Clinkr-grounded overlay; `normal`/ambient via `areg`. Sections: basics as
    hard gates, human tier (clig.dev), agent/`exec` tier (agent-era), naming,
    pre-ship checklist. Map each rule to the Clinkr API that satisfies it; flag
    current Clinkr limitations to design around. Resolve public-vs-internal first.
- [ ] Land the high-agreement Clinkr changes accepted by ADRs.
  - e.g. structured `data` on failure exits, opt-in output compaction. Each
    change independently reviewable. Evidence: targeted tests + relevant repo
    checks pass.

## Parked

- [ ] Contested/large Clinkr items deferred pending ADR acceptance: pagination
  primitives, exit-code taxonomy, JSONL/streaming output, first-class command
  aliases, a dry-run/declarative convention.
- [ ] Coordinate change boundaries with `ts-cli-core-structural-cleanup`
  (structural) and `clinkr-shell-completion` (completion) where edits touch
  shared Clinkr code; resolve the sequencing question vs. the
  `sdl-extension-architecture` pause.
