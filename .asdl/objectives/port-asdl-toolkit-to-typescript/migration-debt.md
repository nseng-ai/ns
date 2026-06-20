# End-of-Migration Debt Ledger

This ledger recorded transitional compromises accepted during the TypeScript port. The 2026-06-20 cleanup review resolved the ledger as a migration-closure gate: no entry below remains a blocker for closing the umbrella TypeScript migration Objective.

Resolution rule used for this cleanup:

- **Killed** means the compromise was already removed or can be considered burned down by current code/docs evidence.
- **Recommitted** means the behavior is no longer treated as transitional migration debt; it is now an accepted command/framework contract. A future redesign may still choose to change it, but that would be a new product/framework compatibility project rather than a TypeScript-migration prerequisite.
- **Moved out of closure path** means the item is a narrow follow-up outside the language-migration goal and is parked instead of blocking closure.

## Resolution Summary

| Entry                                                              | Decision                                             | Closure effect                            |
| ------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------- |
| 1. Legacy machine-output shapes preserved through clinkr migration | Recommitted as bounded compatibility adapters        | Not a migration blocker                   |
| 2. snake_case keys in Zod request/result schemas                   | Recommitted as external JSON/schema compatibility    | Not a migration blocker                   |
| 3. Python-parity machine envelope as clinkr v1 contract            | Recommitted as the stable clinkr v1 machine contract | Not a migration blocker                   |
| 4. Raw-exit escape hatch for shell-backed CLIs                     | Recommitted as intentional byte-owning command mode  | Not a migration blocker                   |
| 5. CLI surface divergences accepted during clinkr migrations       | Killed by migration/docs convergence                 | Closed                                    |
| 6. CLI usage-error sniffing at the Pi extension boundary           | Moved out of closure path as narrow Pi UX follow-up  | Parked follow-up, not a migration blocker |
| 7. Objective-local legacy machine-output projection                | Killed 2026-06-17                                    | Closed                                    |

## Resolved Entries

### 1. Legacy machine-output shapes preserved through clinkr migration — recommitted

- **Original compromise:** CLIs migrated onto `@asdl/clinkr` could keep existing `--format json` output shapes and exit-code semantics through `@asdl/clinkr/legacy` / `legacyCommand` rather than immediately adopting canonical rendered-command output.
- **Cleanup evidence:** live grep on 2026-06-20 shows active `legacyCommand` use only in `ts/packages/plans/src/cli.ts` and `ts/packages/branch-context/src/cli.ts` outside clinkr's own tests. These are agent-facing plan/branch-context command surfaces where compatibility is more important than forcing a breaking cleanup into the migration closeout.
- **Decision:** recommit the legacy subpath as a deliberately bounded compatibility adapter for stable agent-facing command contracts. Its name still describes the adapter's history, but deleting it is no longer required before the umbrella migration closes.
- **Future work, if desired:** a separate Clinkr/agent-command compatibility redesign can migrate `plans` and `branch-context` to canonical rendered output with a coordinated consumer update.

### 2. snake_case keys in Zod request/result schemas — recommitted

- **Original compromise:** some Zod request/result schemas and emitted JSON used snake_case to match Python-era machine contracts.
- **Cleanup evidence:** snake_case fields remain part of external command schemas and persisted/domain payloads across packages, including PR feedback (`pr_number`), command envelopes (`exit_code`, `error_type`), slot lifecycle details, vibechk bundle compatibility, and aretro session/evidence payloads.
- **Decision:** recommit snake_case where it is an external JSON, schema, or persisted payload contract. The TypeScript migration goal is TS-default ownership, not a breaking machine-contract casing migration.
- **Future work, if desired:** casing changes should be scoped per public surface with compatibility notes, fixture updates, and consumer migrations. They are not a prerequisite for TypeScript migration closure.

### 3. Python-parity machine envelope as the clinkr v1 contract — recommitted

