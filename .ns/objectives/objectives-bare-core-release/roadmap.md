# Roadmap

## Work

- [x] Prepare and inspect the coordinated bare-core release candidate from clean source.
  - Evidence: coordinated `0.1.3` is unused in npm and applied to all 20 public manifests. Full `just publish-dry-run 0.1.3` package check/test/dry-run qualification passes without registry writes after repairing the SDK consumer smoke's Node-typing fixture. The packed core is checkout-free and excludes Objective commands; generated dependencies are concrete and coordinated. The standalone Objectives descriptor declares all ten canonical `objective*` skills, and both publish-preparation paths copy and assert their complete root-canonical contents in the generated tarball.

## Parked

- [ ] Publish the authorized package/version set to npm and verify registry-served metadata and tarballs.
  - Deferred until the release is reprioritized. Requalify the candidate before publication because the current `0.1.3` evidence may become stale.
  - Evidence: after explicit human authorization, npm reports the intended new versions and fresh downloads match the inspected bare-core and standalone-extension shapes.
  - Policy: preparation may proceed locally, but stop immediately before any npm publish or other external write until the user authorizes the exact package/version set.
- [ ] Run the checkout-free bare-core acquisition smoke in an isolated foreign repository.
  - Deferred with publication because registry-served artifacts are the smoke input.
  - Evidence: the published core initially has no `ns objective` command; after `ns init --harness claude-code` and `ns extension install npm:@nseng-ai/objectives`, `ns objective list` succeeds without an ns checkout or `ts/node_modules`.
- [ ] Record the released versions, acquisition-path evidence, and any caveats for umbrella synthesis and the Claude onboarding Subobjective.
  - Deferred with publication and the acquisition smoke.
  - Evidence: closure context names the registry artifacts exercised and the exact downstream assumptions de-risked.
- [ ] General released-package release automation and CI.
- [ ] `ns` self-update and automatic extension fleet updates.
- [ ] Registry channels or distribution mechanisms beyond npm.
