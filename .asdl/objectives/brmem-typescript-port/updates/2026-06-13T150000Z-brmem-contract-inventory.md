# brmem Contract Inventory Completed

## Summary

Completed the initial public-contract inventory for the Python `brmem` implementation and recorded the detailed durable/incidental classification in `brmem-contract-inventory.md`.

The inventory covers the public skill reference, package context and boundary rules, standalone CLI entry point, command registration, operation modules, ref-layout helpers, Entry Key / Namespace / branch validation, content limits, gateway contracts, real Git snapshot-tree behavior, fake behavior, scenario tests, unit tests, and real-gateway integration tests.

## Objective Impact

This satisfies the first roadmap row: the TypeScript port now has a checked-in compatibility baseline before package design or implementation begins.

Key durable contracts identified for the port include:

- standalone `brmem` CLI with user-facing `put`, `get`, `delete`, `list`, `check`, `copy`, `export`, plus hidden `exec resolve-prompt`;
- Clinkr-style JSON envelopes, eager `--json-schema`, and exit-code semantics, especially `check` `0` present / `1` absent / `2` invalid-or-failure;
- Snapshot Ref layout under `refs/brmem/base/<encoded-branch>` and `refs/brmem/ns/<namespace>/<encoded-branch>`;
- Entry Locator shape `<snapshot-ref>:<key>`;
- branch `/` to `---` encoding and rejection of branch names containing `---`;
- Base Namespace canonical identity `base` and `--namespace base` alias behavior;
- Entry Key, Namespace, and content-limit rules;
- Snapshot-tree storage behavior, including sibling preservation, linear history, empty-tree delete snapshots, and copy atomicity;
- `copy` snapshot-level and `--key-glob` semantics, including `*` matching `/`;
- `export` base-only default, temp-dir default, preflight safety, and dry-run behavior;
- `exec resolve-prompt` project/global lookup order and JSON `path` / `tier` output.

Likely incidental behavior was also separated, including Python module/class layout, temp-index mechanics, fake IDs/dates, and most commit-message text.

## Follow-Ups

- Use `brmem-contract-inventory.md` as the compatibility baseline for the next roadmap row: defining `ts/packages/brmem` package shape and the package-local Git gateway seam.
- Before cutover, decide whether human prose and JSON field ordering require byte-for-byte parity or only structural compatibility.
- Preserve storage layout and cross-language readability as the highest-priority parity evidence in upcoming TypeScript slices.
