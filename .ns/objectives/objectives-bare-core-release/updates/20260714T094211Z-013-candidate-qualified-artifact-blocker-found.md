# 0.1.3 Candidate Qualified; Artifact Blocker Found

## Summary

Prepared coordinated `0.1.3` across the repository's 20-package public set after read-only registry verification showed `0.1.2` as current and `0.1.3` unused. The first full qualification exposed a deterministic SDK consumer-smoke defect: its temporary Node TypeScript project neither installed the workspace-pinned `@types/node` nor selected the `node` type library. The fixture now derives the catalog specifier, installs it, and declares `types: ["node"]`; the tight smoke and the complete `just publish-dry-run 0.1.3` qualification pass without registry writes.

Packed-artifact inspection proves the generated `@nseng-ai/ns` core is checkout-free and does not expose Objective commands by default. All generated public dependency ranges are concrete and coordinated at `0.1.3` where applicable.

The standalone Objectives artifact is not release-ready. Its publish root includes the Objectives descriptor and activation contribution, but the descriptor declares no `bundledArtifacts` and the tarball contains no Objective skill directories. Package checks and npm dry-run do not detect this customer-visible omission.

## Objective Impact

The release-candidate preparation row advances to partial. Version coordination, full-set qualification, bare-core absence, checkout-free core smoke, and dependency rewriting are evidenced. Publication remains blocked locally—not by npm authorization—until the standalone Objectives package carries the harness artifacts promised by the release and onboarding contracts.

This finding partially disproves the assumption that the existing package build already produces a customer-complete standalone Objectives artifact without further packaging work. The repair must settle which Objective skill directories ship and how canonical repository skills enter the generated package without creating an unsynchronized duplicate source.

## Follow-Ups

- Decide and implement the bounded Objectives bundled-skill packaging contract, including descriptor declarations and packed-tarball assertions.
- Rerun full `0.1.3` qualification and packed-artifact inspection after that repair.
- Present the final exact 20-package `0.1.3` set for explicit authorization immediately before any npm publication.
- After publication, verify registry-served metadata/tarballs and run the foreign-repository acquisition smoke.
