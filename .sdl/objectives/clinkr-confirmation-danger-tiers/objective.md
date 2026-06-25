# Clinkr Confirmation Danger Tiers

## Thesis

This is a focused subobjective of `agent-cli-design-discipline`: decide and implement SDL/Clinkr's confirmation and danger-tier policy before the broader `sdl-cli-design` work proceeds. The policy should preserve the human-first CLI value of clear interactive confirmations while making agent/script behavior deterministic, non-blocking, and explicit.

The subobjective exists to keep policy and code close together: write the confirmation/danger-tier ADR, audit Clinkr against the accepted policy, and make the minimal framework/runtime/schema/test changes needed so Clinkr behavior matches that policy where appropriate. Broader danger-tier framework APIs should be extracted only when the ADR/audit shows concrete need.

## Scope

- Write the next ADR for confirmation and danger tiers, preserving dissent between first-class framework tiers and command-local flexibility.
- Define the command-authoring policy for safe operations, scoped mutations, destructive/external mutations, high-blast-radius operations, confirmations, `--yes`, `--force`, dry-run/preview behavior, and non-interactive/agent-safe execution.
- Treat Tier 3 as the highest danger band: high blast radius, irreversible or hard-to-review effects, broad external mutation, or computed target sets where a wrong preview could cause large damage.
- Preserve the chosen Tier 3 stance: generic `--yes` remains allowed for severe operations when paired with clear policy and command-specific safeguards; typed confirmation may still be recommended or required by individual commands but is not the default universal rule.
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
- Generic `--yes` can remain acceptable even for Tier 3 when commands provide clear previews, safeguards, or command-specific documentation.

Risks:

- A generic `--yes` rule for Tier 3 may be too permissive for some high-blast-radius commands; individual commands may still need typed confirmation or stronger safeguards.
- A too-small framework change could leave `sdl-cli-design` prescribing behavior Clinkr cannot actually support.
- A too-large framework change could prematurely freeze a danger-tier abstraction before enough command evidence exists.
- Command-local flexibility may cause drift unless the ADR and future skill give reviewers concrete enough rules.

## Open Questions

- Which exact ADR title/number should be used for the confirmation/danger-tier decision?
- Does the accepted policy require changes to `ClinkrInteraction.confirm`, rendered command options, JSON envelopes, schema output, or only authoring guidance plus tests?
- Which existing SDL/Clinkr commands, if any, should be used as concrete evidence for framework conformance in this slice?
- How should `sdl-cli-design` phrase the difference between `--yes` as confirmation and `--force` as precondition override?
