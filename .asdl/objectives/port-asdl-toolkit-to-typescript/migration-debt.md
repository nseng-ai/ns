# End-of-Migration Debt Ledger

Transitional compromises deliberately accepted during the TypeScript port. Each entry exists to preserve Python parity or current-consumer behavior while the migration is in flight, and each MUST be killed before the umbrella objective closes. This ledger is distinct from the capability-status Migration Ledger in `objective.md`: that tracks _what_ gets ported; this tracks _compromises made along the way_ that have an expiry.

Entry contract: what the compromise is, why it exists, and the kill action. Kill condition for every entry is the end of the overall TS migration unless noted otherwise.

## Entries

### 1. Legacy machine-output shapes preserved through clinkr migration

- **Compromise:** CLIs migrated onto `@asdl/clinkr` keep their existing `--format json` output shapes (`{"success": true, ...}` / `{"success": false, "error": {code, message}}`) and their existing exit-code semantics (exit 2 for all failures, no ok/negative/failure three-way), via a per-command legacy machine-output escape hatch in clinkr rather than adopting the Python-parity envelope (`{"exit_code", "data" | "message" | "error_type"}`).
- **Why:** lets each CLI migrate to clinkr without breaking the skills that parse its JSON output in the same change; decouples the clinkr adoption sequence from a consumer-update sweep.
- **Kill action:** remove the legacy escape hatch from `@asdl/clinkr` entirely; move every migrated command onto the canonical machine envelope; classify each command's non-ok paths into negative (exit 1) vs failure (exit 2) deliberately; update every dependent skill's `--format json` parsing instructions in the same change. Grep `skills/` for each CLI's json invocations to find consumers.
- **Origin:** ts-clinkr-commander design grilling (2026-06-10), machine-envelope adoption decision.

### 2. snake_case keys in Zod request/result schemas

- **Compromise:** `@asdl/clinkr` request/result Zod schemas use snake_case property keys (e.g. `pr_number`, `plan_store_root`) instead of idiomatic TS camelCase, so that `--json-schema` documents and envelope `data` keys structurally match the Pydantic-derived Python documents with zero transform layers. `ts/packages/pr-address` already follows this convention for its parity fixtures.
- **Why:** exact Python parity for machine consumers and the structural schema-parity comparator; every casing transform layer is a parity bug surface while Python is still the reference implementation.
- **Kill action:** once the TS toolkit is the default and Python parity is no longer a constraint, convert schema keys to idiomatic TS style (camelCase) across clinkr-based CLIs, regenerate `--json-schema` documents, and update machine consumers (skills) in the same change. Coordinate with entry 1's kill if both are still open — one consumer-update sweep, not two.
- **Origin:** ts-clinkr-commander design grilling (2026-06-10), schema key casing decision.

### 3. Python-parity machine envelope as the clinkr v1 contract

- **Compromise:** `@asdl/clinkr`'s canonical machine envelope is an exact port of the Python clinkr envelope rather than a TS-native design (richer error structure, crash semantics, etc.).
- **Why:** one envelope contract on both sides of the migration; skills consuming CLIs do not need to know which language served them.
- **Kill action:** revisit the parked TS-native envelope redesign (tracked in the `ts-clinkr-commander` objective's Parked section) once all four CLIs are migrated and Python clinkr is no longer authoritative; either deliberately recommit to the parity envelope as permanent or execute the redesign. Includes revisiting unexpected-throw semantics (currently: propagate raw with no envelope, matching Python).
- **Origin:** ts-clinkr-commander objective scope + design grilling (2026-06-10).

### 4. CLI surface divergences accepted during clinkr migrations

- **Compromise:** CLIs migrated onto `@asdl/clinkr` accept a fixed set of user-facing surface changes instead of emulating every hand-rolled parser/help quirk: clinkr/commander-generated help bytes, commander-format unknown-command errors, raw-stderr never-enveloped usage errors even under `--format json`, accepted `--flag=value` and explicit `--format human`, clinkr's lowercase human failure prefix (`error:`), and hidden `exec` subgroups per repo convention. Per-CLI divergence call-outs start with `@asdl/plans`, whose compact `--format json` success and domain-failure bodies remain byte-identical while help/usage/parse-error surface adopts clinkr semantics.
- **Why:** these are deliberate framework semantics from the `ts-clinkr-commander` design and 2026-06-10 `plans` migration planning decision. Recreating legacy quirks in each migrated CLI would preserve duplicated parser behavior the framework exists to remove.
- **Kill action:** documentation-style debt: after all four clinkr migrations land, confirm dependent skills/docs describe the new surface and fold that check into entry 1's consumer-update sweep; then close this entry together with the broader clinkr migration debt burn-down.
- **Origin:** ts-clinkr-commander `plans` migration planning and implementation (2026-06-10), divergence-policy decision.
