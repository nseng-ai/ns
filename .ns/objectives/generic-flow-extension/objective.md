# Generic Flow Extension

## Thesis

The flow extension becomes a generic, README-documented extension that any Graphite-backed
repository can adopt and customize through extension points — not an ns-repo-shaped tool
that happens to live in a reusable package. The forcing function is README-driven
development: `references/README-draft.md` is the canonical user-facing contract, written
for an external adopter, and every repo-specific behavior it cannot honestly document
(hardcoded validation commands, skill names, prompts, recovery behavior) must move behind
an extension point or config before the README is true. The driving implementation slice
is validation gates: generalize submit's pre-submit hooks into named `flow.validation.*`
gates, add `ns flow validate <gate>`, and replace the hardcoded `code-just-fix` Pi
auto-fix bridge with a recovery prompt point.

## Scope

- The canonical flow README (`references/README-draft.md` until promotion): what flow is,
  every `ns flow` command, and how a consuming repo customizes flow via extension points.
- Validation gates: rename `flow.submit.pre` → `flow.validation.pre-submit`, a gates
  module with a stable failure-marker contract, and the `ns flow validate <gate>` command
  (fixed, flow-defined gate set; `pre-submit` initially).
- Validation-failure recovery: a `flow.validation.recovery` prompt point (default-on with
  a generic built-in prompt; repos override via `.ns/prompts/` or `ns.toml`), consumed by
  the Pi bridge via marker detection instead of stderr prose sniffing; this repo's
  override references `code-just-fix` as consumer config.
- A repo-specificity audit of the flow package: enumerate every ns-repo assumption
  (commands, prompts, model usage, skill references, trunk/stack assumptions) and drive
  each behind a point, config, or documented requirement.
- Extension-point documentation improvements needed for adopters: routing to
  `docs/guides/points.md` from agent entrypoints and a workflow-implementer section.

## Non-Goals

- Abstracting Graphite away: flow stays Graphite-native (`gt` is its identity); the
  graphite-dependency-boundary convention stands.
- Repo-defined gates via kernel pattern/wildcard point definitions — declined for now;
  the gate set is fixed and flow-defined (parked, see roadmap).
- `ns flow test` / `ns flow local-ci` sugar commands before `validate` proves out.
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
- `ns flow validate <gate>` and the `flow.validation.pre-submit` gate exist and are what
  `ns flow submit` runs; the hardcoded `code-just-fix` bridge is gone, replaced by the
  `flow.validation.recovery` prompt point with marker-based detection.
- The repo-specificity audit is recorded in `references/` and every finding is either
  resolved (moved behind a point/config), documented as an adopter requirement in the
  README, or explicitly parked with rationale.
- Full repo validation passes and the flow scenario/Pi tests cover the new surfaces.

## Assumptions and Risks

- **Assumption — fixed gates suffice.** Adopters can express their validation story by
  installing commands at flow-defined gates; nobody needs to mint gate names without a
  flow release. If a real adopter needs a custom gate, the parked kernel pattern-points
  design gets unparked (this assumption is cheap to disprove and the README will show the
  seam).
- **Assumption — the stderr marker is a sufficient harness contract.** Pi detects
  validation failures by a stable exported marker string in stderr. Safe today because
  gate failures use deterministic presentation (stderr passes verbatim); if submit's
  model-formatted failure path ever touches gate failures, the contract breaks — guard it
  with a test.
- **Assumption — default-on recovery is welcome.** Consumers get a generic auto-fix
  prompt after gate failures without opting in. If that proves surprising or noisy for
  adopters, flip to opt-in (the design isolates the default-prompt fallback so this is a
  small change).
- **Risk — genericization scope creep.** "Less specific to this repo" can swallow the pr
  -description model dependency, trunk assumptions, and Pi-host coupling. Mitigation: the
  audit produces an explicit list; each item is resolved, documented as a requirement, or
  parked — no silent expansion.
- **Risk — point-definition duplication.** First-party point definitions live in both
  kernel `builtInPointDefinitions` and flow's descriptor; this work deepens that
  duplication by one more point. Pre-existing debt owned by the descriptor-contract
  direction, not this Objective — but renames must touch both places in the same slice.
- **Risk — README drifts from implementation.** Mitigation: README settles first; each
  implementation slice cites the README section it makes true.

## Open Questions

- What does the repo-specificity audit actually find in `autobranch`, `autoslot`, `land`,
  `pull-trunk`, and the pr-description model path — and which findings are adopter
  requirements vs. genericization work?
- How does an adopter provide the LLM used for PR-description generation (and submit
  failure interpretation) — is that already injectable, and what does the README promise?
- Should `ns flow validate` (no arg) listing include per-gate installed commands or just
  gate names? (README currently says: gates with their installed commands.)
- Does the recovery prompt fire for `ns flow validate` failures under Pi, or only
  `submit`? (README currently says: any flow command that emits the marker.)
