# User-scoped npm acquisition and cleanup implemented

## Summary

User lifecycle operations now support explicit `npm:` sources through lifecycle-owned XDG data storage. ADR 0055 fixes the layout at `$XDG_DATA_HOME/ns/extensions/npm/<package-name>/` with the existing HOME fallback, one isolated private npm project per package, disabled npm lifecycle scripts, and a cleanup boundary that preserves sibling packages and shared roots. Local user sources remain absolute, in-place declarations.

Install acquires and validates before the optimistic user-config write and rolls back only a package project newly installed by that invocation when later validation or config writing fails. List and production command discovery resolve installed user npm descriptors from the same storage policy without acquisition. Update preserves project-compatible semantics: pinned declarations are ensured/restored, floating declarations refresh on explicit applied update, and dry-run previews without mutation. Uninstall removes declaration authority first, then cleans only lifecycle-owned bytes; cleanup failure reports a retryable partial state and retained path.

User scope remains command-only and works outside Git: it does not require supported harnesses or run project activation, and it does not write repository instructions, points, consumer directories, bundled artifacts, or harness artifacts. Project scope and local user-source behavior remain intact.

## Objective Impact

The roadmap row for user-scoped npm acquisition and cleanup is complete. The managed-storage risk and open question are resolved by ADR 0055. Current product and SDK documentation now distinguishes the XDG config and data roots, explicit local versus npm source grammar, pinned/floating updates, cleanup recovery, command-only user semantics, catalog precedence, moved-local-checkout recovery, and the unchanged role of `just install-ns`.

The separate whole-extension proof across all eight intended packages and the final product-wide documentation reconciliation remain open.

Validation evidence run for this slice:

- `pnpm --dir ts --filter @nseng-ai/sdk test` passed after final remediation: 26 files, 277 tests.
- `pnpm --dir ts --filter @nseng-ai/ns test` passed after final remediation: 34 files, 324 tests.
- `just ts-test` passed: 575 files, 6,068 tests.
- `just ts-test-integration` passed: 53 files, 243 tests. The user lifecycle host test performs an offline npm install from a locally packed fixture and exercises unrelated-directory discovery, list, update, and uninstall with explicit XDG roots.
- `just ts-test-isolated` passed: 5 files, 16 tests; `just ts-test-typescript-style-guard` passed: 168 tests; and the full `just` entrypoint passed.
- Focused tests assert install idempotence and rollback (including cleanup failure evidence), mixed list diagnostics, pinned/floating update and dry-run behavior, declaration-first uninstall/retry, user storage ancestor safety, scoped sibling preservation, and user npm command discovery.

## Follow-Ups

- Prove Branch Context, Flow, Handoffs, Herdr, Objectives, PR Feedback, Reviews, and Slots individually across unrelated repositories while keeping Skill Exposure project-local.
- Complete the remaining product-wide documentation reconciliation after that proof.
