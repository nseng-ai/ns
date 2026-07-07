# Semantic Update: AREG recognizes shared harness manifests as inspection sources

AREG's retained inspector surfaces now treat `.ns-harness-artifacts-manifest.json` as an additional read-only source of installed/provisioned skill evidence.

Implemented scope:

- Added an AREG-side manifest-source inspection DTO and `AregProjectGateway.inspectManifestSkillSources`, backed in the real gateway by `ALL_HARNESS_IDS`, `resolveHarnessSkillRoot`, and `readInstallManifestAtRoot` from `@nseng-ai/harness-artifacts/api`.
- `areg check` unions manifest-known skill names into inspection and reports invalid manifests, missing manifest target directories, and missing manifest `SKILL.md` files.
- `areg doctor skills` reports manifest provenance as info and missing manifest targets / `SKILL.md` as warnings with `ns update` / owning-provisioner remediation language.
- `areg skill find` adds manifest provenance metadata to matching on-disk skill results.
- `areg skill list/show` add manifest provenance metadata to existing skill-kind records when a manifest-provisioned skill resolves to a normal AREG skill-kind lookup root.
- `areg skill apply` remains a skill-kind mutation surface; manifest provenance does not create manifest writes, reconciliation, or new apply targets.

Decisions confirmed in code:

- Manifest inspection depth is metadata plus target presence only. AREG does not recompute per-file manifest hashes or duplicate `ns update` drift/conflict logic.
- Overlap between `skills-lock.json`, existing roots, and shared manifests is informational and not an error.
- Missing manifests behave as empty; invalid manifests are actionable diagnostics.

Validation evidence:

- `pnpm --dir ts --filter @nseng-ai/areg test -- --run` — 16 files / 127 tests passed.
- `pnpm --dir ts --filter @nseng-ai/areg check` — passed.
- `pnpm --dir ts run fmt:check` — passed after `pnpm --dir ts run fmt`.
