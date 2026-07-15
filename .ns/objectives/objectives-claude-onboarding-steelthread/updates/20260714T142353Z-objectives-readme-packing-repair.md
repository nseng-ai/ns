# Objectives README Packing Repair

## Summary

While qualifying the coordinated package set to confirm the packed artifacts
contain the canonical onboarding READMEs, the `@nseng-ai/objectives` tarball was
found to ship **without** its top-level `README.md`. The canonical source README
exists (`ts/packages/capabilities/objectives/README.md`, 3133 bytes), but the
package's manifest declared `files: ["src"]`, and the generic publish-root
preparation (`preparePublishRoot` in `ts/scripts/public-package-set.mjs`) copies
only the declared `files` plus the injected `skills` directory. npm's automatic
README inclusion only applies to a README physically present in the packed
directory, so none was emitted. This directly falsified the prior roadmap
evidence claim that "package preparation includes the Objectives README."

`@nseng-ai/ns` was unaffected: `prepare-local-package.mjs` explicitly copies
`README.md` into its publish root and its manifest guard requires README in
`files`. The packed `@nseng-ai/ns` tarball carries `README.md` (3.5kB).

## Repair (owning surface)

Added `README.md` to the `@nseng-ai/objectives` source manifest `files` array.
Both publish-root preparers (`public-package-set.mjs` and
`prepare-source-publish-package.mjs`) derive `files` from the source manifest, so
this single change makes the copy loop emit the README and lists it in the
generated publish manifest.

## Evidence

- Objectives publish root regenerated now contains `README.md` alongside
  `package.json`, `src/`, `skills/`; `npm pack --dry-run` lists top-level
  `README.md` (3.1kB) with `files: ["src","README.md","skills"]` (96 -> 97 files).
- `@nseng-ai/ns` `pack:local` tarball lists `README.md` (3.5kB); confirmed
  unchanged and correct.
- Checkout-free acquisition smoke (`smoke:checkout-free`) still passes: bare-core
  install into a fresh foreign repo, `ns init --help`, no default Objective
  commands, SDK import.
- `@nseng-ai/objectives` `check` (tsc) and `test` (306 tests) pass after the edit;
  formatter clean.

## Objective Impact

The active documentation row's local-qualification portion is now genuinely
satisfied: both canonical onboarding READMEs verifiably land in freshly packed
tarballs. The remaining evidence is unchanged — an explicitly authorized,
version-bumped registry publication whose fetched metadata/tarballs expose these
READMEs. `0.1.3` is already published and predates both the READMEs and this
packing fix, so a new coordinated version is required. Publication remains a
gated external-write boundary awaiting explicit authorization.

## Follow-Ups

- Obtain explicit authorization, bump the coordinated version, publish, and
  verify registry-served metadata/tarballs contain both READMEs.
- Then run the full Claude Code create -> next -> update -> close journey from a
  clean foreign repository using only the registry-served READMEs.
