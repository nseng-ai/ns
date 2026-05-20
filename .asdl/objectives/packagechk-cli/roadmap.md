# Roadmap

## Work

- [x] Create the `packages/packagechk` workspace package and standalone `packagechk` CLI skeleton.
- [x] Implement registry result models that distinguish available, taken, invalid input, unsupported registry, and operational error states.
- [x] Implement PyPI name normalization and availability lookup.
- [x] Implement npm unscoped-name validation and availability lookup.
- [x] Add human output, JSON output, and the agreed exit-code behavior.
- [x] Enrich taken-result human and JSON output with registry metadata: package page URL, latest version, description or summary, and normalized lookup name when applicable.
- [x] Add CLI scenario tests for supported registries, unsupported `brew`, invalid names, exit codes, and output formats.
- [x] Wire the package into the uv workspace and run the repo checks.

## Parked

- [ ] Implement Homebrew checks for formula name, cask name, and executable-provider collisions.
- [ ] Support scoped npm names.
- [ ] Publish `packagechk` to PyPI and/or npm.
