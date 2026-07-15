# Roadmap

## Work

- [x] Requalify the coordinated bare-core release candidate from clean source.
  - Evidence: immediately before publication, registry readback confirmed all 20 coordinated `0.1.3` versions absent and `just publish-dry-run 0.1.3` passed the complete package check/test/dry-run qualification without registry writes.
- [x] Publish the authorized package/version set to npm and verify registry-served metadata and tarballs.
  - Evidence: after explicit authorization for the exact set, `just publish 0.1.3` published all 20 packages and strict registry verification passed after propagation retries. Fresh registry tarballs contain a nine-file bare core with no Objective or extension paths and a 96-file Objectives artifact with its descriptor, both activation files, and all ten canonical Objective skill roots.
  - Policy: preparation may proceed locally, but stop immediately before any npm publish or other external write until the user authorizes the exact package/version set.
- [x] Run the checkout-free bare-core acquisition smoke in an isolated foreign repository.
  - Evidence: a vanilla foreign git repository installed `@nseng-ai/ns@0.1.3` and confirmed `ns objective` was initially absent; after `ns init --harness claude-code` and `ns extension install npm:@nseng-ai/objectives@0.1.3`, all ten declared Objective skills were provisioned under `.claude/skills/` and `ns objective list` succeeded without an ns checkout or `ts/node_modules`.
- [x] Record the released versions, acquisition-path evidence, and any caveats for umbrella synthesis and the Claude onboarding Subobjective.
  - Evidence: closure context records the `0.1.3` registry artifacts and acquisition proof. The bare-core dependency is cleared; the downstream steelthread still owns docs-verbatim and fresh-session Claude Code lifecycle verification.

## Parked

- [ ] General released-package release automation and CI.
- [ ] `ns` self-update and automatic extension fleet updates.
- [ ] Registry channels or distribution mechanisms beyond npm.
