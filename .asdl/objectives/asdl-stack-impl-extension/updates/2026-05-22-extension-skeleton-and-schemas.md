# Extension Skeleton and Schemas

## Summary

The project-local `.pi/extensions/asdl-stack-run/` extension skeleton now exists with local package metadata, a `yaml` runtime dependency, TypeScript checking, Bun tests, and root `just` recipes wired into `ts-check` and `ts-test`.

The first implementation slice adds deterministic frontmatter extraction, runtime validation for `asdl.stack-plan.v1` and `asdl.stack-slice-ledger.v1`, SHA-256 hashing, pointer-ledger formatting/parsing, and Branch Memory key derivation using `---` as the slash escape.

## Objective Impact

PR 1's roadmap row is complete as landed-state evidence: the extension package is discoverable from `.pi/extensions/asdl-stack-run/index.ts`, validates the minimal plan and pointer-ledger schemas, rejects objective and branch shapes that would make Branch Memory keys unsafe, and checks that each planned branch appears literally in the plan body without parsing Markdown sections.

Validation: `just ts-check && just dprint-check`.

## Follow-Ups

- Implement `/stack-run` plan storage/loading against Branch Memory in the next slice.
- Expand the README with the full v1 workflow once commands, tools, recovery, and status exist.
