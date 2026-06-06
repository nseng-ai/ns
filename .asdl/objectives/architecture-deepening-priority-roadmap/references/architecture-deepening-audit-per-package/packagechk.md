# packagechk Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-Uboqga/1f54d8e3-2322-4d31-a9bd-a66653d12770.jsonl`

**What I did:** inspected `CONTEXT.md`, `CONTEXT-MAP.md`, and tracked source/tests under `packages/packagechk`.\
**Files changed:** none.\
**Validation run:** no test suite run; read-only inspection plus targeted `rg`/line-number scans.\
**Blockers:** none.

## 1. Package map

`packagechk` is a standalone package-name availability/claimability CLI. It appears intentionally **no-asdl-core**: package deps are only Click (`packages/packagechk/pyproject.toml:6-8`) and the console script points directly to `packagechk.cli:main` (`packages/packagechk/pyproject.toml:10-11`).

| Module                  | Domain concepts                                                                | Seam / adapter                                                      | Depth assessment                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.py`                | CLI command, check command, PyPI/npm claim commands, legacy bare-name dispatch | `build_cli(...)` accepts registry/publish gateways (`cli.py:62-69`) | High leverage as composition root, but claim implementations are bulky and duplicated (`cli.py:223-391`).                                             |
| `models.py`             | `Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`         | In-process domain model                                             | Deep enough: status-to-exit-code and JSON shape centralize caller/test expectations (`models.py:142-160`).                                            |
| `check.py`              | Registry selection, package-name check report                                  | `PackageRegistryGateway`                                            | Small but useful locality for default registries and parked Homebrew unsupported result (`check.py:6-35`).                                            |
| `pypi.py` / `npm.py`    | Name normalization and validation                                              | Pure in-process functions                                           | Shallow but earned: same rules are used by real registry lookup and claim preflight.                                                                  |
| `output.py`             | Human/JSON report rendering                                                    | CLI presentation seam                                               | Shallow and appropriate; no new abstraction needed.                                                                                                   |
| `claim.py`              | Claim project specs and placeholder project file writers                       | Filesystem-writing implementation                                   | Useful locality for placeholder package manifests (`claim.py:11-60`, `claim.py:63-98`).                                                               |
| `gateways/registries`   | PyPI/npm availability lookup                                                   | `PackageRegistryGateway`; real + fake adapters                      | Real seam: ABC (`gateway.py:8-17`), real HTTP adapter (`real.py:34-141`), fake adapter (`fake.py:7-49`).                                              |
| `gateways/pypi_publish` | Build and publish PyPI placeholder package                                     | `PypiPublishGateway`; real + fake adapters                          | Deep: hides `uv`, `uvx`, dist cleanup, artifact validation, failure mapping (`real.py:23-84`).                                                        |
| `gateways/npm_publish`  | Publish npm placeholder package                                                | `NpmPublishGateway`; real + fake adapters                           | Real seam but thinner than PyPI; still justified by local command + remote publish side effect (`gateway.py:11-20`, `real.py:23-49`, `fake.py:8-36`). |

Dependency categories:

- **In-process:** validators, models, output renderers, Click command composition.
- **Local-substitutable:** `response_fetcher`, `status_code_fetcher`, `tool_finder`, `command_runner`, fake gateways.
- **Remote-owned / true external:** PyPI/npm registries and real package publishing.

## 2. Initial clues: validate/refute/deepen

### Clue: duplicate claim-command logic in `cli.py`; possible `ClaimCommand` abstraction

**Validated, with caution.** `_run_claim_pypi_command` and `_run_claim_npm_command` share the same decision tree:

1. validate name (`cli.py:234-237`, `cli.py:340-343`)
2. build claim spec (`cli.py:239-246`, `cli.py:345-350`)
3. dry-run exit (`cli.py:248-250`, `cli.py:352-354`)
4. optional availability check (`cli.py:255-264`, `cli.py:356-365`)
5. ensure publish tools (`cli.py:266-269`, `cli.py:367-370`)
6. confirmation prompt (`cli.py:271-277`, `cli.py:372-378`)
7. write temp project and publish (`cli.py:279-297`, `cli.py:380-387`)
8. success output (`cli.py:299-301`, `cli.py:389-391`)

The duplication also appears in scenario tests: PyPI and npm each repeat dry-run, invalid, taken, lookup error, skip-check, success, confirmation decline, missing tool, and publish failure cases (`test_claim_pypi_cli.py:46-241`, `test_claim_npm_cli.py:37-258`).

**Deletion test:** if a future shared claim module were deleted, this complexity would reappear across two command implementations and two CLI matrices. That means a `ClaimCommand`/claim-flow module could earn its keep, but only if it preserves registry-specific locality.

### Clue: `pypi.py` / `npm.py` validators and `output.py` may be appropriately shallow

**Validated. Do not abstract prematurely.**

- `pypi.py` is tiny (`pypi.py:9-21`), but deletion would duplicate normalization/validation in both real lookup (`real.py:54-57`) and claim (`cli.py:234-240`).
- `npm.py` is small but richer because scoped names are real npm domain complexity (`npm.py:10-55`), used by real lookup (`real.py:99-107`) and claim (`cli.py:340-343`).
- `output.py` only renders JSON/human report strings (`output.py:8-32`). Deleting it would mostly move lines into `cli.py`, so it is shallow, but harmless and gives presentation locality. No deeper interface is needed.

### Clue: registry/publish gateways already deep with real fake adapters

**Validated.** These are real seams because they have at least two adapters and hide true external/local-substitutable dependencies:

- Registry seam: ABC methods `check_pypi`/`check_npm` (`registries/gateway.py:8-17`), real HTTP adapter (`registries/real.py:34-141`), fake adapter tracking calls/results (`registries/fake.py:7-49`).
- PyPI publish seam: ABC (`pypi_publish/gateway.py:11-24`), real `uv`/`uvx` adapter (`pypi_publish/real.py:23-84`), fake recording operations (`pypi_publish/fake.py:8-51`).
- npm publish seam: ABC (`npm_publish/gateway.py:11-20`), real `npm publish` adapter (`npm_publish/real.py:23-49`), fake recording operations (`npm_publish/fake.py:8-36`).

The tests use the interface as the test surface: real gateway tests inject fetchers/runners instead of patching globals (`test_real_gateways.py:17-183`, `test_real_gateways.py:190-307`), and fake tests assert adapter behavior directly (`test_fakes.py:14-105`).

## 3. Top deepening/collapse candidates

### 1. Deepen claim orchestration out of `cli.py`

- **Files:** `src/packagechk/cli.py`, possibly new `claim_command.py`; tests in `tests/scenario/test_claim_pypi_cli.py`, `tests/scenario/test_claim_npm_cli.py`.
- **Deletion test:** shared claim-flow complexity currently reappears twice in `cli.py` and twice in scenario matrices.
- **Dependency category:** in-process orchestration over local-substitutable gateways; true external effects remain behind publish gateways.
- **Proposed shape:** a small internal claim-flow module with registry-specific adapters/recipes for validation, spec creation, dry-run rendering, availability check, project writing, publish operation, and success URL. Keep Click command wiring in `cli.py`.
- **Tests affected:** CLI scenario tests can shrink to command-wiring/smoke plus parametrized shared-flow cases; existing fake gateway tests remain.
- **Strength:** Worth exploring.
- **Risks:** over-generalizing PyPI/npm differences, especially PyPI normalization/module naming/build artifacts vs npm scoped-name/publish semantics.

### 2. Extract shared publish process helpers

- **Files:** `gateways/pypi_publish/real.py`, `gateways/npm_publish/real.py`.
- **Deletion test:** `PublishCommandResult`, `ToolFinder`, `CommandRunner`, `_tool_available`, `_run_publish_command`, `_format_command_failure`, `_format_command` are duplicated across PyPI/npm real adapters (`pypi_publish/real.py:12-20`, `pypi_publish/real.py:87-115`; `npm_publish/real.py:12-20`, `npm_publish/real.py:52-80`).
- **Dependency category:** local-substitutable process execution.
- **Proposed shape:** small internal process module under `gateways/` shared by publish adapters.
- **Tests affected:** `test_real_gateways.py` imports adapter-specific `PublishCommandResult` today (`test_real_gateways.py:10-12`); imports/assertions would move.
- **Strength:** Speculative / worth exploring if another publishing adapter appears.
- **Risks:** could reduce locality by coupling PyPI and npm publish adapters for minor duplication.

### 3. Defer registry-strategy map until Homebrew becomes real

- **Files:** `check.py`, `models.py`, `gateways/registries/*`, `cli.py`.
- **Deletion test:** current `check_package_name` dispatch is simple (`check.py:21-35`). A registry strategy map would not yet add much leverage.
- **Dependency category:** remote-owned registry lookup.
- **Proposed shape if needed later:** per-registry availability adapters behind a registry-keyed map, especially when Homebrew is implemented.
- **Tests affected:** check scenario tests and gateway tests.
- **Strength:** Speculative; defer.
- **Risks:** premature abstraction around only two implemented registries.

### 4. Decide whether parked Homebrew is intentional

- **Files:** `models.py`, `cli.py`, `check.py`, `tests/scenario/test_cli.py`.
- **Deletion test:** deleting Brew support would remove an enum value, CLI choice, unsupported branch, and one scenario test; complexity would vanish until Homebrew is implemented.
- **Dependency category:** future remote-owned / local registry dependency.
- **Proposed shape:** either keep the explicit unsupported UX or remove `brew` from the interface until a real adapter exists.
- **Tests affected:** `test_packagechk_rejects_brew_registry_as_not_implemented` (`test_cli.py:32-36`).
- **Strength:** Speculative.
- **Risks:** breaking an intentional user-facing placeholder; `CONTEXT-MAP.md` explicitly names parked Homebrew support.

## 4. Test analysis

Strong:

- Gateway tests are well-shaped. The gateway interface is the test surface, with real adapters tested through injected fetchers/runners and fakes tested as adapters.
- Scenario tests validate CLI behavior without network/process effects through fake gateways.

Friction:

- Claim scenario tests are duplicated PyPI/npm matrices. This is useful coverage but also evidence that claim orchestration lacks locality.
- If claim flow deepens, keep a small number of CLI scenario tests and move branch-ordering assertions to the new claim module’s interface.

## 5. Cross-package leverage/disruption

- `packagechk` is standalone/no-`asdl-core` in package metadata (`pyproject.toml:6-8`), matching `CONTEXT-MAP.md`’s packagechk note.
- Disruption should be low if refactors stay inside `packagechk`; no plugin/asdl-core contracts appear in this package.
- Cross-package leverage is mostly architectural pattern reuse: gateway/fake layout is already aligned with the repo’s fake-driven style.

## 6. Final verdict

**Verdict:** well-architected, with one targeted deepening opportunity around claim orchestration. The gateway seams are real and should be preserved. Avoid broad abstraction of validators, output, or registry dispatch until another registry/publish path increases leverage.

**Confidence:** high for gateway/validator/output assessment; medium-high for claim-flow recommendation because implementation tradeoffs depend on whether PyPI/npm claim behavior will keep evolving.
