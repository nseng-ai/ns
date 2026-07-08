# Schema/source-of-truth cleanup

## Summary

Implemented the schema/source-of-truth duplication cleanup row for `@nseng-ai/harness-artifacts`.

Files changed:

- `ts/packages/capabilities/harness-artifacts/src/artifact-catalog.ts`
- `ts/packages/capabilities/harness-artifacts/src/harness-artifact-schemas.ts`
- `ts/packages/capabilities/harness-artifacts/src/reconcile.ts`
- `ts/packages/capabilities/harness-artifacts/src/module-artifact-discovery.ts`
- `ts/packages/capabilities/harness-artifacts/src/provision-plan.ts`
- `ts/packages/capabilities/harness-artifacts/src/provision-apply.ts`
- `ts/packages/capabilities/harness-artifacts/src/ns/skills-install.ts`
- `ts/packages/capabilities/harness-artifacts/src/api.ts`

Cleanup delivered:

- Added `HARNESS_ARTIFACT_SOURCE_TYPES` plus a narrow `harness-artifact-schemas.ts` module for shared harness id, harness scope, and source-type Zod schemas.
- Replaced local reconcile and install-manifest harness/scope/source-type schema literals with those shared schemas.
- Converted reconcile and skills-install command-result arrays to readonly Zod outputs where the domain already exposes readonly arrays, removing defensive spreads in result construction without changing serialized JSON field names or values.
- Replaced duplicated `ProvisionPlanFile` / `ProvisionFileDecision` interface mirrors with schema-derived types and a shared `PROVISION_FILE_DECISION_TYPES` source list.
- Reduced module artifact discovery diagnostic duplication by sharing optional-field schema metadata and using one normalization helper to preserve exact-optional omission semantics.

Review threads addressed by this row:

- `PRRT_kwDOR4YhMs6Oxehs` — readonly-vs-mutable array output boilerplate in reconcile/command-result construction.
- `PRRT_kwDOR4YhMs6Oxr-l` — duplicate harness/source schema literals.
- `PRRT_kwDOR4YhMs6O6Vsp` — repeated source-type schema literals.
- `PRRT_kwDOR4YhMs6Oxr-n` — repeated diagnostic optional-field enumeration.
- `PRRT_kwDOR4YhMs6O2k90` — duplicated provision plan/decision interface and schema definitions.

`PRRT_kwDOR4YhMs6O67Wa` remains parked/out-of-scope for this Objective row because it concerns the AREG-tail project-fs error-code finding, not core harness-artifacts cleanup.

## Objective Impact

The roadmap row **Clean up schema and source-of-truth duplication** is now complete. Public command/API output shapes are preserved: the cleanup changes TypeScript/Zod sources of truth and readonly output typing, not machine JSON field names or values. No broad schema registry or framework was introduced.

No deliberate duplicated harness/scope/source-type schema seam remains in the touched harness-artifacts source files. Readonly conversion was limited to arrays already exposed as readonly domain data in reconcile and skills-install paths; unrelated command/list/ns-toml arrays were left alone.

Validation passed:

```bash
pnpm --dir ts --filter @nseng-ai/harness-artifacts run check
pnpm --dir ts --filter @nseng-ai/harness-artifacts run test
just ts-format-check
```

## Follow-Ups

Next Objective row: disposition the relevant PR review threads and synthesize completion/parked evidence back to `skill-management-subsystem`. Do not mutate GitHub review threads until that explicit disposition step.
