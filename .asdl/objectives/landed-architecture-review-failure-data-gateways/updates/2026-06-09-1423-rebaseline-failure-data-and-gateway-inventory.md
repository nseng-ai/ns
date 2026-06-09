# Re-baseline: failure-as-data and gateway-extraction inventory against current master

## Summary

The seed inventory from the 2026-06-03 → 06-05 window was re-baselined against current master (master at `e9062814`, 2026-06-09). Every seed site was located and characterized in current code, the three removed error classes were confirmed gone, and a sweep of the ~60 commits landed since 2026-06-05 found new conversions and extractions the seed list did not know about. No site reversed the trend (nothing converted back to throwing; no removed error class reappeared).

### Seed sites, current state

**Failure-as-data conversions (TypeScript):**

- `LandStackResult<T>` = `{ type: "success"; value } | { type: "failure"; failure: LandStackFailure }` with structured `LandStackFailure` (`type: "land_stack_failure"`, level/message/command/branch/PR fields) — `ts/packages/ccc/src/land-stack/errors.ts:13`; paired presenters `presentLandStackFailure` (`ts/packages/ccc/src/land-stack.ts:167`) and `formatFailure`/`formatFailureNotification` (`ts/packages/ccc/src/land-stack/presentation.ts:213`). The only seed site with a full failure/presenter pairing.
- Handoff parsing: `{ type: "valid"; ... } | { type: "invalid"; message }` unions across four parse functions — `ts/packages/pi-extensions/src/handoff.ts:98-270`. No presenter; callers early-return and surface `message` inline.
- Objective list parsing: `ObjectiveListParseResult` with the same `valid`/`invalid` shape — `ts/packages/pi-extension-runtime/src/objective-list.ts:59`.
- Runner runtime: two-level discriminants — payload `RuntimeResultV1.kind: "terminal-capture" | "runtime-error"` plus parse/read results `type: "valid" | "invalid" | "loaded" | "missing" | "read-error"` carrying `RuntimeFailureData` — `ts/packages/pi-extensions/src/runner-subagent/subagent-runtime.ts:28-272`.
- `ResolvePlanEvidence`: discriminant `source: "explicit" | "latest"` with presenter `formatResolvePlanEvidence` — now lives in `@asdl/plans` (`ts/packages/plans/src/cli.ts:70,428`). Note: this is provenance-as-data, not failure-as-data — both variants are successes. It belongs to the "evidence object" family, not the failure family.
- brmem envelope parsing has **diverged**: the `pi-extension-runtime` copy returns `{ type: "valid" | "invalid" }` (`ts/packages/pi-extension-runtime/src/machine-envelope.ts:9`), while the `planned-branch` copy still throws (`ts/packages/planned-branch/src/machine-envelope.ts:9`). Concrete inconsistency between two copies of the same parser.
- `HandoffUsageError`, `CustomCliUsageError`, `RuntimeResultParseError`: confirmed fully removed from the codebase.

**Gateway extractions (seed):**

- Python (`areg`): `AregEnvironment` and `SkillxWorkspaceInstaller` are ABC gateways with `real.py`/`fake.py` siblings that **raise** domain exceptions (`ToolMissingError`, `GitRootDiscoveryError`, `SkillxWorkspaceError`) — no result wrappers (`packages/areg/src/areg/gateways/environment/gateway.py:34`, `.../skillx_workspace/gateway.py:32`).
- TypeScript (`@asdl/planned-branch` trio): all methods return discriminated data — `GitResult<T> = { ok: true; value } | { ok: false; error: GitErrorInfo }`, `GitOptionalResult<T>` with `type: "found" | "missing" | "error"`, presence results, and a recurring error-info shape `{ code, message, displayCommand? }` shared across the Git, Brmem, and Graphite gateways (`ts/packages/planned-branch/src/git-gateway.ts:28`, `brmem-gateway.ts:58`, `graphite-gateway.ts:20`), each with an in-memory fake under `test/support/`.
- Wider TS gateway population (context for how widespread the pattern is): `PlansGitGateway`, and `asdl-dev`'s `GitGateway`, `VercelDeploymentGateway`, `TextGenerationGateway`, `CheckpointGateway` all use `ok`-boolean result unions; `ExecGateway` (`ccc`) and `BrmemExecGateway` (`planned-branch`) return raw exec results instead.

