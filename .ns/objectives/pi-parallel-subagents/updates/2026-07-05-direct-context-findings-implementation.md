# Direct Parent-Context Findings Implementation

## Summary

Roadmap item 4 is implemented with direct parent-context scout findings instead of a new durable findings store. The explore tool now uses product-intent caps of 8,000 characters per task and 32,000 characters total, and truncation copy directs users to the existing child Pi session file for raw output.

Focused validation passed:

- `pnpm --dir ts exec vitest run packages/internal/pi-tools/test/explore/extension.test.ts packages/internal/pi-tools/test/explore/contract.test.ts`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check`

## Objective Impact

- Item 4 is complete under the re-scoped direct-context requirement.
- Existing `sessionFile` pointers remain the overflow/debug path; no XDG artifact, result handle, retrieval command, or result-file schema was added.
- Tests now cover direct-result truncation wording, partial success as non-error, all-failure error behavior, and total-cap behavior across eight scouts.
- The scout heading contract remains prompt- and contract-test-enforced rather than runtime-fatal.

## Follow-Ups

- Keep item 5 (live inline progress rendering) separate.
- Resolve the home-directory-guard bypass before routine real-child dogfooding.
- If future work wants durable result artifacts, record a new Objective decision first.
