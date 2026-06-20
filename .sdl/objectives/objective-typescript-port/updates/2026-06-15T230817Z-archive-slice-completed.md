# Archive slice completed

## Summary

The TypeScript `objective` package now implements Objective archive state movement with `objective archive <slug>` and `objective archive <slug> --unarchive`.

The slice added an archive command, archive path helpers, real and fake storage move capabilities, JSON/human rendering, and LBYL refusal behavior for missing slugs, invalid path-like slugs, missing sources, non-directory sources, and destination collisions. Successful archive/unarchive operations move Objective record directories between `.asdl/objectives/<slug>` and `.asdl/objective-archive/<slug>` without merging records or adding metadata.

Focused tests cover archive success, unarchive success, collision preservation, missing and invalid slugs, missing and non-directory sources, storage move behavior, and archive-root exclusion from active list after a fake move.

Parent-side validation passed:

- `pnpm --dir ts --filter @asdl/objective run check`
- `pnpm --dir ts --filter @asdl/objective run test`
- `pnpm --dir ts run check`
- `git diff --check`

## Objective Impact

The roadmap row for `objective archive` / `--unarchive` is now complete. The first planned Objective stack has therefore ported the core standalone TypeScript Objective CLI surfaces for package setup, read-objective, minimal list, list-candidates, full list rendering, branch attribution, and archive movement.

The Objective remains open. The next unported command surface is `objective exec runner-subagent-usage`; plugin retirement, caller/install cutover, and Python deletion remain later steer-first gates.

## Follow-Ups

- Plan the next stack around `objective exec runner-subagent-usage` and any remaining parity gaps found while validating the TypeScript package end to end.
- Do not proceed to plugin retirement, install/caller cutover, or Python deletion without a fresh confirmed preview and the required evidence gates.
