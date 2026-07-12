# Seam design settled: Vercel-native, no pluggability overpromise

## Summary

The seam-and-capability-design roadmap row is settled, decided in a grill
session on 2026-07-12 and recorded with rationale against alternatives in
`references/seam-design.md`. The headline is a deliberate reversal of this
objective's own morning-of thesis: instead of "two thin seams with
pluggable backends," cloud dispatch is **Vercel-native and says so** — the
user's steer was to name the package after Vercel and *not overpromise
generality*.

The eight decisions:

1. **Package**: `@nseng-ai/vercel` at `ts/packages/capabilities/vercel` —
   one package housing the `ns dispatch` command group, the Sandbox
   executor, and the Workflows jobs leg; flow's export shape as structural
   precedent. Extension group is `dispatch`, so package name (the coupling)
   and command noun (the action) intentionally differ.
2. **Gateways speak Vercel vocabulary** — ordinary gateway-plus-fake
   hygiene applies, but there is no backend-agnostic executor contract,
   internal or public (vendor-named-gateway precedent:
   `GraphiteStackGitGateway`). Methods name what dispatch needs, not the
   SDK 1:1.
3. **GitHub-compute pluggability dropped entirely** — audit row,
   no-vendor-types completion criterion, orientation Avoid line, Scope
   bullet, and open question all deleted, not parked.
4. **Run handle lives on the anchor PR** — stamped at submission; the jobs
   TUI enumerates anchor PRs and queries Vercel observability per handle.
   No local ledger, no Vercel-side index.
5. **Anchor identity is the `dispatch/` branch prefix** — one convention is
   both the user-visible naming scheme and the TUI's enumeration filter.
6. **The deployable lives inside the package** — Workflows/cron entrypoints
   and Vercel project config in a subdir of `capabilities/vercel`. Jobs
   contract unchanged: schedule and supervise only; the body invokes the
   same dispatch core; never merge without human review.
7. **Kernel commands**: `ns dispatch plan <plan-ref>`,
   `ns dispatch prompt <text>`, and `ns dispatch handoff <ref>` (predefined
   continuation prompt baked in); `/ns:dispatch:session` is Pi
   capture-then-call sugar. No backend/harness/model flags anywhere.
8. **Repo configuration is a typed `[dispatch]` table in repo-root
   `ns.toml`** via the kernel's manifest-declared settings mechanism
   (ADR 0031); secrets stay on the Vercel project per the settled
   credentials story.

Why the reversal is sound rather than churn: the pluggability stance was
inherited from the wayfinding era and had never been paid for — no second
backend exists or is scheduled, and the abstraction tax (vendor-neutral
contract design, the audit row, translation layers in tests) would have
been paid on every slice. Git-as-state-plane, which is what actually keeps
the capability thin, is untouched. The prose this supersedes is in the
consolidation and README-settled updates from earlier today; per update
immutability those records stand as history.

## Objective Impact

- `references/seam-design.md`: new — the decision record for this row.
- `references/README-draft.md`: reversal folded in — Vercel-native "Under
  the hood," `plan|prompt|handoff` kernel inventory, `ns dispatch handoff`
  under `/ns:dispatch:session`, `dispatch/` prefix and run-handle stamping
  in "The anchor PR," `ns.toml` `[dispatch]` in "Setup," TUI plumbing
  settled (open questions now: TUI command name / push notification only).
- `objective.md`: Thesis rewritten around the one Vercel-native package;
  Scope bullets updated (package identity, Vercel-vocabulary gateways,
  TUI plumbing) and the pluggability bullet deleted; Non-Goals now names
  backend pluggability itself; Completion Criteria updated (promotion home
  `ts/packages/capabilities/vercel/README.md`, `handoff` command,
  `[dispatch]` config, seam-design-note criterion replacing the
  no-vendor-types one); churn-risk mitigation reworded; GitHub-graduation
  open question resolved by removal.
- `roadmap.md`: seam-design row `[x]` with the settled summary; steel
  thread now gated by credentials only; session row names
  `ns dispatch handoff`; TUI and Claude-Code-adapter rows reworded to the
  settled plumbing; GitHub-pluggability audit row deleted; README-promotion
  row names its home.
- `orientation.md`: re-derived — Direction now states Vercel-native /
  no-pluggability; Avoid line flipped from "no vendor types in package
  APIs" to "don't invent a backend-agnostic executor abstraction."

## Follow-Ups

- Next row (now the only gate on the steel thread): the credentials slice,
  including the per-run scoped git-credential minting decision
  (fine-grained PAT vs. GitHub App installation token) recorded as a
  Semantic Update.
- The `vercel link`/OIDC part of the credentials row can now assume the
  Vercel project roots at the package's deployable subdir.
- Steel-thread implementation details deliberately left open: exact
  `dispatch/<...>` suffix scheme and the run-handle stamp mechanics
  (PR-description block vs. bot comment).
