# Roadmap

## Work

- [ ] Prepare and inspect the coordinated bare-core release candidate from clean source.
  - Evidence: package checks and packed-artifact inspection show that core has no bundled Objectives command or descriptor, the standalone Objectives package carries its activation contribution and bundled artifacts, and registry dependency ranges are satisfiable.
- [ ] Publish the authorized package/version set to npm and verify registry-served metadata and tarballs.
  - Evidence: after explicit human authorization, npm reports the intended new versions and fresh downloads match the inspected bare-core and standalone-extension shapes.
  - Policy: preparation may proceed locally, but stop immediately before any npm publish or other external write until the user authorizes the exact package/version set.
- [ ] Run the checkout-free bare-core acquisition smoke in an isolated foreign repository.
  - Evidence: the published core initially has no `ns objective` command; after `ns init --harness claude-code` and `ns extension install npm:@nseng-ai/objectives`, `ns objective list` succeeds without an ns checkout or `ts/node_modules`.
- [ ] Record the released versions, acquisition-path evidence, and any caveats for umbrella synthesis and the Claude onboarding Subobjective.
  - Evidence: closure context names the registry artifacts exercised and the exact downstream assumptions de-risked.

## Parked

- [ ] General released-package release automation and CI.
- [ ] `ns` self-update and automatic extension fleet updates.
- [ ] Registry channels or distribution mechanisms beyond npm.
