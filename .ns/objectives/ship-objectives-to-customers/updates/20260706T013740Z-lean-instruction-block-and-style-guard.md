# Lean instruction block complete; ns-init testing subpath conformance fixed

## Summary

Follow-up evidence on the `ns init` branch showed two tracking details that were not fully reflected in the previous update:

- The day-one objective instruction block is now authored in `ts/packages/capabilities/ns-init/src/instruction-block.ts`: it uses the versioned `ns:objectives:*` managed region, says objectives exist under `.ns/objectives/`, tells agents to run `ns objective list` before non-trivial work and read overlapping records, and points them at the `ns objective` CLI plus objective skills. It deliberately omits `load-orientations` and Tracking-Gate prose, matching the 2026-07-01 lean-block decision.
- CI's TypeScript style guard found the `@nseng-ai/ns-init` testing entrypoint had been declared as an `ns.subpackages` entry while still rooted at `src/testing.ts`. The follow-up commit moved it to `src/testing/index.ts`, updated the package export and scenario-test imports, and restored subpackage declaration conformance.

Validation evidence from the follow-up fix:

- `just ts-format-check`
- `just ts-check`
- `just ts-test-typescript-style-guard`

PR evidence:

- PR #3011: Add `ns init` host wiring and persist harness selection to `ns.toml` — current PR evidence includes the host wiring/harness persistence slice plus the subpackage-conformance follow-up commit.

## Objective Impact

- Marked the lean, portable, harness-neutral instruction block roadmap row complete. This was already implemented as part of the `ns init` activation slice, but the row had remained open.
- The `@nseng-ai/ns-init` scaffold and bundle-independent `ns init` behavior rows remain complete; the style-guard fix is conformance/validation evidence for that delivered package, not a new product scope expansion.
- The Blocked Sentence remains correct: external customer shipment is still gated on `checkout-free-sdl-distribution` publishing and verifying a real checkout-free install of `@nseng-ai/ns`.

## Follow-Ups

- Continue unblocking work through `checkout-free-sdl-distribution`: publish `@nseng-ai/ns` to npm and verify global/`npx` checkout-free Objective commands in a foreign repo.
- After the publish gate clears, return to the skill-install/materializer slice (`skill-management-subsystem` + bundled objective skill dirs) before all-harness end-to-end onboarding.
