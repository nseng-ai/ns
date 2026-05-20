# Roadmap

## Work

- [x] Create the `packages/packagechk` workspace package and standalone `packagechk` CLI skeleton.
- [x] Implement registry result models that distinguish available, taken, invalid input, unsupported registry, and operational error states.
- [ ] Implement PyPI name normalization and availability lookup.
- [ ] Implement npm unscoped-name validation and availability lookup.
- [~] Add human output, JSON output, and the agreed exit-code behavior. Initial rendering and exit-code aggregation are in place; final registry-backed behavior remains.
- [~] Add CLI scenario tests for supported registries, unsupported `brew`, invalid names, exit codes, and output formats. Initial coverage includes help/version, unsupported `brew`, injected-gateway output, and JSON shape.
- [x] Wire the package into the uv workspace and run the repo checks.

## Parked

- [ ] Implement Homebrew checks for formula name, cask name, and executable-provider collisions.
- [ ] Support scoped npm names.
- [ ] Publish `packagechk` to PyPI and/or npm.
