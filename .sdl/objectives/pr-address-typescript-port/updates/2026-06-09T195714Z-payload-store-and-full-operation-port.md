# Payload Store Ported and Every Exec Operation TypeScript-Managed

## Summary

Endgame stack branches 1-4 landed as `pr-address-ts/payload-store`, `pr-address-ts/payload-operations`, `pr-address-ts/prepare-run-summarize`, and `pr-address-ts/stack-orchestration` (stacked on `update-pr-address-endgame-cutover`). The payload artifact store (`asdl_core.payloads`) is ported to `ts/packages/pr-address/src/payload-store.ts` and `payload-lookup.ts`, and every remaining fallback-backed exec operation is now TypeScript-managed: default payload-mode `get-feedback`, `read-feedback-details` (plural), `record-batch-checkpoint` artifact writing, `prepare-run`, `summarize-feedback`, `stack-feedback-prep`, `stack-feedback-plan`, and `build-stack-resolve-thread-payloads`. No exec operation executes via Python fallback; remaining fallback surfaces are `--json-schema` routes, click usage-error envelope shapes for invalid option values (`--payload-mode`, `--stdout-mode`, non-integer `--body-chars`), installed/prod wrapper mode, and the `asdl pr-address ...` plugin.

Parity evidence was captured from the in-repo Python implementation while it still exists: fixed-clock, temp-root fixture suites assert byte-for-byte envelope and artifact parity (with `{ROOT}` substitution and `payload_bytes` normalization only where artifacts embed root-length-dependent paths). Verification: `pnpm --dir ts/packages/pr-address run check` and `run test` passed per branch; full TS workspace check/test passed on the stack head.

## Objective Impact

- Roadmap rows "Port payload/detail/finalization helpers" and "Port GitHub/git-backed read-only feedback collection" are complete (`[~]` to `[x]`).
- Endgame Stack branches 1-4 are landed; remaining branches are `schema-routes`, `bundle-distribution`, `plugin-retirement`, `python-deletion`, `playbook`.
- Assumption revised: the real payload store contract is `{root}/sessions/{session-id}/payloads/` with timestamped `{stamp}-{seq}-{descriptor}.{role}.{ext}` names and no session-metadata files; the earlier `{root}/{session}/artifacts/` + `{descriptor}--{role}.json` description in Objective prose was inaccurate. The port follows the real source.
- Assumptions confirmed: payload store is the keystone; stack orchestration trio has no Graphite dependency; `prepare-run`'s contested-thread reopen reuses the ported TypeScript mutation gateway with fakes only.
- Stack-feedback complexity risk is de-risked: full trio ported with parity coverage of plan-merge/batch/docket logic and all cross-reference validation error paths.
- Latent parity gap closed: managed-op envelopes now apply Python `ensure_ascii`-style `\uXXXX` escaping for non-ASCII output.

## Follow-Ups

- Port remaining `--json-schema` routes to TypeScript ownership (`schema-routes` branch).
- Decide the TypeScript-native shape for click usage-error envelopes when fallback dispatch is retired (`python-deletion` branch); invalid option values currently still delegate to Python for click usage rendering.
- Bundle distribution, plugin retirement, Python deletion, and playbook branches per the Endgame Stack sequence.
