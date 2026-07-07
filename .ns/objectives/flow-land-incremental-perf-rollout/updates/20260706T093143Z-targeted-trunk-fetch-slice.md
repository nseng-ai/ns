# Targeted trunk-fetch slice implemented

## Summary

Implemented the targeted trunk-fetch flow-land slice by freshly re-deriving from `flow-land-trunk-fetch` as reading material only. The required next-landing post-merge maintenance path now advances local trunk with `git fetch --quiet --no-tags origin refs/heads/<trunk>:refs/heads/<trunk>` through the land Git gateway instead of running `gt get <next> --downstack --no-restack --no-checkout --force --no-interactive`.

Optional descendant maintenance intentionally remains on the existing Graphite refresh path. Direct trunk fetch failures fail closed and halt before local cleanup/restack/submit; no checked-out-trunk fallback to `gt get` was implemented.

## Objective Impact

This completes roadmap row “Derive and land slice: targeted trunk fetches replacing mid-loop Graphite refreshes.”

External-call evidence from the fake-backed large-stack telemetry baseline:

- Before this slice: `linear-11 = 145` total calls; `linear-25 = 313` total calls.
- After this slice: `linear-11 = 140` total calls with categories `graphite: 44`, `github-cli: 45`, `github-api: 0`, `git: 51`, `other-command: 0`; GitHub quota unchanged at GraphQL requests 56 / REST 0 / rate limit cost 66.
- After this slice: `linear-25 = 308` total calls with categories `graphite: 100`, `github-cli: 101`, `github-api: 0`, `git: 107`, `other-command: 0`; GitHub quota unchanged at GraphQL requests 126 / REST 0 / rate limit cost 150.

Validation run on 2026-07-06:

- `pnpm --dir ts run test -- packages/capabilities/flow/test/unit/land-context-adapter.test.ts packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts packages/capabilities/flow/test/unit/land-stack-topology-guards.test.ts packages/capabilities/flow/test/integration/land-stack-sandbox.test.ts packages/capabilities/flow/test/land/api-boundary.test.ts` — passed (`441` files / `4444` tests under the unit config).
- `pnpm --dir ts run test:integration -- packages/capabilities/flow/test/integration/land-stack-sandbox.test.ts` — passed (`33` files / `126` tests under the integration config).
- `just ts-check` — passed.
- `just` initially failed on TypeScript formatting only; `just ts-format-fix` was run. Final `just` passed.

## Follow-Ups

- Continue to the next Objective row only after review/landing of this revertible slice.
- Keep the no-fallback trunk-fetch failure behavior visible in review; it intentionally diverges from the reference branch’s checked-out-trunk fallback.
