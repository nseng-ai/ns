---
edges:
  - objective: slot-gt-restack-preflight
    annotation: Upstream dependency; the restack-resolve and linearize-descendants fold-in slices consume its restack-preflight and descendants-report primitives instead of hand-rolled fact gathering.
  - objective: stack-repair-loop-hardening
    annotation: Upstream dependency; the fix-gh-stack fold-in slice is sequenced behind its skill rewrite and `ns address exec` triage push-down so Flow absorbs the hardened loop, not the leaky one.
---

# Fold stack-state workflows into Flow

## Thesis

Flow owns the outer loop of stacked-PR development — create (`cp`, `autobranch`),
publish (`submit`), finish (`land`, `pull-trunk`) — but hands users back to raw `gt`
for the middle of a stack's life: keeping it rebased, green, and well-shaped. Four
existing agent-driven skills fill exactly that gap, and all four pass the Flow domain
test (they mutate or traverse stack state, unlike the review-conversation domain that
stays in `ns address`): `code-gt-restack-resolve`, `code-just-the-stack`,
`code-fix-gh-stack`, and `code-gt-linearize-descendants`. Fold them into Flow as a
second, agent-driven workflow tier using the shape already proven by pr-address:
deterministic cores on sanctioned exec surfaces, driver skills renamed into the
`ns-flow-*` family, and each workflow documented in the Flow README's workflows tier
("commands you run" vs. "workflows your agent drives").

## Scope

- Per-workflow fold-in slices, each landing: the skill renamed into the `ns-flow-*`
  family with cross-references updated (per `docs/conventions/skill-conventions.md`
  as it stands at slice time), the skill's deterministic facts consumed from
  sanctioned exec surfaces where primitives exist, and the workflow documented in the
  Flow README workflows tier. Renames land with their slice, never as a big-bang
  rename pass.
- Establish the README workflows tier itself with the first slice, including the
  boundary reference to `ns address` for the review-conversation step of the loop.
- Generalize `code-just-the-stack`'s hardcoded `just` through a Flow extension point
  so the workflow is portable to consuming repositories; this design decision is owned
  here.
- Consume upstream primitives where their owning Objectives land them: restack
  preflight and descendants-report from `slot-gt-restack-preflight` (`ns slot gt
  exec`), repair-loop triage facts from `stack-repair-loop-hardening`
  (`ns address exec`). New `ns flow exec` primitives only where a workflow needs
  deterministic facts that have no sanctioned home elsewhere.

## Non-Goals

- No fold-in of `pr-address`: review-thread triage operates on the conversation about
  the code, not stack state; it stays in the `ns address` domain and appears in the
  Flow README only as a boundary reference in the loop narrative.
- No fold-in of `code-smush` (experimental, opt-in), `code-thermostack`, or
  `plan-stack-from-findings` (review/planning domain — they emit stacks, but their
  subject matter is findings).
- No full CLI absorption: the workflow tier stays skill-driven over exec primitives;
  the agentic loops do not become `ns flow <command>` orchestrations.
- No full value-led Flow README restructure (four value pillars, everyday-loop
  narrative, reference below the fold): that is a separate effort this record must not
  gate. This record's README scope is the workflows tier only.
- No migration of primitives out of sanctioned homes: facts already landing on
  `ns slot gt exec` or `ns address exec` are consumed there, not duplicated onto
  `ns flow exec`.

## Completion Criteria

- All four skills are members of the `ns-flow-*` family, with cross-references in
  other skills and docs updated (including the `code-just-the-stack` →
  `code-gt-restack-resolve` and `code-fix-gh-stack` → `code-gt-restack-resolve`
  routing references).
- `code-just-the-stack`'s successor resolves its validation command through a Flow
  extension point rather than a hardcoded `just`.
- The Flow README documents the workflows tier with all four workflows and the
  `ns address` boundary reference.
- Each slice's deterministic facts come from sanctioned exec surfaces where the
  upstream primitives have landed; no new hand-rolled fact-gathering pipelines are
  introduced by the fold-ins.
- Repo validation (`just`) green as completion evidence per slice.

## Assumptions and Risks

Assumptions:

- **The two-tier shape fits these workflows.** pr-address (deterministic `ns address
  exec` primitives + a driver skill) is the template; these four are assumed to
  decompose the same way. If a workflow's judgment and mechanics cannot be separated,
  revisit the slice rather than forcing a hollow exec surface.
- **The stack-state domain test is the Flow boundary.** "Mutates or traverses the
  stack itself → Flow; operates on the review conversation → address" was settled in
  the creation interview and drives both scope and non-goals; a future update that
  disproves it should reshape scope explicitly.
- **Upstream Objectives land their primitives.** `slot-gt-restack-preflight` delivers
  restack-preflight and descendants-report; `stack-repair-loop-hardening` delivers the
  hardened skill and enriched `branch-pr-checks`. This record consumes rather than
  duplicates; it does not take over their scope if they stall.
- **Graphite dependence stays within sanctioned boundaries.** The driver skills are
  Graphite-native like Flow itself; any new `ns flow exec` primitive must respect
  `docs/conventions/graphite-dependency-boundary.md` — Graphite facts route through
  `slot gt exec` (the sanctioned exception) rather than adding new runtime Graphite
  dependencies.

Risks:

- **Upstream stall gates the back half.** Slices ③ (linearize) and ④ (fix-gh-stack)
  are sequenced behind the two edge counterparts. The gates live as roadmap prose;
  the record itself is not blocked because slices ① and ② are ungated.
- **Rename ripple.** The `code-*` names are cross-referenced by other skills and docs;
  a missed reference leaves a dangling route. Mitigation: renames land with their
  slice, each with a reference sweep, verified via `areg check` / `areg skill show`.
- **Naming policy may move underneath.** The open `skill-management-subsystem`
  Objective may change skill naming or registration conventions mid-flight; each
  slice follows the conventions doc as it stands at slice time rather than assuming
  today's rules.

## Open Questions

- Validation extension point for the just-the-stack successor: a new point (e.g.
  `flow.validate`) or reuse of `flow.submit.pre`? Resolve at slice ② start.
- Rename target for `code-just-the-stack` once `just` is no longer hardcoded — the
  current name bakes in a repo-specific command (e.g. `ns-flow-validate-stack`).
- Whether any of the four workflows needs a new `ns flow exec` primitive beyond what
  the upstream Objectives land, decided per slice against the "no sanctioned home
  elsewhere" rule.
