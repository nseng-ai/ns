# TypeScript brmem put CLI Slice Implemented

## Summary

Implemented the public TypeScript `brmem put` CLI slice in `ts/packages/brmem`.

The slice wires `put` off the explicit `not_implemented` path and onto a real operation with byte-oriented source ingestion, Python-compatible content guardrails, strict UTF-8 decoding, Entry Key / Namespace / branch validation, gateway-backed Snapshot Ref mutation, Entry Locator reporting, JSON success fields, and stable human output lines.

A minimal shared Clinkr execution metadata seam now passes the requested rendered format to handlers, allowing `put --stdin --format json` to fail with the durable `stdin_unsupported_in_json_mode` error type without parsing raw argv in `@asdl/brmem`. The seam also supports a small option alias spec used for `brmem put -f`.

## Objective Impact

The write-operations roadmap row is now in progress rather than untouched: public `put` is implemented, while `delete` remains the next write-operation slice.

Compatibility decisions used for this slice:

- exact exit codes, error types, and structured JSON field names/values for `put` success and expected failures;
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
