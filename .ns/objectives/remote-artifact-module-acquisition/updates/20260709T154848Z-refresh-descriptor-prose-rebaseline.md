# objective.md prose rebaselined to descriptor-execution reality

## Summary

Trunk objective-refresh verification against HEAD `a814ebe365b9164fdcd31c3cf09c681be670c4f0`.
No new decision — this reconciles durable `objective.md` prose with an already-recorded
finding.

Verified at HEAD:

- The static `ns.harnessArtifacts` `package.json` parsing described in the "Starting
  state (source-grounded)" bullet no longer exists: the string `ns.harnessArtifacts` is
  gone from `ts/packages`, and `module-artifact-declaration.ts` now imports and validates
  the ns extension descriptor (`exports["./ns-extension"]`, carrying `bundledArtifacts`),
  with diagnostic codes `module_artifact_descriptor_import_failed` /
  `module_artifact_descriptor_invalid`. Descriptor import executes module code at
  catalog/discovery time. This matches `updates/20260708T171326Z-descriptor-catalog-execution-trust-posture.md`,
  which is the correction of record.
- The pi-verbatim `ns update` command surface is implemented as recorded:
  `nsUpdateModeSchema = z.enum(["self","extensions","all"])` (default `self`), bare/`--self`
  fail with `self-update-not-implemented`, `--all` also errors pending self-update, and
  `--extensions` owns acquisition + reconcile (`ts/packages/capabilities/harness-artifacts/src/ns/update.ts`).
- npm managed acquisition, `ns.toml` `extensions = [...]` parsing
  (`harness-artifacts/src/ns-toml.ts`), and the `.ns/managed-extensions/` managed root are
  present (`ts/packages/kernel/src/extensions/acquisition.ts` and referencing sites).
- Edge counterpart `skill-management-subsystem` is open (no `closed.md`); this record
  carries no `blocked:` sentence, so no Blocked Sentence re-judgment applies.

## Objective Impact

- Corrected stale-as-fact prose to match HEAD: the Thesis, the "Starting state" bullet 1,
  the "Hand off to existing provisioning" scope line, the static-data non-goal, and the
  Definition of Progress now reflect descriptor-based discovery with descriptor import as
  an accepted execution point under the trusted-repo posture. The `artifact-packages`
  working-name mentions were left intact per the storage decision's stated convention
  (`updates/20260707T184938Z-...` is the correction of record for that naming).
- Not closure-ready: two `[ ]` roadmap rows remain genuinely unbuilt at HEAD — real-remote
  end-to-end evidence (an explicit final evidence-gathering step) and the ns self-update
  mechanism (`self-update-not-implemented` still errors). Completion criteria explicitly
  require both.

## Follow-Ups

- Two immutable prior updates (`20260707T210000Z-...`, `20260707T211500Z-...`) use lowercase
  `## Objective impact` / `## Follow-ups`, which `ns objective check` flags as 4 structural
  errors. They are immutable Semantic Updates and were left unchanged; a future update
  cannot retroactively fix their headings.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD
