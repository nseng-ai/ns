---
edges:
  - objective: flow-slots-opt-in
    annotation: "Dedicated follow-up owning the audit's slots finding: flow's hard @nseng-ai/slots dependency becomes an opt-in, presence-detected enhancement; this objective's audit only records the finding and its README documents the outcome."
---

# Generic Flow Extension

## Thesis

The flow extension becomes a generic, README-documented extension that any Graphite-backed
repository can adopt and customize through extension points — not an ns-repo-shaped tool
that happens to live in a reusable package. The forcing function is README-driven
development: `references/README-draft.md` is the canonical user-facing contract, written
for an external adopter, and every repo-specific behavior it cannot honestly document
(hardcoded validation commands, skill names, prompts, recovery behavior) must move behind
an extension point or config before the README is true. The driving implementation slice
is deliberately submit-specific: retain submit's existing `flow.submit.pre` check seam,
add a stable failure-marker contract, and give the Pi bridge a consumer-configurable
recovery prompt. A standalone validation/check command and a general gate taxonomy are
deferred until users or agents demonstrate a need to run a flow-owned check independently
of the operation it guards.

## Scope

- The canonical flow README (`references/README-draft.md` until promotion): what flow is,
  every `ns flow` command, and how a consuming repo customizes flow via extension points.
- Submit pre-checks: retain the `flow.submit.pre` point and submit-specific implementation,
  while adding a stable failure-marker contract for harness recovery. Do not introduce a
  public standalone command or general validation-gates abstraction in this slice.
- Submit-check recovery: a submit-scoped prompt point (default-on with a generic built-in
  prompt; repos override via `.ns/prompts/` or `ns.toml`), consumed by the Pi bridge via
  marker detection instead of stderr prose sniffing; this repo's override references
  `code-just-fix` as consumer config. Settle the exact point id in the README before
  implementation.
- A repo-specificity audit of the flow package: enumerate every ns-repo assumption
  (commands, prompts, model usage, skill references, trunk/stack assumptions) and drive
  each behind a point, config, or documented requirement.
- Extension-point documentation improvements needed for adopters: routing to
  `docs/guides/points.md` from agent entrypoints and a workflow-implementer section.

## Non-Goals

- Abstracting Graphite away: flow stays Graphite-native (`gt` is its identity); the
  graphite-dependency-boundary convention stands.
- A standalone `ns flow validate`/`check` command or general flow-validation gate
  taxonomy without a demonstrated independent execution workflow (parked, see roadmap).
- Repo-defined gates via kernel pattern/wildcard point definitions.
- `ns flow test` / `ns flow local-ci` sugar commands.
- A structured machine-failure envelope across the CLI/Pi boundary (the stderr marker
  constant is the contract for now).
- Actually distributing/installing flow into a second repository (adoptability is the
  bar; a second consumer is not).

## Completion Criteria

- The README is settled through the readme-driven-development loop (coherent product
  documentation, no silently invented commitments) and **promoted** to
  `ts/packages/capabilities/flow/README.md`, with this Objective's reference repointed at
  the promoted doc. The Objective is not complete while the canonical contract lives only
  under `references/`.
- `ns flow submit` continues to run checks installed at `flow.submit.pre`; failures carry
  a stable marker that the Pi bridge detects and routes through a generic, consumer-
  configurable, submit-scoped recovery prompt point. Flow package code contains no
  repo-specific recovery skill or prompt reference.
- The repo-specificity audit is recorded in `references/` and every finding is either
  resolved (moved behind a point/config), documented as an adopter requirement in the
  README, or explicitly parked with rationale.
- Full repo validation passes and the flow scenario/Pi tests cover the new surfaces.

## Assumptions and Risks

- **Assumption — submit-specific checks suffice.** The only proven flow-owned check is
  pre-submit, and callers can rerun `ns flow submit` after recovery. Revisit a standalone
  command only when users or agents need to execute a flow-owned check independently of
  the operation it guards; a second internal check alone does not prove a public CLI job.
- **Assumption — the stderr marker is a sufficient harness contract.** Pi detects
  pre-submit check failures by a stable exported marker string in stderr. Clinkr renders
  the raw marker line for a negative result and prefixes failure results with `error:`;
  harnesses must match either complete line rather than surrounding prose. Safe today
  because both submit paths classify these failures as deterministic; if submit's
  model-formatted failure path ever touches them, the contract breaks — guard it with a
  test.
- **Assumption — default-on recovery is welcome.** Consumers get a generic auto-fix
  prompt after pre-submit check failures without opting in. If that proves surprising or
  adopters, flip to opt-in (the design isolates the default-prompt fallback so this is a
  small change).
- **Assumption — the ns model service is the adopter seam.** The audit verified that Flow
  receives text generation through the ns command context and selects model refs through
  documented environment variables. Adopters must provide a working ns model provider and
  select alternatives when the built-in model ref is unavailable; Flow does not need a
  second model gateway or model point.
- **Risk — genericization scope creep, bounded by audit evidence.** The completed audit in
  `references/repo-specificity-audit.md` separates four resolve clusters from intrinsic
  documented requirements and explicitly parked compatibility debt. Repository identity,
  Graphite machine facts, and point-default fidelity are now resolved; Pi ownership remains.
  Do not silently expand those clusters into Graphite abstraction, merge-strategy
  configuration, or a general CLI failure protocol.
- **Risk — point-definition duplication remains fallback debt.** First-party point
  definitions still live in both kernel `builtInPointDefinitions` and Flow's descriptor.
  Production prompt resolution overlays the preloaded Flow descriptor so packaged default
  paths and manifest provenance remain descriptor-owned; the SDK mirror is definition-only
  fallback metadata and deliberately does not claim the PR-description packaged default
  without descriptor evidence. Consolidating the broader preinstalled catalog remains
  separate descriptor-contract work.
- **Risk — README drifts from implementation.** Mitigation: README settles first; each
  implementation slice cites the README section it makes true.

## Open Questions

No product question remains from the repo-specificity audit. New steering is required only
if implementation evidence invalidates a recorded disposition or an adopter demonstrates a
workflow for one of the parked concerns.
