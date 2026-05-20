# Roadmap

## Work

- [x] Create the `packages/packagechk` workspace package and standalone `packagechk` CLI skeleton.
- [x] Implement registry result models that distinguish available, taken, invalid input, unsupported registry, and operational error states.
- [x] Implement PyPI name normalization and availability lookup.
- [ ] Implement npm unscoped-name validation and availability lookup.
- [~] Add human output, JSON output, and the agreed exit-code behavior. Initial rendering, exit-code aggregation, and PyPI-backed behavior are in place; npm-backed final behavior remains.
- [~] Add CLI scenario tests for supported registries, unsupported `brew`, invalid names, exit codes, and output formats. Coverage now includes help/version, unsupported `brew`, injected-gateway output, JSON shape, and PyPI available/taken/invalid cases.
- [x] Wire the package into the uv workspace and run the repo checks.

## Parked

- [ ] Implement Homebrew checks for formula name, cask name, and executable-provider collisions.
- [ ] Support scoped npm names.
- [ ] Publish `packagechk` to PyPI and/or npm.
