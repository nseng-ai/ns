# Trunk Re-verify: `@nseng-ai` Scope Rename, `restack` Fold, Parked-Row Drift

## Summary

Re-ran the forensic contract verification against trunk HEAD (2026-07-05),
two days after the 2026-07-03 trunk rebaseline. Every completed Work row still
holds structurally: zero `runRaw` / `LandPlanForFlow` / `preloadedShape` /
`flow-adapter-failure` / `plan-mapping` references in flow/ccc; `plan-mapping.ts`
and the five forwarder shims absent; `graphite-metadata-command.ts` absent; the
slice-added `LandContext` gateway methods present in `src/land/types.ts`;
`submit-detect.ts` imported only by `submit-gateway.ts` and its own test; the
regenerate-pr, failure-catalog, and land-stack scenario tests present with
`ScriptedExec` still the canonical land seam; CONTEXT.md's five land vocabulary
terms present; ADR 0014 and ADR 0026 present. Three material claims drifted and
were corrected in place:

1. **Workspace scope renamed `@ns` → `@nseng-ai`** after the 07-03 rebaseline
   (`master` commits 95d522a96 "Rename workspace package scope from @ns to
   @nseng-ai", 423bcdce4 folding imports to public `@nseng-ai` names). The
   package is now `@nseng-ai/flow`; subpaths `@nseng-ai/flow/api`,
   `@nseng-ai/flow/land/api`, `@nseng-ai/flow/land/testing`; CCC imports only
   the public `@nseng-ai/flow` root and `/api`. Folded through objective.md,
   roadmap.md's pointer, and orientation.md.
2. **`restackUpstack` folded into `restack({ scope })`.** The post-landing
   Graphite restack API refactor (`master` f61c89bdb, 7c93a30b0) renamed the
   slice-added `restackUpstack` gateway method to
   `restack({ scope: "branch-only" | "upstack" })` on `LandGraphiteGateway` —
   behavior preserved on the Land Domain Core, method name changed. The
   completion criterion's method list and the thesis verification line were
   corrected; this concretely confirms the standing assumption that
   post-landing trunk refactors build on the delivered shape rather than
   reverting it.
3. **Parked-row line counts drifted** from 514/132/250 to 518/137/314
   (`presentation.ts` / `land-presentation.ts` / `command-stream.ts` at
   `src/land/stack/`); `command-stream.ts` grew ~64 lines from external-call
   telemetry refactors. The premise decay risk is reinforced, not resolved.

Also corrected: a newer flow Objective `flow-land-large-stack-performance` is
now open (was not on the 07-03 active list). It owns land performance/telemetry
work built *on* the delivered four-gateway shape — not this record's
interface-depth or parked presentation scope — so the "only open flow
Objective" assumption was narrowed rather than a scope collision surfaced.

## Objective Impact

Contract verified and rebaselined; no completion state changed. The Objective
stays open on its single remaining gate: the Parked land-presentation row (#5)
must be promoted, re-scoped, or explicitly dropped with rationale (owner
judgment, not runner-executable), with full `just` validation green at close
time. No auto-closure: this is a live decision, so the refresh reports
open/`wrote`, not `closure-ready`.

## Follow-Ups

- Owner decision on Parked row #5 (promote / re-scope / drop) — the closure
  gate. Any promotion must start from a fresh inventory of the three
  presentation files given the repeated telemetry/confirmation churn.
- No overlap remediation needed with `flow-land-large-stack-performance`, but
  a presentation-row promotion should re-check its telemetry additions first.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
