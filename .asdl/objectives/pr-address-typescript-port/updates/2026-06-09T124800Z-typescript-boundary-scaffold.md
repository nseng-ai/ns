# TypeScript Boundary Scaffold

## Summary

Created the first TypeScript boundary scaffold for `pr-address`:

- Added `@asdl/pr-address` at `ts/packages/pr-address` with a public `pr-address` binary backed by `src/cli.ts`.
- Established a standalone TypeScript CLI shape with top-level help/version and an `exec` routing boundary.
- Made the local checkout wrapper use the TypeScript scaffold by default.
- Added explicit wrapper modes for local TypeScript, local legacy Python compatibility, and pinned prod Python compatibility.
- Implemented direct legacy Python fallback for unported `pr-address exec ...` operations through `uv run --project <repo> pr-address ...` or pinned `uvx`; the fallback does not call the wrapper.
- Documented the migration boundary in ADR 0004, the TypeScript package README, public skill invocation text, and legacy Python development notes.

## Objective Impact

This completes the roadmap item `Define the TypeScript migration boundary and package shape for pr-address.` The selected boundary is:

- package name/location: `@asdl/pr-address` in `ts/packages/pr-address`
- CLI entry path: `ts/packages/pr-address/src/cli.ts`
- public binary: `pr-address`
- ASDL plugin compatibility: deferred; existing Python plugin remains the current compatibility path
- wrapper strategy: local checkout defaults to TypeScript; installed/prod remains pinned Python for now
- unported operation behavior: direct Python fallback preserves argv, stdin/stdout/stderr, and exit code

Routing and wrapper tests cover top-level scaffold help/version, `exec` help, exact delegated argv shape, nonzero fallback exit preservation, local/prod/legacy wrapper modes, and invalid wrapper mode handling.

## Follow-Ups

- Identify the minimal command-runtime and schema seams needed by the next operation-port slice.
- Choose the first real `pr-address exec` operation to port and prove behavior against scenario/golden contract evidence.
- Decide npm publishing and installed-skill TypeScript distribution mechanics before prod cutover.
- Retire the Python fallback once operation parity and distribution cutover make it unnecessary.
