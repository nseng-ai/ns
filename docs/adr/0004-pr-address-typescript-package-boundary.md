# ADR 0004: pr-address TypeScript Package Boundary

## Status

Accepted

## Context

`pr-address` is the first production vertical slice of the broader asdl TypeScript migration. Its public contract spans the skill wrapper, standalone `pr-address` CLI, hidden-but-invocable `pr-address exec ...` operations, JSON envelopes, payload artifacts, mutation helpers, scenario tests, and golden fixtures.

The migration needs a TypeScript package boundary before individual operations are ported. The boundary must let local users exercise the new CLI shape without claiming operation parity too early or requiring unpublished npm distribution mechanics.

## Decision

- Create `@asdl/pr-address` in `ts/packages/pr-address`.
- Preserve the public binary name `pr-address`, backed by `ts/packages/pr-address/src/cli.ts` and executable directly by Node.
- Make the local checkout wrapper default to the TypeScript scaffold.
- Delegate unported `pr-address exec ...` operations directly to the legacy Python CLI with the same arguments, stdin, stdout, stderr, and exit code.
- Keep `asdl pr-address ...` TypeScript compatibility deferred; the existing Python plugin path remains the compatibility path for now.
- Keep installed/prod behavior on the pinned Python package for now; npm publishing and installed-skill TypeScript cutover are deferred.

**Amendment (2026-06-09):** the `asdl pr-address ...` plugin is retired outright rather than ported or shimmed. The standalone `pr-address` CLI is the only invocation surface after cutover; the `asdl.plugins` entry point and plugin module were removed.

**Amendment (2026-06-09, Python deletion):** the in-repo Python package `packages/asdl-pr-address` is deleted. All operations, `--json-schema` routes, and envelope rendering are TypeScript-owned, including the last three click usage-error shapes (invalid `--payload-mode`, invalid `--stdout-mode`, non-integer `--body-chars`), which now render TS-native `invalid_request` envelopes instead of click usage text. Rollback is the frozen published PyPI artifact (`asdl-pr-address==0.1.1` via `uvx`, wrapper mode `legacy-python`), not in-repo code; the wrapper's `python-local` mode was removed. The Python-generated golden contract fixtures moved to `ts/packages/pr-address/test/fixtures/golden/v1/` and remain the durable contract reference.

## Consequences

This enables incremental operation ports behind a stable TypeScript package and CLI boundary. It avoids broad command-runtime framework work before repeated seams are proven, while maintaining local workflow compatibility through a short-lived Python fallback.

The fallback creates temporary duplication, including the Python package version pin in the shell wrapper and TypeScript fallback. That duplication should be removed when operation parity and distribution cutover retire the fallback.

## Rejected Alternatives

- **Documentation-only slice:** would not prove CLI entrypoint, wrapper, or fallback routing behavior.
- **Broad runtime framework first:** risks overfitting a clinkr replacement before actual operation ports reveal repeated seams.
- **TypeScript plugin bridge now:** expands scope before standalone CLI routing is proven.
- **Python plugin shim now:** adds another compatibility layer without advancing the TypeScript standalone boundary.
- **npm prod default now:** requires distribution work for unreleased software before local behavior needs it.
- **No runtime fallback:** would break unported operation behavior during the migration window.
