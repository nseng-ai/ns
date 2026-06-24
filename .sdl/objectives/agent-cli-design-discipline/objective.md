# Agent-Era CLI Design Discipline

## Thesis

Designing CLIs well is now a two-audience problem: the same command is consumed
by humans *and* by AI agents, and the canonical reference — clig.dev — is
explicitly "human-first" and has not been conceptually updated for agents (its
machine-consumer model is still scripts-and-pipes, not an LLM reading output
back into a context window). The agent-era guidance that does exist is real and
converging but fragmented across one vendor source (Anthropic's "Writing
effective tools for AI agents") and several practitioner posts, with genuine
contradictions (e.g. richer exit-code taxonomy vs. self-describing error
envelopes; auto-switching output by TTY vs. stable explicit formats).

This repo is unusually well-positioned: Clinkr already makes the typed machine
result first-class (`schema → handler → ClinkrExit<T>` with `resultSchema` plus a
separate `renderHuman`), ships per-command `--json-schema`, and emits a
deterministic machine envelope — which puts it ahead of clig.dev-as-written. But
a critique against the agent-era consensus found concentrated gaps: nothing for
output *volume* (no pagination/truncation/compaction/streaming), thin error
richness (`failure` carries no structured `data`; `error_type` is an
unconstrained free string), no danger/confirmation tiers, and two traps
(`negative` defaults to process exit 0; usage errors are not enveloped).

The Objective is to establish agent-era CLI design as a first-class, written-down
discipline for sdl-tools by: (1) a checked-in research survey of best practices
and competing positions with sources; (2) ADRs that resolve each contested
decision; (3) a durable design-authority skill (`sdl-cli-design`) that codifies
the rules as a Clinkr-grounded overlay; and (4) evolving Clinkr in parallel to
the agreed best practices — recording decisions for every identified gap, landing
the high-agreement changes, and parking the contested or large ones as backlog.

## Scope

- **Research survey doc** (checked into `docs/`): synthesize clig.dev, the
  agent-era sources (Anthropic; Speakeasy; Agent Layer; dev.to; others), and the
  Clinkr critique into one browsable map that captures *competing* positions with
  citations — not a single opinionated answer. This session's synthesis and
  Clinkr critique are the seed.
- **ADRs** under `docs/adr/` (existing sequential `NNNN-title.md` convention,
  `ADR-FORMAT.md` from the domain-modeling skill): one ADR per contested
  decision, each recording the decision *and* the dissenting position, so the
  emerging-discipline disagreements are preserved rather than flattened.
- **`sdl-cli-design` skill**: a Clinkr-grounded design authority (decided:
  Clinkr-grounded overlay; name `sdl-cli-design`; `normal`/ambient invocation via
  `areg`). Covers the basics as hard gates, the human-facing tier (clig.dev), the
  agent/`exec`-facing tier (agent-era consensus), naming, and a pre-ship
  checklist — each rule mapped to the Clinkr API that satisfies it, and current
  Clinkr limitations flagged as "design around until ADR lands."
- **Clinkr evolution (parallel)**: from the gap list, decide every item via ADR;
  land the high-agreement changes (e.g. structured `data` on failure exits,
  output compaction) with tests; park contested/large items as backlog rows.
- ADRs gate Clinkr code changes and any contested skill rules; uncontested skill
  scaffolding may proceed in parallel with the survey/ADR work.

## Non-Goals

- Not a CLI-*driving*/consumption skill. `sdl-cli-design` is about *authoring*
  well-designed CLIs, not teaching agents to invoke them.
- Not structural/DRY cleanup of the TypeScript CLIs or `asdl-core`/`clinkr` —
  that routes to `ts-cli-core-structural-cleanup` (currently paused behind the
  `sdl-extension-architecture` endgame).
- Not shell completion — that is owned by `clinkr-shell-completion`.
- Not a Clinkr rewrite, and not a commitment to close every identified gap.
  Contested and large items are explicitly allowed to be parked.
- Not forking or depending on upstream parser internals.

## Completion Criteria

- The research survey doc is checked in, covers human-first and agent-era
  guidance, and represents the contradictory positions with sources.
- An ADR exists in `docs/adr/` for each contested decision surfaced by the
  survey/critique, each recording the decision and the dissent.
- The `sdl-cli-design` skill is authored, registered via `areg` as `normal`, and
  reflects the ADR outcomes (including any "design around current Clinkr
  limitations" notes).
- The Clinkr changes the ADRs accept with high confidence are landed with tests;
  the remaining contested/large items are captured as backlog rows with enough
  context to resume.
- Evidence: targeted tests and relevant repo checks pass for any Clinkr change
  that lands.

## Assumptions and Risks

**Assumptions**

- The agent-era consensus is stable enough to commit decisions to now — the
  research showed independent sources converging on the core rules (structured
  output, non-interactive-first, token efficiency, structured errors). If the
  discipline shifts materially, ADRs may need revisiting (acceptable: ADRs are
  superseded, not silently edited).
- Most high-agreement Clinkr changes are additive/backward-compatible
  (e.g. adding `data` to failure exits, an opt-in compaction mode).

**Risks**

- **Python-parity contract**: Clinkr's machine envelope is documented as
  byte-identical to Python clinkr (`ensure_ascii`, key order, `indent=2`).
  Changing JSON output (e.g. compaction) or the envelope shape could break that
  parity contract — this needs an explicit ADR before any output-format change.
- **Coordination overlap**: agent-ergonomics Clinkr changes touch the same files
  as `ts-cli-core-structural-cleanup` (structural) and `clinkr-shell-completion`
  (completion). Risk of conflicting edits; mitigation is to keep each change
  independently reviewable and route by concern.
- **Sequencing vs. the extension-architecture pause**: structural Clinkr work is
  paused behind `sdl-extension-architecture`; it is an open question whether
  ergonomics changes here should also wait (see Open Questions).
- **Decision stalls**: a contested discipline can deadlock ADRs. Mitigation: an
  ADR records a decision plus dissent; it does not require consensus.
- **Skill/Clinkr drift**: the skill could prescribe rules Clinkr cannot yet
  satisfy. Mitigation: the skill explicitly flags current limitations to design
  around until the corresponding ADR/change lands.

## Open Questions

- Should `sdl-cli-design` be public (a `skills/<name>` symlink) or internal? A
  Clinkr-grounded overlay references the internal `@sdl/clinkr` package, and the
  skill-conventions bar public skills from referencing sdl-internal module paths
  — which pushes toward internal, but this needs an explicit call.
- Exit-code semantics are decided in ADR 0010: keep process exit codes coarse
  and stable (0 success, 1 semantic/operational failure, 2
  usage/invocation/config failure) and make the machine envelope the
  authoritative surface for detailed failure semantics through disciplined
  `error_type`/`code` plus structured `data`/details. The ADR preserves dissent
  for richer numeric taxonomies as useful for specialized shell-only automation
  but not Clinkr's default.
- Does any change to `--format json` output (compaction, streaming/JSONL,
  enveloping usage errors) violate the Python-parity contract, and if so is the
  contract still load-bearing? ADR required.
- Should the agent-ergonomics Clinkr changes proceed now or wait behind the
  `sdl-extension-architecture` endgame that currently pauses
  `ts-cli-core-structural-cleanup`?
