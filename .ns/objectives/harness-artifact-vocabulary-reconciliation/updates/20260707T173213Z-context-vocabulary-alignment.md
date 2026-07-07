# Context vocabulary alignment completed

## Summary

Aligned the binding context vocabulary for the harness-artifact reconciliation sweep without authoring the planned package-level contexts owned by the `repo-ontology` Objective:

- Root `CONTEXT.md` now carries a contiguous harness-artifact cluster for **Harness artifact**, **Harness**, **Provision**, **Skills**, and **Harness overlay**.
- The cluster includes the required `Avoid` entries for ambiguous bare "artifact", "managed artifact", "platform", and "kind overlays", and explicitly disambiguates **Harness** from the existing **Runtime Harness** term.
- `CONTEXT-MAP.md` now names **harness overlays** in the planned `@nseng-ai/areg` context entry and narrows the "Skill / agent / resource" flagged ambiguity to what remains after this sweep: areg inspector/resource language versus Pi extension skill-expansion helpers.

Evidence: `ts/packages/capabilities/harness-artifacts/README.md` remains the read-only vocabulary exemplar; `docs/conventions/skill-conventions.md` already uses the same two-channel management and harness-overlay story.

## Objective Impact

- Completes the final open Work row for this Subobjective: affected root/map context now tells the decided vocabulary story and gives future agents binding Avoid entries.
- Preserves the explicit scope decision not to author the planned `@nseng-ai/areg` or `@nseng-ai/harness-artifacts` package `CONTEXT.md` files; that remains with `repo-ontology`.
- Leaves handoff artifacts and consumer artifacts untouched as separate domain-owned terms.

## Follow-Ups

- Close this Subobjective after the stated completion gates pass and move the parked areg push-down row to the `skill-management-subsystem` umbrella.
