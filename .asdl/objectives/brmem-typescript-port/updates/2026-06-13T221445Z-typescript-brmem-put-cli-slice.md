# TypeScript brmem put CLI Slice Implemented

## Summary

Implemented the public TypeScript `brmem put` CLI slice in `ts/packages/brmem`.

The slice wires `put` off the explicit `not_implemented` path and onto a real operation with byte-oriented source ingestion, Python-compatible content guardrails, strict UTF-8 decoding, Entry Key / Namespace / branch validation, gateway-backed Snapshot Ref mutation, Entry Locator reporting, JSON success fields, and stable human output lines.

Review remediation reclassified `put --stdin --format json` as a Python-runtime-specific constraint rather than a durable TypeScript contract. TypeScript Clinkr treats JSON format as output-only and does not read stdin for request bodies, so the TypeScript `put` operation now supports stdin while emitting the normal JSON success envelope. The temporary Clinkr execution metadata seam was removed, `runPut` now reuses the shared Entry request resolver for Namespace / Entry Key / branch validation, and the unrelated retired `asdl-dev cp` scenario cleanup was split out of this branch.

## Objective Impact

The write-operations roadmap row is now in progress rather than untouched: public `put` is implemented, while `delete` remains the next write-operation slice.

Compatibility decisions used for this slice:

- exact exit codes, error types, and structured JSON field names/values for `put` success and expected failures, except the Python-only `stdin_unsupported_in_json_mode` runtime-input failure is not carried forward to TypeScript;
- stable human-output substrings/lines rather than byte-for-byte full prose golden parity;
- a brmem-local byte source reader instead of changing the shared `@asdl/core/stdin` string helper;
- no new Python↔TypeScript CLI parity probe for `put`, because the existing storage seam parity plus comprehensive TypeScript scenario/unit coverage covers this slice's durable behavior.

Validation evidence:

```bash
pnpm --dir ts/packages/brmem run check
pnpm --dir ts/packages/brmem run test
pnpm --dir ts run check
pnpm --dir ts exec vitest run --config vitest.config.ts packages/clinkr/test packages/brmem/test
```

These commands passed locally. A full `pnpm --dir ts run test` was also attempted; it is blocked by existing `asdl-dev cp` scenario failures where the current CLI reports `unknown command 'cp'`, outside this brmem `put` slice.

## Follow-Ups

- Implement `delete` as the remaining write-operation slice before marking the roadmap row complete.
- Keep `copy`, `export`, and `exec resolve-prompt` on explicit `not_implemented` paths until their own slices land.
- Revisit full workspace test status after the unrelated `asdl-dev cp` scenario gap is resolved.
