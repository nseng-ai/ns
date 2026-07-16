---
edges:
  - objective: cloud-execution
    annotation: Remediates the surviving findings from the thermo-nuclear review of cloud-execution's dispatch stack (PRs #3587–#3620); the probe-retirement slice is gated on that objective's steel-thread controlled Pi rerun, and hello-probe's fate is settled with its setup-skill roadmap row.
  - objective: objective-runner-external-writes
    annotation: Consumes that Objective's publish-capable Runner steel thread before this record can use the desired autorun model that pushes verified local commits and maintains an existing PR summary without parent interludes.
---

# Cloud Dispatch Thermo Review Follow-Ups

## Thesis

The 2026-07-14 thermo-nuclear review of the cloud-dispatch stack (PRs #3587–#3620,
the new `ts/packages/capabilities/vercel` package) found an architecture that is sound
and disciplined but carrying removable scaffolding: a dead second failure channel
threaded through every dispatch/supervision step, ~1,300 lines of probe machinery past
its own recorded retirement trigger, and a tier of medium/low structural cleanups. This
objective is the single ledger for burning those findings down — behavior-preserving
restructurings that delete concepts, not rearrange them — until every surviving finding
is fixed with evidence or declined with a recorded decision.

The reconciled findings live in `references/review-findings.md` (IDs `H*`/`M*`/`L*`,
referenced by roadmap rows). `references/review-record.md` preserves the review
process, the adversarially dropped findings (not to be re-proposed without new
evidence), and the clean attestations (not to be re-flagged).

## Implementation Status

M4+M5 and H9 are locally complete. The extracted `dispatch-client` seam is now consumed
by the separate Graphite-aware source-publication feature without restoring host-surface
ownership. Follow-up review refined the package-shared `[dispatch]` parser into the neutral
`src/config/` owner while dispatch-client retains invocation-specific preflight refinement.
Remaining thermo findings stay open and independent; this consumption is not
evidence that any unrelated review row is complete, and no live dispatch/deployment
verification is claimed.

## Scope

- All surviving findings from the reconciled ledger, both HIGHs included: the dual
  failure channel (H1), the probe retirement slice (H2, gated — see edge), the
  dispatch-client extraction (M4+M5), and the remaining mediums and themed low batches.
- Doc-contract coherence repairs in `.ns/objectives/cloud-execution/references/` and
  the one stale cross-objective edge annotation (M18, Batch E).
- Recording a decision (fix or decline-with-rationale) for every row; declining is a
  legitimate resolution when the remedy stops paying for itself.

## Non-Goals

- No behavior changes to the dispatch contract, wire formats, or credential flows —
  every remedy here is behavior-preserving by construction.
- Not the controlled Pi rerun or steel-thread closure itself; cloud-execution owns
  those. This objective only sequences behind them where gated.
- No backend-agnostic executor abstraction and no merging of the three GitHub
  channels — both explicitly sanctioned as-is (orientation Avoid list; clean
  attestations).
- Not re-running or extending the review; dropped findings stay dropped absent new
  evidence.
- No slug/package renames beyond what the dispatch-client extraction (M4+M5) itself
  requires.

## Completion Criteria

- Every `## Work` row is `[x]` with completion evidence (validation via `just` plus the
  targeted suites recorded in row notes or Semantic Updates), or resolved as a recorded
  decline in a Semantic Update.
- H1: exactly one error-propagation convention across the package's gateway seams; the
  never-produced result arms and their paired duplicate tests are gone.
- H2: the probe retirement slice has landed after the steel-thread gate cleared, with
  hello-probe's fate recorded as an explicit decision tied to cloud-execution's
  setup-skill row.
- M18/Batch E: each dispatch contract (env table, preflight checklist, deploy gate) has
  exactly one full normative statement with links elsewhere, and the stale
  harness-session-generation edge annotation matches the adopted architecture.
- `ns objective check --all` passes after the edge-annotation fix (M18.1 edits a
  counterpart record's frontmatter).

## Assumptions and Risks

Assumptions (each falsifiable by a future update):

- The real sandbox/dispatch adapters never return `ok: false` in production — verified
  during review by reading all six methods; if any adapter grows a genuine soft-failure
  return before H1 lands, the H1 remedy must be re-derived rather than applied
  mechanically.
- The controlled Pi rerun does not depend on probe machinery — challenger-verified (the
  rerun exercises the dispatch workflow). If that proves wrong, H2 defers further
  rather than shrinking.
- The hello-probe path remains referenced by the future setup skill's acceptance
  procedure (`dispatch-setup-and-preflight.md`); its retirement is therefore a decision
  to be made with that row, not collateral of H2.

Risks:

- **H1 touches the live-proven dispatch path** right around steel-thread closure.
  Mitigation: it is a mechanical deletion of dead arms with the existing throw-path
  tests retained; land it as its own slice with full validation, not bundled with
  behavior work.
- **The dispatch-client extraction (M4+M5) was de-risked locally.** The feature and
  its tests moved intra-package without a new public export, while the H9
  checkout-root constant removed the non-greppable duplicate path. Focused package
  tests and typecheck plus repo-wide TypeScript format, lint, and style-guard checks
  passed; no live dispatch or deployment verification is claimed.
- **Doc restatements (M18.4) keep drifting while rows are open** — each week the twin
  env tables/checklists survive, divergence compounds. This is the argument for doing
  Batch E early despite its LOW-adjacent weight.
- **Deliberate-shortcut pair (recorded per convention):** the anchor-PR
  read-modify-write without concurrency guards (L9) is accepted for now because
  dispatch owns the PR and windows are small; its upgrade is `If-Match`/ETag
  conditional PATCH plus full comment pagination, and the pair retires together when
  dispatch volume makes collisions plausible.

## Open Questions

- H1 convention choice: delete the dead `ok: false` arms (review-preferred) or
  normalize in adapters like `real-sandbox-gateway.ts`? Either satisfies the
  completion criterion; the row decision records which and why.
- Does H1 land in the review stack itself before merge, or as the first follow-up slice
  after? (The row closes with whichever evidence materializes.)
- Hello-probe: retained as the setup skill's acceptance tool (then L21's wire-contract
  dedupe applies) or retired with the other probes (then L21 is moot)?
