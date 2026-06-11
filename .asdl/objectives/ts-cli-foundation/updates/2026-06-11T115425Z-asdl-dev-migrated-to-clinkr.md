# asdl-dev migrated to clinkr

## Summary

`asdl-dev` now builds its root command tree and all four flat commands (`preview-url`, `cp`, `submit`, `pr-regen`) through `@asdl/clinkr`. The migration landed as a four-PR Graphite stack:

- PR #1278 added the clinkr raw-exit hatch and leaf `summary` support.
- PR #1279 migrated `preview-url` and `cp` onto raw clinkr commands and adapted the Pi usage-error predicate for lowercase `error:` lines.
- PR #1280 migrated `submit` and `pr-regen` onto raw clinkr commands while preserving live subprocess output, restack confirmation behavior, timeout exit 124, and arbitrary `gt` exit-code passthrough.
- PR #1281 flipped the root command to clinkr, deleted the remaining hand-rolled root dispatch/help path, and replaced local direct-invocation detection with `@asdl/core/cli-entry`.

The migration resolved the open pi-ai streaming question: pi-ai text generation is buffered; the real framework gap was `submit`'s handler-owned I/O plus raw process exit-code passthrough. That need is satisfied by the isolated `@asdl/clinkr/raw` subpath, with deletion tracked in the umbrella migration-debt ledger.

Evidence: local stack diff against `master`; Graphite parent for the tip is `asdl-dev-clinkr/submit-pr-regen`; submitted PRs #1278–#1281 corroborate the stack. `pnpm --dir ts run check`, `pnpm --dir ts run test`, and full `just` passed. Completion grep found no remaining hand-rolled asdl-dev argv/help patterns.

## Objective Impact

The roadmap row "Migrate `asdl-dev` to clinkr" is complete. Three of the four target CLI shells now use `@asdl/clinkr`; the remaining shell migration is `pr-address`.

The Objective's assumptions are refined rather than simply confirmed: schema-first parameter generation covered the `asdl-dev` flag surface, but `submit` required a deliberate raw-exit hatch for zero framework bytes, live subprocess output, interactive restack confirmation, and exit codes outside the normal `ClinkrExit` 0/1/2 contract.

The "new monolith" risk remains mitigated by subpath isolation: the new hatch lives under `@asdl/clinkr/raw`, analogous to `@asdl/clinkr/legacy`, and `asdl-dev` now uses `@asdl/core/cli-entry` for direct-invocation detection.

## Follow-Ups

- Keep the `pr-address` shell migration sequenced last as planned, using the raw-exit hatch where its legacy shell fallback requires raw process-code behavior.
- Burn down `@asdl/clinkr/raw` with the umbrella migration-debt ledger once raw-mode consumers either move to normal clinkr semantics or are eliminated.
- The asdl-dev public-surface/deep-import row remains open; this migration preserved existing `asdl-dev/src/cli.ts` imports for `pi-extensions` rather than introducing `index.ts`/exports.
