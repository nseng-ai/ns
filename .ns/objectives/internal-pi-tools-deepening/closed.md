# Closed: Internal Pi-Tools Deepening

Closed on 2026-07-05 after all non-parked candidates were resolved.

- Candidate 1 (`pr-previews` twins merge) is explicitly parked with rationale and reopening criteria.
- Candidate 2 (shared Pi surface parity helper) landed.
- Candidate 3 (`runner-subagents` export narrowing) landed.
- Candidate 4 (context-profiler interrogation consolidation) landed.
- Candidate 5 (thermo-council flattening) landed.

Final closing-slice validation passed:

- `pnpm --dir ts run test -- packages/internal/pi-tools/test/context-profiler/context-profiler-interrogation.test.ts`
- `pnpm --dir ts run test -- packages/internal/pi-tools/test/thermo-council/thermo-council.test.ts packages/internal/pi-tools/test/thermo-council/thermo-council-parity.test.ts`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test-typescript-style-guard`
