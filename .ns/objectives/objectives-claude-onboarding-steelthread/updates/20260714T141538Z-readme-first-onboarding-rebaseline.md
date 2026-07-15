# README-First Onboarding Rebaseline

## Summary

The first-launch documentation surface is now the canonical `@nseng-ai/ns` and `@nseng-ai/objectives` package READMEs rather than the intentionally deferred docs site. Source now documents the complete bare-core Claude Code order and lifecycle, and package preparation includes the Objectives README in future artifacts.

The completed bare-core release independently proved registry installation and activation with `0.1.3`: a foreign repository installed bare core, initialized Claude Code, acquired `npm:@nseng-ai/objectives`, received all ten declared Objective skills, and ran `ns objective list` without checkout dependencies. Those published artifacts predate the new README content.

## Objective Impact

The docs-site gate is superseded and the pre-Claude registry-installation row is complete. The active documentation row narrows to qualifying and publishing a new package version whose registry-served artifacts contain the canonical READMEs. Until that publication is explicitly authorized and verified, `0.1.3` cannot support a README-verbatim customer journey.

The Objective remains open and unblocked: local release qualification can proceed, while npm publication remains an explicit external-write boundary. After publication, the next end-to-end slice is the fresh Claude Code create → next → update → close journey with zero verifier improvisation.

## Follow-Ups

- Freshly qualify the coordinated package set and verify packed artifacts contain the canonical host and Objectives README content.
- Obtain explicit authorization before publishing the coordinated package version to npm, then verify registry metadata and tarballs.
- Run the full Claude Code lifecycle from a clean foreign repository using only the registry-served READMEs and activated repository state.
- Record every journey deviation as an owning-surface defect and repeat from clean state after repairs.