### New since 2026-06-05 (not in the seed)

- `@asdl/plans` package extraction (`37862145`) — saved-plan store primitives with its own `GitResult<T>`/`GitOptionalResult<T>`/`GitErrorInfo` (`ts/packages/plans/src/git-gateway.ts:16`) that **textually duplicate** the `@asdl/planned-branch` shapes, plus `formatCommandFailure` presenter consolidation (`c5338a93`, `ts/packages/plans/src/command-runtime.ts:163`). The duplicated result/error shapes are the most concrete consolidation candidate found.
- Python failure-as-data kept landing: discriminated resolution-provenance unions with Pydantic `Field(discriminator="kind")` (`ecd7264e`, `packages/asdl-pr-address/.../resolution_provenance_models.py:12`); batch-checkpoint validation with typed error records and an `invalid`/`incomplete` issue collector (`83197545`); `FindingsPublicationPolicyError` added to roaster's findings-payload result union (`91e357a5`).
- `asdl-core` pure-boundary extraction wave (all 2026-06-09): `git.output_conversion` (`ffb0c42e`), `gh.response_mapping` (`f14446bb`), `gt.metadata_reader` (`e5ec14cd`), and lazy constructors `build_git_gateway`/`build_gt_gateway`/`build_pr_gateway` (`f4ca2ea7`, `969e0c71`). These gateways return failure domain objects (`GitCommandFailure`, `UntrackedBranch`, `PRLookupMiss`) rather than raising — meaning **Python itself is split**: `asdl-core` returns failure data while `areg` raises domain exceptions.
- `FilesystemObjectiveStorage` consolidation (`6bc79a03`) — single storage surface; file I/O still throws.

### Shape observations feeding the contract decision (roadmap row 2)

1. At least four discriminant idioms coexist in TypeScript: `type: "valid" | "invalid"` (parsers), `type: "success" | "failure"` (land-stack), `ok: boolean` (gateways), and `type: "found" | "missing" | "error"` (optionals). Failure/presenter pairing exists only in land-stack and `@asdl/plans`.
2. The `GitResult`/`GitErrorInfo` duplication between `@asdl/plans` and `@asdl/planned-branch` and the throw-vs-data divergence between the two `machine-envelope.ts` copies are the two concrete drift artifacts; either could anchor an exemplar slice if a convention is adopted.
3. Failure-as-data and gateway extraction look separable: parser results are package-local shapes with no shared error-info object, while the gateway result unions share a recurring `{ code, message, displayCommand? }` error-info shape across packages.
4. The Python split (asdl-core returned-failure-objects vs areg raised-exceptions) means a cross-language single contract is unlikely to be the right altitude, consistent with the existing non-goal.

## Objective Impact

- Roadmap row 1 (re-baseline) is complete; rows 2 and 3 remain.
- Assumption "the trend is durable, not one contributor window" is supported: conversions and extractions kept landing through 2026-06-09 with zero reversals.
- Assumption "sites are comparable by reading current code" is supported; no prototype refactors were needed.
- Assumption "master has moved; refresh before naming a contract" is discharged by this update.
- Risk "snapshot drift" is de-risked as of master `e9062814`; the architecture-review row should treat this update as its input inventory.

## Follow-Ups

- Run roadmap row 2 (`improve-codebase-architecture` over the inventoried sites) using this update's shape observations as the input inventory; resolve explicitly whether failure-as-data and gateway conventions are one contract or two (evidence here suggests two).
- Treat the `@asdl/plans` / `@asdl/planned-branch` `GitResult` duplication and the `machine-envelope.ts` throw-vs-data divergence as the candidate exemplar slices for row 3 if a convention is adopted.
