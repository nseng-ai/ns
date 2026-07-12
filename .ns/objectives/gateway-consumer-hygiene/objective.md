# Gateway Consumer Hygiene

## Thesis

A three-agent audit of every git gateway in this repo found the gateway *layer*
healthy — eight domain gateways are correctly placed as consumer-owned seams —
but surfaced three systemic hygiene problems in how the canonical `GitGateway`
(21 methods, `ts/packages/capability-kit/src/git/contract.ts`) is consumed and
what the `@nseng-ai/capability-kit` `git` barrel exports:

1. **Over-wide consumers.** 12 of 14 packages consuming `GitGateway` type
   against the full interface while using a median of 2–4 methods; only
   handoffs and brmem narrow via `Pick`.
2. **Leaky kit barrel.** The `./git` barrel exports a flow-only `execNs*`
   exec-adapter family plus roughly six dead re-exports that no live consumer
   needs.
3. **Ad-hoc git mutations outside any seam.** The objectives runner gate, flow
   autobranch, and branch-context checkout mutate git without going through a
   gateway.

The resolving pattern is the three-tier Consumer Gateway / command-shape rule
now documented in `docs/conventions/consumer-gateways-and-command-shape.md`:
consumer-owned narrowed gateway interfaces own vocabulary; capability-kit owns
pure command-shape (promoted only with a second consumer); gateway-object
sharing is allowed only when exec channels coincide. This Objective lands that
convention and remediates the three findings.

## Scope

- **A — Docs bundle** (this slice): the convention doc, a capability-kit
  `AGENTS.md` admission test, a root `AGENTS.md` routing clause, an ADR 0019
  Status amendment resolving the `git` row toward `capability-kit-owned`, and a
  root `CONTEXT.md` **Consumer Gateway** term.
- **B — Kit export demotion**: move the flow-only `execNs*` family out of the
  `capability-kit` `git` barrel into flow, and drop the dead barrel re-exports.
- **C — Pick-narrowing exemplars**: convert a handful of 1–2-method
  `GitGateway` consumers to `Pick`-narrowed Consumer Gateways.
- **D — Seam the ad-hoc git mutations**: add the small set of kit contract
  verbs the mutations need, then route the objectives runner gate, flow
  autobranch, and branch-context checkout through gateways.

The `## Work` rows in `roadmap.md` pin the exact files, symbols, and mechanics.

## Non-Goals

- **A style-guard advisory rule for gateway width.** Deliberately deselected:
  the audit found the width problem better fixed by the Pick-narrowing
  exemplars (row C) and the convention doc than by a mechanical guard that
  would fight legitimate wide consumers.
- **Moving `RealGitGateway` out of `capability-kit`.** The ADR 0019 amendment
  in row A blesses `capability-kit-owned` for the git implementation; relocating
  it is explicitly out of scope.
- **Anything in the `capability-kit-promotions` Objective's Parked rows.** In
  particular its "anticipatory single-consumer gateways" row (flow
  `github-pr-gateway.ts`, reviews' Claude Code headless harness, slots
  diagnostics JSONL runner, graphite stack-walk/integrity renderers, clipboard
  gateway) stays parked there and is not pulled here.
- **The remaining READ-ONLY ad-hoc git callers** — flow
  trunk-pull/smart-restack/stack-squash, ccc cmux, pi worktree-status reads,
  and nscc. These are recorded as a Parked row for a later, deliberate pull,
  not remediated now. Row D seams only the *mutation* sites the audit flagged.
- PR submission, pushing, publishing, or any external-system mutation.

## Completion Criteria

- All `## Work` rows are `[x]` (row A lands with this Objective) with their
  changes complete: the docs bundle published, the `execNs*` family and dead
  re-exports gone from the kit barrel with all consumers repointed, the named
  Pick-narrowing exemplars converted, and the three ad-hoc mutation sites
  routed through gateways.
- New kit contract verbs (row D1) ship on `GitGateway`, `RealGitGateway`, and
  `InMemoryGitGateway` together with tests and the new `KnownGitErrorCodes`.
- Failure-catalog messages for the seamed mutation sites stay byte-identical
  where the row pins that (flow autobranch).
- Targeted package tests and repo validation (`just`) pass on the delivering
  branches; evidence recorded in roadmap notes or Semantic Updates.
- The Parked row remains recorded; triaging or executing it is not required for
  closure.

## Definition of Progress

Progress is keepable when:

- a `## Work` row's change is complete — the demotion has no dual live copies,
  a converted consumer compiles and passes tests against its narrowed Consumer
  Gateway, or a seamed mutation site routes through the gateway with tests —
  and the row is checked off with evidence noted;
- a kit contract extension (row D1) lands additively with fake/real parity and
  test coverage.

Do not keep changes that:

- leave both a kit barrel export and its moved-into-flow copy live at once;
- widen a consumer that a row set out to narrow;
- touch code inside the boundaries listed under Non-Goals (especially the
  read-only ad-hoc callers or the `capability-kit-promotions` Parked rows).

Useful evidence includes: native `tsc` typecheck, targeted Vitest for the touched
packages, `just ts-test-typescript-style-guard`, and a green `just` run.

## Runner Policy

This Objective is execution-friendly for `objective-next` and
`objective-autorun` under the boundaries below (mirroring
`capability-kit-promotions`).

