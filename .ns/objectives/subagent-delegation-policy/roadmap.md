# Roadmap

Implement as a fresh Graphite branch/stack off `master` — deliberately independent of
`add-session-logs-to-handoffs` / PR #3561, deviating from the originating handoff's
child-branch suggestion because there is no code dependency. The motivating evidence and
next-step sketch live in handoff `delegate-preexploration-guidance` on branch
`add-session-logs-to-handoffs`; the first row subsumes that handoff's next steps.

## Work

- [ ] Define and land the canonical policy content: purpose, pre-exploration decision
      gate at task intake, decision ladder, context-economy rules, and named anti-patterns
      (including parent-heavy exploration with late review-only delegation). Resolve the
      canonical-home open question via `docs/conventions/platform-and-consumer.md`, rewrite
      the doctrine preamble and per-agent doctrine sections accordingly, and add tests
      asserting the gate and anti-pattern content in the assembled doctrine.
      Evidence: targeted `ns-pi-subagents` tests and `just` pass.
- [ ] Point the doctrine's context-economy rules at the canonical convention
      `docs/conventions/agent-context-economy.md` (introduced by branch
      `evidence-inheritance-context-economy-policy`; current branch/PR evidence, not yet on
      `master`) by reference rather than restatement, so the convention stays the single home
      and the injected doctrine stays compact. Carries a cross-branch dependency on that
      doc landing (or landing atomically with this work).
      Evidence: doctrine references the convention; targeted `ns-pi-subagents` tests and
      `just` pass.
- [ ] Apply the surface contract: reduce `promptGuidelines` to per-call mechanics,
      reduce per-agent `delegationDoctrine` to agent-specific trigger rows, wire or delete
      the dead `promptSnippet` fields, strip parent-policy echoes from the child prompt
      bodies, and document the surface contract plus doctrine coverage in the package's
      AUTHORING.md/README.
      Evidence: targeted `ns-pi-subagents` tests and `just` pass.
- [ ] Enforcement hardening: contract tests that keep surfaces in their lanes so
      duplication and policy rot fail loudly. May fold into the previous row if small once
      the enforcement-depth open question is settled.

## Parked

- Quantitative delegation thresholds (token/file counts) — parked until repository
  evidence supports specific numbers.
- Runtime verification loop that the gate actually fires in real sessions (e.g., a
  Context Profiler follow-up on post-landing sessions) — valuable validation of the
  behavioral fix, but not blocking policy landing.
