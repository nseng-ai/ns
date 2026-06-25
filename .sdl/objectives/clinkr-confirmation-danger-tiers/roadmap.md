# Roadmap

## Work

- [x] Write the confirmation/danger-tier ADR.
  - Recorded as `docs/adr/0014-clinkr-confirmation-danger-tiers.md`: four danger tiers (0 read-only, 1 scoped/reversible, 2 destructive/external, 3 high blast radius), non-interactive fail-fast behavior, TTY-gated prompts, dry-run/preview returning `ok(...)`, and the `--yes`/`-y` (Tier 2) versus `--force`/`-f` (Tier 3) verb split.
  - Tier 3 standardizes on `--force`/`-f`, matching current Tier 3 commands such as `brmem put`, `handoff gc`, and `slot gc`; `handoff delete` is Tier 2 and uses `--yes`/`-y`.
  - Dissent preserved: first-class Clinkr danger metadata versus command-local flexibility; generic-`--yes`-for-Tier-3 and typed-confirmation-for-all-Tier-3 both recorded as rejected alternatives.
- [x] Audit Clinkr against the accepted ADR.
  - Added `references/clinkr-confirmation-conformance-audit.md`, classifying ADR 0014 surfaces as resolved / framework-change / command-local / parked with file:line evidence.
  - The audit identified a minimal framework seam (`usageError(...)`, `ClinkrInteraction.isInteractive()`) plus command-local TTY-gated authorization for `handoff delete`, `handoff gc`, and `slot gc`; it deliberately parked first-class danger-tier metadata and typed `--confirm` for current commands.
- [x] Implement minimal Clinkr framework conformance.
  - Clinkr now supports handler-returned `usageError(...)` with camelCase machine envelopes and exit code 2, and the interaction seam exposes injected `isInteractive()` without adding danger-tier framework metadata.
  - `handoff delete` is Tier 2 `--yes`/`-y`; `handoff gc` and `slot gc` remain Tier 3 `--force`/`-f`; all three fail fast non-interactively with `usageError` data naming the missing flag.
  - Evidence: `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `just` pass.
- [x] Hand the resolved policy back to the parent CLI discipline work.
  - Parent `agent-cli-design-discipline` records the implemented conformance so `sdl-cli-design` can encode the danger-tier policy without contradicting framework behavior.

## Parked

- [ ] First-class Clinkr danger-tier metadata/API extraction, unless the ADR/audit proves it is required by this slice.
- [ ] Repo-wide migration of every existing destructive SDL command, unless a concrete mismatch blocks policy/framework conformance.
- [ ] Full `sdl-cli-design` authoring beyond the danger-tier policy needed to unblock the parent Objective.
