# Legacy Runner Step Machinery Deleted

## Summary

Dogfooding was accepted as sufficient by product steering, so the ADR 0024 final deletion slice proceeded without re-litigating the gate. The legacy blocking `ns objective exec runner-step` command surface was removed from the objectives package exports, repo-local ns extension registration, and `.ns/extensions/objective` manifest/stub. The legacy in-CLI child-session machinery was deleted: `src/runner/step.ts`, `child-session.ts`, `event-channel.ts`, `fake-child-session.ts`, `testing.ts`, `report-marker.ts`, `src/pi/child-session/`, and their legacy-only scenario/integration/unit tests.

The remaining runner core now carries only the decomposed begin→finish contract: prompt construction is JSON-report-file only, runner contexts have no `ChildSessionGateway` or child-session overrides, and checkpoints no longer include legacy subagent usage facts. `exec-runner-subagent-usage` remains available as a separate usage-summary operation.

Focused and broader validation passed after the code removal:

```sh
pnpm --dir ts --filter @nseng-ai/objectives run check
pnpm --dir ts --filter @nseng-ai/objectives run test
pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/kernel/test/integration/sdk-module-loader.test.ts
just ts-check
just ts-lint
just ts-test
just ts-test-integration
just ts-test-typescript-style-guard
just dprint-check
```

## Objective Impact

The Objective no longer has a live legacy runner-step surface competing with the ADR 0024 decomposed bookends. `ns objective exec runner-begin` / `runner-finish` and the parent playbook skills are now the canonical execution path, which removes the main risk that agents would reach for the blocking in-CLI Pi subprocess flow.

The user/product decision marks decomposed-flow dogfooding as sufficient for this deletion slice. No recover-mode dogfooding evidence was produced by this deletion work; that absence is now a historical caveat for future automatic-supervisor/recovery-policy design, not a blocker to deleting the legacy machinery.

## Follow-Ups

- Preserve `exec-runner-subagent-usage` as a separate operation for Pi usage summaries.
- If future dogfooding surfaces recover-mode issues, record them as new evidence for the parked automatic-supervisor question rather than reviving the deleted blocking command.
