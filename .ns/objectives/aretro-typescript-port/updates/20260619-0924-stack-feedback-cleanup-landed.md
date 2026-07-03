# Stack Feedback Cleanup Landed

## Summary

PR #1846, `aretro-ts/stack-feedback-cleanup`, landed the final post-parity TypeScript cleanup for `@asdl/aretro` after the earlier parity, payload, distribution, and SHA-256 cleanup slices had landed.

Durable cleanup meaning:

- `@asdl/aretro` now uses the shared `@asdl/core/git` gateway and in-memory test fake for ordinary repo/root/current-branch facts instead of carrying a package-local git gateway and fake.
- Repo resolution now uses the shared optional repo-root/current-branch API while preserving the same non-git, git-error, detached, explicit-branch, and current-branch outcomes for `collect-evidence`.
- Session limiting moved into the session-source seam as reusable package-local logic.
- Payload detail boolean fields were normalized to `is_truncated` and `is_cancelled`, while continuing to avoid raw transcript, tool-output, command-output, prompt, assistant prose, and raw error-message leakage.

This does not add evidence kinds, move semantic retrospective judgment into the CLI, revive `asdl aretro`, change the payload schema-version contract, or alter the remaining Python-retirement gate.

Evidence considered for this Objective update:

- Local branch diff against Graphite parent `master` contains only `ts/packages/aretro` cleanup files for this final slice.
- PR #1846 is merged and corroborates the same file set and cleanup scope.
- The current checkout still contains `packages/aretro` and active root workspace references, so Python retirement has not happened.

## Objective Impact

The completed TypeScript parity and distribution-cutover work is now also cleaned up against shared TypeScript git infrastructure. The Objective's durable guidance now treats `@asdl/core/git` as the correct shared seam for ordinary repo/branch facts, while session-source, evidence, and payload seams remain package-local until another consumer proves shared extraction.

The Objective remains open. The substantive remaining work is still Python package retirement, root workspace/build/lock cleanup, stale-reference sweep, rollback/reference evidence, and updating the umbrella TypeScript migration Objective/playbook after retirement.

## Follow-Ups

- Continue with `aretro-ts-retire-python` only after preserving rollback/reference evidence for the Python implementation and confirming no required checkout-free/prod consumer remains.
- Keep the deterministic evidence/privacy boundary unchanged during retirement.
- Update `.asdl/objectives/port-asdl-toolkit-to-typescript/` and the porting playbook after Python retirement, not from this cleanup alone.
