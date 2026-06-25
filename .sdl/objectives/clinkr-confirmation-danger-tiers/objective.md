# Clinkr Confirmation Danger Tiers

## Thesis

This is a focused subobjective of `agent-cli-design-discipline`: decide and implement SDL/Clinkr's confirmation and danger-tier policy before the broader `sdl-cli-design` work proceeds. The policy should preserve the human-first CLI value of clear interactive confirmations while making agent/script behavior deterministic, non-blocking, and explicit.

The subobjective exists to keep policy and code close together: write the confirmation/danger-tier ADR, audit Clinkr against the accepted policy, and make the minimal framework/runtime/schema/test changes needed so Clinkr behavior matches that policy where appropriate. Broader danger-tier framework APIs should be extracted only when the ADR/audit shows concrete need.

## Scope

- Write the next ADR for confirmation and danger tiers, preserving dissent between first-class framework tiers and command-local flexibility.
- Define the command-authoring policy for safe operations, scoped mutations, destructive/external mutations, high-blast-radius operations, confirmations, `--yes`, `--force`, dry-run/preview behavior, and non-interactive/agent-safe execution.
- Treat Tier 3 as the highest danger band: high blast radius, irreversible or hard-to-review effects, broad external mutation, or computed target sets where a wrong preview could cause large damage.
- Standardize Tier 3 authorization on `--force` / `-f`: Tier 3 commands refuse the high-blast-radius operation by default and require `--force`/`-f` (the established short alias on `brmem put`, `handoff delete`, `handoff gc`, `slot gc`) to proceed; Tier 2 scoped destructive operations use `--yes` / `-y`. Individual commands may layer a typed `--confirm <value>` on top of `--force` when warranted.
- Audit existing Clinkr confirmation/interaction behavior against the accepted ADR.
- Implement the smallest appropriate Clinkr/framework changes, with tests, so framework behavior matches the accepted policy.
- Feed the accepted policy and implementation evidence back into `agent-cli-design-discipline`, and ensure the future `sdl-cli-design` skill can encode the rule without contradicting Clinkr behavior.

## Non-Goals

- Not a full rewrite of Clinkr interaction APIs.
- Not a mandate to add first-class danger-tier metadata unless the ADR/audit shows it is necessary.
- Not a repo-wide migration of every existing destructive SDL command unless a specific mismatch blocks the policy from being true.
- Not the full `sdl-cli-design` skill authoring objective; this subobjective should unblock that work by resolving and implementing the danger-tier slice.
- Not a generic task database or execution policy; ordinary Objective tracking remains planning-first.

## Completion Criteria

- A confirmation/danger-tier ADR is added under `docs/adr/` and records both the accepted policy and the dissenting positions.
- The ADR explicitly covers tiers, non-interactive behavior, prompts, `--yes`, `--force`, dry-run/preview expectations, and when generic confirmation is acceptable for severe operations.
- Clinkr is audited against the accepted ADR, with any framework/runtime/schema/test gaps identified.
- Appropriate minimal Clinkr code changes are implemented so framework behavior matches the accepted policy; if no framework change is justified, the audit/ADR says why and parks the broader API question deliberately.
- Targeted tests and relevant repo checks pass for any Clinkr code changes.
- The parent `agent-cli-design-discipline` Objective is updated or otherwise left with clear handoff context so `sdl-cli-design` can encode the accepted danger-tier policy.

## Assumptions and Risks

Assumptions:

- The parent `agent-cli-design-discipline` Objective remains the right umbrella for the broader CLI design discipline, and this record is only the focused danger-tier subobjective.
- ADR-driven implementation is the right sequencing: policy first, then minimal framework conformance, rather than framework API design in advance.
- Tier 3 authorization standardizes on `--force` / `-f` (revised from the earlier `--yes`-acceptable assumption): `--force` correctly names overriding the strong default guard on a high-blast-radius operation, and it matches the existing `-f`/`--force` convention on the destructive/bulk commands.

Risks:

- A bare `--force`/`-f` may still be too weak for the most extreme high-blast-radius commands; those may need a typed `--confirm <value>` on top, and the `--yes`-vs-`--force` distinction must be applied consistently so confirmation and precondition override do not get conflated.
- A too-small framework change could leave `sdl-cli-design` prescribing behavior Clinkr cannot actually support.
- A too-large framework change could prematurely freeze a danger-tier abstraction before enough command evidence exists.
- Command-local flexibility may cause drift unless the ADR and future skill give reviewers concrete enough rules.

## Open Questions

- Does the accepted policy require changes to `ClinkrInteraction.confirm`, rendered command options, JSON envelopes, schema output, or only authoring guidance plus tests?
- Which existing SDL/Clinkr commands, if any, should be used as concrete evidence for framework conformance in this slice?

Resolved: the decision is recorded in ADR 0014 (`docs/adr/0014-clinkr-confirmation-danger-tiers.md`). `--yes`/`-y` is Tier 2 confirmation and `--force`/`-f` is Tier 3 precondition override; the `sdl-cli-design` skill should carry that same distinction.
