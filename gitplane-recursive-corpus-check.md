# Gitplane corpus preconditions and `gitplane check`

## Goal

Implement the `gitplane` Objective roadmap slice “Recursive discovery, optional kind registration, and `gitplane check`” as a corpus-only, stateless precondition. The command checks one working-tree artifact root selected by one config, returns all deterministically discoverable corpus errors, and never opens materialization storage or consults Git history. The same domain precondition will later gate reconciliation.

This slice deliberately amends the current drafts: v1 no longer performs application/domain-content validation, validators are removed, `store` becomes optional, and transition/lineage legality remains solely a future reconciliation concern.

## Governing decisions

- Canonical contracts: `.ns/objectives/gitplane/references/README-draft.md`, `.ns/objectives/gitplane/references/SPEC-draft.md`, and `.ns/objectives/gitplane/roadmap.md`; amend these before implementing code.
- One config selects one `source.id` and one `source.artifactRoot`. Multiple domains use separate explicit invocations/configs.
- Minimum config is `{ source: { id, artifactRoot } }`; `kinds` and `store` are independently optional. `check` never invokes `store`.
- Generic artifacts need no kind registry. Classified artifacts require a registered `(gpApiVersion, gpKind)` and declared schema version. Current-corpus checking does not apply transition edges or inspect prior classification.
- Remove `ArtifactValidator`, `ClassifiedArtifactSnapshot`, validator findings, and required `schemaVersions[n].validate`. Keep schema-specific projection fields/clear-fields and transition metadata for later reconciliation.
- Never follow symlinks. Ignore special entries outside artifact boundaries, except a non-regular entry named `gitplane-artifact.json`, which is an `unsupported-artifact-entry` corpus error and an attempted boundary. Symlinks and filesystem-special entries inside an artifact are artifact-local errors. Working-tree `check` does not classify submodules because doing so authoritatively requires Git metadata/history; gitlink rejection remains a commit-tree/reconciliation precondition.
- Marker filename presence establishes a boundary even when marker JSON/envelope is invalid or the marker itself is non-regular.
- Topology is a global precondition: discover every nested marker first; if any exist, return all `nested-artifact` findings and load/parse/digest nothing in the corpus.
- Empty roots are valid ready corpora.
- Completed checks aggregate all independent findings. Operational/config/source failures return exit 2 without partial findings, counts, or corpus data.
- Initial finding-code set is frozen: `nested-artifact`, `invalid-marker-json`, `invalid-marker-envelope`, `invalid-artifact-id`, `duplicate-artifact-id`, `unknown-artifact-kind`, `unknown-schema-version`, `unsupported-artifact-entry`.
- Finding schema carries code, `error | warning`, summary, and optional artifact path/ID, relative path, JSON Pointer, and related artifact paths. `artifactPath` and every `relatedArtifactPaths` item are cwd-relative `/`-separated logical paths; `relativePath` is `/`-separated and relative to `artifactPath`. All initial rules emit errors; warning-only checks remain exit 0 for future additive rules.
- Duplicate IDs are hard errors emitted on every conflicting artifact, each carrying the complete sorted conflict paths.
- Findings sort by artifact path (absent/corpus-level first), relative path, JSON Pointer, then code; absent optional keys sort before present keys.
- `artifactCount` counts outermost attempted boundaries, including malformed, non-regular-marker, or artifact-local-invalid artifacts; nested markers never count.
- A completed result freezes `{ sourceId, artifactRoot, artifactCount, errorCount, warningCount, findings }`, where artifact root is cwd-relative and `/`-separated. Clinkr returns `ok`/0 for clean or warning-only, `negative`/1 for completed checks with errors, and `failure("check-failed", ...)`/2 when checking cannot complete.

## Public finding contract

Record this table normatively in `SPEC-draft.md`; one pure rule module owns each row.