- Direct execution is allowed when: implementing a single `## Work` row within
  its pinned design, on a Graphite feature branch (never on `master`).
- Steer or ask first when: a kit contract extension proves non-additive
  (e.g. the new git verbs break an existing consumer); a demotion surfaces a
  hidden consumer of a moved symbol; a seam requires new exec-adapter wiring
  the row did not anticipate; or when tempted to pull the Parked read-only
  callers into Work.
- How work may change files and be left: edits land as commits on Graphite
  feature branches via `gt`, one coherent row (or a clean slice of one) per
  checkpoint; the worktree is left clean; no commits on `master`.
- Validation before keeping work: native `tsc` typecheck plus targeted Vitest for every
  touched package, then `just`, all green.
- What will not happen unless explicitly requested: PR submission or update,
  pushing, publishing, GitHub issue/PR mutation, or any external-system write.

## Assumptions and Risks

Assumptions:

- The audit findings are accurate against the branch that lands row A: the
  `execNs*` family and the roughly six dead re-exports are still in the
  `capability-kit` `git` barrel (`ts/packages/capability-kit/src/git/index.ts`),
  and the named Pick-narrowing targets still consume `GitGateway`. Re-verify
  each row's file/symbol at execution time before deleting or moving.
- The new git verbs (row D1) — `hasStagedChanges`, `checkStagedWhitespace`,
  `unstageAll`, `checkout` — can be added additively to `GitGateway` without
  breaking the existing consumers of the contract.
- The three mutation sites' existing exec channels can be preserved: flow
  autobranch keeps its multi-tool exec channel alongside the new
  `AutobranchGitGateway`, and the objectives runner gate can reach `ctx.git`.

Risks:

- **Autobranch failure-catalog drift.** Routing autobranch's plain-git ops
  through `AutobranchGitGateway` must keep failure-catalog messages
  byte-identical, or downstream message assertions silently break.
- **Objectives gate exec seam.** The objectives runner gate runs over the
  extension `exec` seam; wiring its index-clean and staged-whitespace checks
  through `ctx.git` is the same exec-seam wiring risk the
  `capability-kit-promotions` objectives row carried (steer-first trigger, not
  a license to widen scope).
- **Missed consumer on demotion.** Deleting the dead re-exports or moving the
  `execNs*` family could miss a consumer if new imports landed after the audit;
  the demotion must be grep-verified at execution time.

## Open Questions

- Do any of the remaining READ-ONLY ad-hoc git callers (the Parked row) merit
  their own Consumer Gateways, or are they better left as direct reads? Decide
  when that row is pulled into Work, not now.

## Closure

Closed 2026-07-07. Every `## Work` row (A, B, C, D1–D4) landed and is verified
against trunk HEAD (`9fa6a502d`):

- **A — Docs bundle**: `docs/conventions/consumer-gateways-and-command-shape.md`
  and `ts/packages/capability-kit/AGENTS.md` exist; root `AGENTS.md` routes to
  the convention doc on the "Keep units small and testable" bullet;
  `docs/adr/0019-gateway-real-implementation-placement-gate.md` amends the `git`
  row toward `capability-kit-owned`; root `CONTEXT.md` carries the **Consumer
  Gateway** term.
- **B — Kit export demotion**: the `execNs*` family
  (`execNsCommand`, `createNsCliExecAdapter`, `execNsGit`,
  `readNsGitPorcelainStatus`) is gone from
  `ts/packages/capability-kit/src/git/index.ts` and now lives in flow
  (`ts/packages/capabilities/flow/src/ns/`).
- **C — Pick-narrowing exemplars**: `WorktreeStatusGitGateway`,
  `PrAddressGitGateway`, `RetrosGitGateway`, and `AregGitGateway` are in place
  in their consumer packages.
- **D1 — Kit contract verbs**: `hasStagedChanges`, `checkStagedWhitespace`,
  `unstageAll`, and `checkout` ship on `GitGateway`
  (`ts/packages/capability-kit/src/git/contract.ts`), the real implementation
  (`git/index.ts`), and the in-memory fake (`git/git-testing.ts`); the four
  `KnownGitErrorCode` values (`git_staged_probe_failed`,
  `git_staged_whitespace_failed`, `git_unstage_failed`, `git_checkout_failed`)
  are defined and covered by tests.
- **D2 — Objectives runner gate**:
  `ts/packages/capabilities/objectives/src/runner/gate.ts` routes its
  index-clean and staged-whitespace checks through `ctx.git`.
- **D3 — Flow autobranch Consumer Gateway**: `AutobranchGitGateway`
  (`ts/packages/capabilities/flow/src/autobranch/git-gateway.ts`) is threaded
  through `upstream.ts`, `latest-commit-preparation.ts`,
  `latest-commit-transaction.ts`, and `dirty-transaction.ts`.
- **D4 — branch-context checkout**:
  `ts/packages/capabilities/branch-context/src/pi/gt/upstack-impl-launch.ts`
  takes `git: Pick<GitGateway, "checkout">`.

Per-row validation (`just` green plus targeted Vitest) is recorded in the
`roadmap.md` Work notes. The one remaining open item is the **Read-only ad-hoc
git callers** Parked row, which the Completion Criteria explicitly exclude from
closure ("triaging or executing it is not required for closure"); it stays
recorded for a later deliberate pull.
