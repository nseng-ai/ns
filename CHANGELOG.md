# Changelog

## Unreleased

- Removed the auto-provisioned `<group> json <verb>` subgroup from
  `clinkr`. `<group> <verb> --format json` is now the sole
  machine-dispatch path. `--schema` is now also injected on commands
  that declare their own `--format` option, which previously relied on
  the subtree path for schema introspection.