| Code | Multiplicity and required location | Meaning |
| --- | --- | --- |
| `nested-artifact` | One per nested marker occurrence; `artifactPath` is the outer owning boundary, `relativePath` locates the descendant marker, and `relatedArtifactPaths` contains the attempted nested boundary path. | Any marker-named entry beneath another boundary. If any occur, these are the only completed corpus findings because topology refuses all loading. |
| `invalid-marker-json` | One per regular marker that is syntactically invalid JSON or whose JSON value is not an object; `artifactPath` and marker `relativePath` required. | Marker bytes cannot be interpreted as an open object. |
| `invalid-marker-envelope` | One per independent defect; `artifactPath`, marker `relativePath`, and field `jsonPointer` required. Exhaustive initial defects: missing `gpId` (`/gpId`); non-string `gpId` (`/gpId`); each missing member of a partially present classification block (that member's pointer); present non-string or empty `gpApiVersion` (`/gpApiVersion`); present non-string or empty `gpKind` (`/gpKind`); present non-number, non-integer, or non-positive `gpSchemaVersion` (`/gpSchemaVersion`, one finding even if multiple numeric predicates fail). | The open object violates Gitplane's reserved envelope shape. No other application-owned field is interpreted by this rule. |
| `invalid-artifact-id` | One per marker whose `gpId` is a string but not a canonical lowercase ULID; `artifactPath`, marker `relativePath`, and `/gpId` required. | Invalid Gitplane identity spelling. |
| `duplicate-artifact-id` | One per artifact sharing an ID; `artifactPath`, `artifactId`, marker `relativePath`, `/gpId`, and complete sorted `relatedArtifactPaths` required. The related list includes every conflicting path, including the finding's own `artifactPath`. | Source-wide duplicate across generic/classified artifacts. |
| `unknown-artifact-kind` | One per otherwise-valid classified marker with no `(apiVersion, kind)` registration; `artifactPath`, `artifactId`, marker `relativePath`, and `/gpKind` required. | Classified metadata references an absent optional registration. |
| `unknown-schema-version` | One per otherwise-valid classified marker whose kind exists but schema version is undeclared; `artifactPath`, `artifactId`, marker `relativePath`, and `/gpSchemaVersion` required. | Current schema version has no registration. |
| `unsupported-artifact-entry` | One per symlink/filesystem-special entry under an outer boundary, plus one per non-regular marker-named entry even outside another boundary; `artifactPath` is the attempted/owning boundary and `relativePath` locates the entry. Ordinary directories traversed beneath an artifact are allowed and emit nothing; a marker-named directory is an attempted boundary and unsupported entry. | Unsafe/non-regular working-tree content. Working-tree check does not infer submodules; commit-tree gitlinks are rejected when commit candidates are checked for reconciliation. |

Use fixed concise human templates derived only from these structured fields (for example, duplicate summary “Artifact ID <id> is shared by: <sorted paths>”). Codes and structured location fields are the machine contract; prose must not carry unique recovery data.

## Design

### Exact path/config coordinate model

1. Capture invocation cwd once at CLI startup.
2. Resolve default `./gitplane.config.ts` or `--config <path>` against that cwd; no parent search.
3. Load the selected trusted default export exactly once per invocation; no cache busting, watching, or reload subsystem.
4. Require `source.id` to be a non-empty string and preserve it byte-for-byte. Require configured `artifactRoot` to be a non-empty relative path.
5. Resolve `artifactRoot` against the config file directory, reject any resolved root outside invocation cwd, and use `lstat` before traversal to reject a symlink, missing path, or non-directory.
6. Normalize the accepted root back to a cwd-relative `/`-separated logical path. Pass only logical paths to the gateway and expose that same value in results.

Absolute host paths remain inside the config loader/real adapter. Invalid config or root coordinates are exit-2 failures, not corpus findings.

### Neutral tree facts and boundary derivation

Replace policy-bearing discovery with neutral `lstat`-style source facts. Define a discovery inventory containing every encountered entry beneath the selected root with cwd-relative logical path and kind (`regular-file`, `directory`, `symlink`, `submodule`, `special`):

- The real gateway recursively descends only real directories. It never follows a symlink, including a symlink to a directory.
- It reports special/symlink entries but no bytes during topology discovery.
- It reports every entry named `gitplane-artifact.json` regardless of kind. It does not label boundaries, nesting, ownership, or findings.
- Ordinary special entries outside any derived boundary disappear from later domain evaluation. Reserved-name special entries remain visible because their parent directory is an attempted boundary.

`inspectCorpusTopology(...)` derives policy:

- Every marker-named occurrence attempts to make its parent directory a boundary, regardless of entry kind or eventual JSON validity. A marker-named directory is inventoried as that reserved-name entry and is not recursively traversed as an ordinary directory.
- An attempted boundary whose parent hierarchy contains another attempted boundary is nested. Nested attempts never increment `artifactCount`.
- All non-nested attempts are outer boundaries and increment `artifactCount`, including a non-regular marker.
- Aggregate every nested occurrence deterministically before reading any candidate bytes. If at least one exists, return invalid with only `nested-artifact` findings and the discovered outer-boundary count.
- If no nesting exists, associate all descendant inventory entries with their unique outer boundary; do not traverse through symlink entries.

Snapshot reads then return a raw `ArtifactCandidate`: boundary path plus recursive entries, normalized relative paths, kinds, and bytes only for regular files. Pure preconditions—not adapters—parse metadata and promote candidates.

### Raw gateway facts versus validated domain

Refactor `ArtifactGateway` working/commit snapshot methods to return raw `ArtifactCandidate` values rather than `ArtifactSnapshot`:

- `ArtifactCandidate` contains no `ArtifactId`, envelope, classification, digest, or findings.
- Pure core logic parses marker JSON, validates metadata, and promotes only valid candidates to `ArtifactSnapshot`.
- `ArtifactCorpus` contains only a fully ready corpus; each artifact pairs its snapshot with precomputed `ContentDigest` so reconciliation can reuse the output.

Keep `ArtifactGateway` as the aggregate contract. Rename `NodeArtifactGateway` and its hook type to `RealArtifactGateway`/`RealArtifactGatewayHooks`, and make the class implement the complete `ArtifactGateway` now:

- Node filesystem APIs implement creation, neutral working-tree inventory, and raw candidate reads.
- Inject a narrow package-owned Git command execution interface at the composition root; do not add a Foundation runtime dependency because the Objective explicitly keeps Gitplane independent of Foundation. The production bootstrap supplies a Node subprocess implementation bound to invocation cwd.
- Local Git commands implement commit resolution, parent/merge facts, ancestry, neutral commit-tree inventory/raw candidate reads (including authoritative gitlink/submodule entry kinds), and changed-path diffs. No reconciliation/check policy belongs here.
- All requests/results use normalized `/`-separated paths relative to invocation cwd. The adapter resolves and containment-checks host paths internally and never returns absolute paths.
- Update `InMemoryArtifactGateway` to implement the revised aggregate using raw inventory/candidate seeds and defensive copies.

Although the aggregate’s Git methods are completed in this slice, `check` receives/uses only working-tree operations and tests assert zero resolve/facts/ancestry/commit-tree/diff calls.

### Explicit domain precondition phases and result

Add `src/core/check/` with orchestration kept separate from rules:

- `inspect-corpus-topology.ts`
- `check-artifact-corpus.ts`
- `finding.ts`, `corpus.ts`, and narrow internal promotion/sorting helpers
- `rules/nested-artifact.ts`
- `rules/invalid-marker-json.ts`
- `rules/invalid-marker-envelope.ts`
- `rules/invalid-artifact-id.ts`
- `rules/duplicate-artifact-id.ts`
- `rules/unknown-artifact-kind.ts`
- `rules/unknown-schema-version.ts`
- `rules/unsupported-artifact-entry.ts`

Each rule file owns exactly one frozen finding code and pure evaluation logic. Define an explicit orchestration result:

```ts
type CorpusPreconditionResult =
  | { type: "ready"; corpus: ArtifactCorpus; findings: readonly CheckFinding[] }
  | { type: "invalid"; artifactCount: number; findings: readonly CheckFinding[] }
  | { type: "failed"; failure: CorpusCheckFailure };
```

`ready.findings` can contain warnings only. `invalid` contains at least one error and no snapshots/digests. `failed` contains only a sanitized domain operational diagnostic—no completed counts, findings, or corpus. Gateway expected failures are returned values and map to `failed`; throws are reserved for broken invariants/programmer errors and are normalized at the CLI boundary.

After topology succeeds, orchestration:

1. Read candidates and collect unsupported entries; affected artifacts cannot be promoted/digested, but other artifacts continue.
2. Parse marker JSON. Syntax failures and non-object JSON use `invalid-marker-json`.
3. Validate the exhaustive reserved-field conditions from the finding table. Emit one finding for each missing member of a partial classification block and otherwise one per offending field; a present string but noncanonical ID uses `invalid-artifact-id`. Emit multiple independent marker defects and suppress only derivative checks.
4. For valid classified metadata, resolve optional registry entries and declared schema versions; generic metadata bypasses registry checks.
5. Group valid IDs and emit symmetric duplicate findings.
6. Compute content digests and promote only artifacts with no hard precondition defect.
7. Sort findings and return no corpus if any error exists.

Do not create a gateway `check` method: checking is reusable domain precondition logic over gateway facts.

### Config loading

Add a CLI-side config loader boundary, injected through `GitplaneCliContext` for fake-driven scenarios:

- Load one trusted default-exported TypeScript module with Node 24 module loading.
- Parse the runtime shape with Gitplane-owned Zod schemas, preserving callable `store` only when present.
- Validate unique kind keys, positive unique schema-version keys, target/field mapping shape, transition references, duplicate/self transition edges, and optional store callability. These are config failures, not findings.
- `check` never invokes the optional store factory.
- Sanitize import, config, and source diagnostics; do not expose environment values, module internals, or artifact contents.

Update `GitplaneConfig` and `defineGitplaneConfig` so optional store/kinds and validator-free schema registrations are public truth. Keep `defineArtifactKind` as a literal-preserving typed helper; runtime config parsing remains authoritative.

### CLI composition and failure contract

Replace `src/cli/commands/check/command.ts` scaffold with a Tier-0 Clinkr command:

- Add `--config <path>` with a human-facing short alias unless it conflicts with the actual Clinkr surface.
- Load/validate config, inspect topology, then run corpus preconditions through the injected gateway.
- Use the frozen completed result schema for both `ok(data)` and `negative(..., { data })`.
- Freeze exit-2 failure data separately as:

```ts
{
  category: "config-load" | "config-invalid" | "source-root-invalid" | "source-read-failed";
  diagnostic: string;
  path?: string;
}
```

`path`, when present, is a sanitized cwd-relative logical config/root/entry path. `config-load` covers module import/default-export failure; `config-invalid` covers runtime config shape/registry invalidity; `source-root-invalid` covers coordinate/containment/root type/access checks; `source-read-failed` covers topology or candidate read failures. This variant never contains completed counts/findings/corpus. Return it through `failure("check-failed", ...)`.
- Human rendering summarizes source/root/counts and deterministic findings; machine JSON exposes the frozen data shape. `--json-schema` publishes the actual envelope.
- Update `GitplaneCliContext`, bootstrap wiring, `/cli` exports, and artifact-create tests/imports for `RealArtifactGateway`.

## Contract and Objective updates

Before code, amend:

- `README-draft.md`: minimum/optional config fields, cwd/config/root coordinate model, corpus-only checking, no domain validators, one root, finding/result/exit behavior.
- `SPEC-draft.md`: remove validator contracts/calls; define neutral discovery, topology refusal, unsupported-entry behavior, raw-to-validated promotion, frozen rule table/order, duplicates, and clarify transition/lineage legality belongs to reconciliation.
- `objective.md`: remove validator claims from scope/completion/risks and retain Gitplane metadata validation.
- `roadmap.md`: rewrite this row so it does not claim `check` enforces historical classification/schema transitions; preserve those under reconciliation.
- Add a new immutable Semantic Update for validator removal and the optional-store/config/check amendment; never edit prior updates.

No Gitplane `CONTEXT.md` exists yet (`CONTEXT-MAP.md` lists it as planned), so do not invent a glossary-only file in this slice. Update the map only if package-context ground truth changes beyond its current planned description.

## Rollout order

1. Amend README/spec and Objective tracking so code never claims the superseded validator contract.
2. Refactor raw inventory/candidate/domain types and the aggregate gateway; rename and complete `RealArtifactGateway`.
3. Add topology inspection and one-file-per-rule precondition modules.
4. Add config loading/path validation and implement the Clinkr command.
5. Add focused tests by lane, run validation, and correct docs only for implementation-discovered facts (never rewrite old updates).

SQLite projection, doctor, reconciliation behavior, reference consumer, GitHub Action, and context glossary remain outside this slice.

## Test plan

### Default fake-driven tests

- One unit test module per rule file: every frozen code/location field, multiple envelope defects, canonical IDs, generic bypass/classified lookup, symmetric duplicates/related paths, and unsupported entries.
- Core orchestration: all nesting aggregated with zero candidate reads; malformed/nonregular markers counted; artifact-local errors do not suppress unaffected checks; deterministic ordering independent of inventory order; empty ready corpus; only ready exposes snapshots/digests; gateway failure produces `failed` with no partials; check makes zero Git/history calls.
- Config shape/path planning with an injected module loader and filesystem facts: minimum config, optional kinds/store, invalid registry, exact coordinate conversion, and store factory never invoked.
- CLI scenarios: clean exit 0, corpus-error exit 1, config/source/read exit 2, exact completed and failure schemas, ordering/counts, `--config`/alias/help, `--version`, `--runtime`, `-h`, and `--json-schema`; replace unavailable-command assertion.
- Exercise warning-only `ok` mapping with an injected precondition result, not a fabricated validator or warning rule.

### Specialized lanes

- `test/integration/`: temporary filesystem/Git repositories covering the complete `RealArtifactGateway` aggregate—creation, inventory/candidate reads, commit resolution/facts, ancestry, commit-tree inventory/read, diffs, path normalization/containment, symlinks not followed, and non-regular marker facts. Git failures are tested here, not through `check`.
- `test/isolated/`: real TypeScript config-module loading and load-once/module-cache behavior because the subject is ambient module loading/cache. Use unique temp paths and no module-cache mutation APIs.

## Validation

Use focused checks while iterating, then run repository gates:

```sh
pnpm --dir ts --filter @nseng-ai/gitplane check
pnpm --dir ts --filter @nseng-ai/gitplane test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just
```

If formatting fails, use `just ts-format-fix` or `just dprint-fix`, then rerun. Run `ns objective check gitplane` after Objective edits. The final implementation report must name tests/gates run and unrelated failures.

## Completion evidence

The slice is complete when:

- canonical drafts and Objective tracking describe the validator-free, optional-store, corpus-only contract;
- `RealArtifactGateway implements ArtifactGateway` completely and adapters return neutral/raw facts, never findings or parsed artifact policy;
- two-phase domain preconditions and one-file-per-code rules produce the frozen deterministic finding/result/failure contracts;
- ready corpora alone expose validated snapshots with precomputed digests;
- `gitplane check` has stable human/machine output, correct exit 0/1/2 semantics, no partials on failure, and no storage/history use;
- focused default/integration/isolated tests and `just` pass;
- deferred SQLite/doctor/reconciliation/reference-consumer/Action work remains untouched.
