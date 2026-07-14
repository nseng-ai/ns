# Bare-Core Release and Acquisition Synthesized

## Summary

The `objectives-bare-core-release` Subobjective completed coordinated npm release `0.1.3`, strict registry metadata and tarball verification, and the checkout-free acquisition smoke. In a vanilla foreign repository, registry-served `@nseng-ai/ns@0.1.3` initially lacked `ns objective`; after `ns init --harness claude-code` and `ns extension install npm:@nseng-ai/objectives@0.1.3`, all ten declared Objective skills provisioned under `.claude/skills/` and `ns objective list` succeeded without this checkout or `ts/node_modules`.

- PR #3629: Close bare-core release objective after verified `0.1.3` publication — submitted current PR carrying the completed Subobjective and smoke evidence.

## Objective Impact

The umbrella's bare-core unbundle, republish, and foreign-repository acquisition row is complete. The hidden-checkout and stale batteries-included-registry risks are de-risked for the CLI acquisition path, and the npm release gate on customer documentation is cleared.

Claude Code skill provisioning from the published extension is now evidenced. The broader skill-delivery row remains partial because Codex and Pi end-to-end breadth is deliberately parked after the first Claude Code slice.

The Objective remains open. Its next dependency-ordered work is to replace stale release-gate copy with the verified `0.1.3` happy path and then run a fresh Claude Code session through create → next → update → close without improvisation. The docs-site corpus and launch slice remain owned by `eve-parity-docs-site`.

## Follow-Ups

- Update installation and quickstart content to the verified install core → initialize Claude Code → install Objectives order and remove stale release-gate copy.
- Advance `eve-parity-docs-site` far enough to provide the publishable launch substrate required by the onboarding steelthread.
- Once that gate clears, run the docs-verbatim fresh-session Claude Code lifecycle and record every deviation as a product or documentation defect.