- **Original compromise:** `@asdl/clinkr`'s canonical machine envelope was an exact port of the Python Clinkr envelope (`exit_code`, optional `error_type`, `message`, `data`) rather than a TS-native redesign.
- **Cleanup evidence:** the envelope is now consumed by TypeScript packages and Pi/runtime parsers as a stable cross-command machine contract. The Python root `asdl exec` surface has been retired; the envelope's current value is compatibility between TypeScript CLIs and first-party consumers, not Python implementation parity.
- **Decision:** recommit the Python-parity envelope as the clinkr v1 machine contract. A future v2 may redesign it, but the current envelope is no longer migration debt.
- **Future work, if desired:** a Clinkr v2 Objective can revisit richer error structures, crash semantics, and machine-output conventions with explicit compatibility planning.

### 4. Raw-exit escape hatch for shell-backed CLIs — recommitted

- **Original compromise:** `@asdl/clinkr/raw` exposed `rawCommand` / `RawCommandSpec` so shell-backed commands could own stdout/stderr bytes and process exit codes directly.
- **Cleanup evidence:** raw mode is now used by active TypeScript command surfaces that intentionally bridge byte-owning workflows: `sdl`, `ccc`, `packagechk`, `roaster`, `sdlcc`, and `vibechk`, plus clinkr's own tests. This is broader than the original `asdl-dev` / `pr-address` bridge rationale.
- **Decision:** recommit raw mode as an intentional Clinkr extension point for commands whose contract is subprocess-like bytes and exit codes. Removing it before migration closure would be a framework redesign, not cleanup.
- **Future work, if desired:** individual commands with structured contracts may still migrate from raw mode to rendered Clinkr commands when their owners want framework-managed output.

### 5. CLI surface divergences accepted during clinkr migrations — killed

- **Original compromise:** migrated CLIs accepted Clinkr/commander-generated help, usage, parse-error, and hidden-`exec` subgroup behavior rather than emulating every historical parser quirk.
- **Cleanup evidence:** public skills/docs now describe the TypeScript-owned command surfaces and hidden exec ownership directly. The remaining Python root `asdl exec` docs are explicit retirement/provenance records, not active guidance.
- **Decision:** killed as migration debt. The divergences are now the documented active surface rather than temporary exceptions.

### 6. CLI usage-error sniffing at the Pi extension boundary — moved out of closure path

- **Original compromise:** `pi-extensions` detects CLI usage errors in `cli-command-extension.ts` by checking `exitCode === 2` plus `Error:` / `error:` stderr prefixes to decide whether to restore the Pi slash-command text to the editor.
- **Cleanup evidence:** the sniff remains in one narrow Pi extension boundary (`isCliUsageError`). It affects editor restoration UX, not whether toolkit capabilities are TypeScript-default or whether Python fallbacks remain active.
- **Decision:** move this out of the migration closure path as parked Pi UX/API follow-up. It should not block the TypeScript migration Objective.
- **Future work, if desired:** when `registerCliCommandExtension` / `runCli` is next revised, carry usage-error classification structurally and delete the prefix sniff.

### 7. Objective-local legacy machine-output projection — killed 2026-06-17

- **Original compromise:** `ts/packages/objective` retained an Objective-local legacy machine projection for Objective JSON consumers during cutover.
- **Cleanup evidence:** PR #1726 / commit `dc225c5de` migrated Objective JSON consumers, deleted `ts/packages/objective/src/operations/legacy-machine.ts`, removed Objective `legacyMachine` hooks, and updated Pi/CCC parsers and tests for canonical camelCase Objective JSON.
- **Decision:** killed before this cleanup review; retained here as historical resolution evidence.

## Remaining Migration-Closure State

No open entry in this ledger blocks closing the umbrella TypeScript migration Objective. Any future work named above should be treated as a new compatibility/framework/UX improvement, not as unfinished language-migration debt.
