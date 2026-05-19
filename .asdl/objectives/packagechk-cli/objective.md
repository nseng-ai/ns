# packagechk CLI

## Thesis

Build `packagechk`, a small standalone Python CLI that checks whether a proposed package name is available to claim on package registries. The first version should answer the publishing/name-availability question for PyPI and npm, with clear output for humans and JSON output for scripts.

## Scope

- Create a standalone Python workspace package at `packages/packagechk`.
- Expose the CLI command `packagechk`.
- Check package-name availability on PyPI and npm in v1.
- Default to checking both supported registries.
- Support registry selection for `pypi` and `npm`.
- Reject `brew` registry selection in v1 with a clear "not implemented yet" error, while keeping the design ready for future Homebrew support.
- Treat the tool as a name-claimability checker, not an installability checker.
- Use script-friendly exit codes: `0` when available on all checked registries, `1` when taken on any checked registry, and `2` for invalid input, unsupported registry selection, or operational failures.
- Apply registry-aware name handling: PyPI uses PEP 503-style normalization; npm validates unscoped package names and does not silently rewrite invalid names.
- Provide concise human output by default and a `--json` output mode.

## Non-Goals

- Implementing Homebrew checks in v1.
- Supporting scoped npm names such as `@scope/name` in v1.
- Adding an `asdl` plugin or subcommand; `packagechk` is a standalone CLI.
- Checking whether a command is installable or provided by an existing formula/package.
- Publishing the package to PyPI or npm as part of the first implementation unless explicitly requested later.

## Completion Criteria

- `packagechk <name>` reports availability across PyPI and npm.
- `packagechk <name> --registry pypi` and `packagechk <name> --registry npm` check only the selected registry.
- `--registry brew` fails with a clear not-implemented message and exit code `2`.
- Taken names produce exit code `1`; names available on all checked registries produce exit code `0`.
- Invalid package names and registry/API failures produce exit code `2` with actionable error text.
- PyPI normalization makes equivalent names such as `foo_bar`, `foo.bar`, and `foo-bar` collide for lookup purposes.
- npm scoped names are rejected in v1 with a clear explanation.
- Human output is concise and stable enough for people to read.
- `--json` emits structured results suitable for scripts and agents.
- Scenario tests cover help/version behavior, available and taken names, registry selection, invalid names, unsupported brew selection, exit codes, and JSON output.

## Assumptions and Risks

Assumptions:

- PyPI and npm registry endpoints can distinguish taken names from available names using stable success/not-found responses.
- Python stdlib HTTP is sufficient for v1 registry lookups, keeping the package dependency-light while still modeling operational failures explicitly.
- A standalone `packages/packagechk` workspace package is the right first home and does not need to integrate with `asdl.plugins`.
- Users care first about publishing/name availability, not installability or command-provider lookup.
- Rejecting unsupported registries and scoped npm names in v1 is better than returning ambiguous `unknown` results.

Risks:

- Registry naming rules and reserved-name behavior may be more nuanced than simple HTTP existence checks; the implementation must avoid claiming names are publishable when a registry would still reject them.
- Network failures can be confused with name availability unless errors are modeled separately and mapped to exit code `2`.
- PyPI normalization and npm validation are now covered by unit, gateway, and CLI tests, reducing the risk that registry-specific name handling produces surprising output.
- Future Homebrew support has a different claimability model than PyPI/npm, so the v1 registry model should leave room for advisory or multi-part Homebrew results.

## Open Questions

- Should `packagechk` eventually support npm scoped names, and if so should it check the scoped package exactly or also advise on scope ownership?
- What exact JSON schema should be considered stable for downstream scripts?
