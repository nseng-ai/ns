# Single Clinkr Runtime Qualified

## Summary

The modern `ClinkrApp` runtime is now qualified as the single owner of navigation, request decoding, handler invocation, outcomes, rendering, envelopes, schemas, completion, raw dispatch, and interaction translation over the private topology.

Direct public-boundary tests cover `confirmOrUsageError()` for non-interactive refusal, confirmation, decline, abort, the default-no request, and strict fake failures for unexpected prompts and unused answers. `ClinkrApp` deliberately exposes no structured in-process execution seam: neither the standalone Brmem consumer nor the current Pi integration requires one, and the root-default-only prototype could not invoke recursive extension routes. The SDK/Objectives host migration must prove the required contract before Clinkr adds one.

The deletion ledger now records both semantic ownership directions: modern `src/app/**` must not import legacy runtime ownership, and legacy owners must not delegate into `/app` as a compatibility bridge. These remain LM code-review tripwires rather than brittle regex source scans. Export-surface tests continue to enforce the package boundary, while the implementation contract and deletion ledger distinguish qualified modern replacements from authorization to delete the old closure.

## Objective Impact

The roadmap row to complete the single `ClinkrApp` runtime is complete. Focused qualification covered the modern runtime and interaction suite plus the real-loader integration suite; repository default, integration, TypeScript style-guard, format, lint, type, and dprint lanes passed during qualification.

This does not authorize migration or deletion. Foundation/Brmem acceptance, SDK/Objectives host composition, broad caller migration, legacy group/raw/testing removal, package-root cutover, packed-package qualification, and README promotion remain later roadmap work.

## Validation

- `pnpm --dir ts --filter @nseng-ai/clinkr check`
- Focused Clinkr runtime/interaction suite: 9 files, 169 tests
- Focused Clinkr real-loader integration suite: 4 files, 65 tests
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test`: 568 files, 6032 tests
- `just ts-test-integration`: 52 files, 259 tests
- `just ts-test-typescript-style-guard`: 168 tests
- `just dprint-check`

## Follow-Ups

Use Brmem to prove the standalone filesystem consumer, then SDK/Objectives to prove whether the first concrete in-process host needs route-addressed invocation, direct command definitions, or another contract. Migrate remaining callers before deleting legacy confirmation gates, `ClinkrGroup`, old completion/raw/testing ownership, `/legacy`, or package-root exports.
