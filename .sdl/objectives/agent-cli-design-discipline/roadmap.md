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
- [~] Record ADRs in `docs/adr/` for each contested decision.
  - Candidates still remaining: output-volume strategy (compact JSON plus
    pagination/truncation/streaming boundaries); negative process-exit default;
    confirmation/danger tiers. Each ADR records decision + dissent.
  - ADR 0010 records the exit-code decision: keep process exit codes
    coarse/stable and put detailed failure semantics in the structured machine
    envelope; dissent for richer numeric taxonomies is preserved.
  - ADR 0011 records the TypeScript-native JSON envelope decision: drop the old
    Python-parity snake_case contract, publish camelCase discriminated machine
    envelopes with `status`/`exitCode`, preserve structured failure `data`, and
    envelope JSON-mode usage errors.
- [ ] Author and register the `sdl-cli-design` skill.
  - Clinkr-grounded overlay; `normal`/ambient via `areg`. Sections: basics as
    hard gates, human tier (clig.dev), agent/`exec` tier (agent-era), naming,
    pre-ship checklist. Map each rule to the Clinkr API that satisfies it; flag
    current Clinkr limitations to design around. Resolve public-vs-internal first.
- [~] Land the high-agreement Clinkr changes accepted by ADRs.
  - ADR 0011's high-agreement envelope reset has landed: structured failure
    `data` is preserved, JSON-mode usage errors are enveloped, machine envelope
    schemas are published, and TS package tests/consumers were migrated to the
    new camelCase contract. Remaining implementation work should be gated by the
    remaining ADRs rather than by the old Python-parity concern.

## Parked

- [ ] Contested/large Clinkr items deferred pending ADR acceptance: pagination
      primitives, JSONL/streaming output, first-class command aliases, a
      dry-run/declarative convention.
- [ ] Coordinate change boundaries with `ts-cli-core-structural-cleanup`
      (structural) and `clinkr-shell-completion` (completion) where edits touch
      shared Clinkr code; resolve the sequencing question vs. the
      `sdl-extension-architecture` pause.
