# Customer-complete `ns extension install` implemented

## Summary

Implemented the first customer-complete extension acquisition lifecycle slice.
`ns extension install <source>` now accepts explicit `npm:` specs and unprefixed local
package directories, requires project harnesses already persisted by `ns init`, and
composes generic kernel acquisition with the existing descriptor-driven ns-init
activation workflow.

Local packages resolve in place and are never copied. npm packages are ensured under
`.ns/managed-extensions/npm`; exact floating-spec reruns do not implicitly refresh an
already-present package but do restore a missing package. Before acquisition the command
rejects a different spec for the same canonical npm package name or normalized local
path. Before durable writes it imports and fully validates the complete prospective
descriptor set and prepares activation. Apply preserves completed duties and reports the
failed phase for idempotent forward recovery.

The command is contributed by the preinstalled `@nseng-ai/ns-init` descriptor under the
existing `extension` group, where it coexists with kernel-owned `point`/`points`
inspection. The former top-level local-only `ns install` registration, implementation,
and scenario contract are removed with no alias. Human output, JSON envelopes,
`--json-schema`, help, usage failure, representative operational failures, host exposure,
and alias absence have focused coverage.

The extension-author guide, kernel context, and Objective-owned design references now
record init-before-install, exact-spec idempotence, identity conflicts, local-in-place
resolution, full descriptor validation, forward recovery, and the trust boundary:
`--ignore-scripts` does not sandbox imported extension code.

## Objective Impact

- The broad `ns extension` acquisition-verbs roadmap row advances from `[ ]` to `[~]`:
  customer-complete `install` is implemented, but `uninstall`, single-target `update`,
  `list`, and migration of the old top-level update extension mode remain.
- The activation row remains `[~]`: install now invokes full generic reconciliation;
  uninstall/update lifecycle reconciliation and deprovisioning are still open.
- The durable happy-path contract now requires `ns init --harness …` before
  `ns extension install`, superseding the prior install-before-init ordering.
- No Objective completion criterion is newly complete. Bare-core republish, remaining
  lifecycle verbs, docs-site finalization, and customer onboarding verification remain.

Validation evidence includes focused kernel, ns-init, and published-host checks/tests,
TypeScript format/lint/tsgo, the TypeScript style guard, dprint, and command-contract
coverage. Final repository-wide validation remains part of implementation closeout.

## Follow-Ups

- Implement `ns extension uninstall`, single-target `update`, and `list`, including safe
  artifact deprovisioning while preserving consumer data.
- Unbundle first-party extensions, republish the bare core, and run the registry-backed
  foreign-repository smoke through `ns extension install npm:@nseng-ai/objectives`.
- Reconcile the public docs-site happy path and perform the zero-improvisation Claude Code
  onboarding verification after republish.
