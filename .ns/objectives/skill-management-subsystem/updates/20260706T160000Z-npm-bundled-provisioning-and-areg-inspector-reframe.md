# First follow-on graduated: npm-module-bundled provisioning; AREG reframed as inspector; npx-wrapping retired

## Summary

Product decision this session, refining the first parked-row disposition after the `ns-skills-steelthread` closure. Two prior parked rows — "Extension-carried artifact provisioning" and "Re-platform AREG onto the shared core" — plus the "replace `npx skills` acquisition channel" row are collapsed into one coherent direction and graduated into a single Subobjective, `npm-bundled-artifact-provisioning`.

The deciding inputs, in the user's words:

- First-party support should provision **only skills/artifacts bundled with npm modules**, not wrap `npx skills`. "Bundled with npm modules" is the precise, generic definition — extensions are one category of npm module, and the steelthread's first-party `@nseng-ai/*` package catalog is another. So the generic capability is: provision any harness artifact statically declared (the `ns` `package.json` field) and bundled inside a resolved npm module, no code executed at discovery.
- This **removes features from AREG**, which is accepted. AREG stops wrapping `npx skills` (its `init` bootstrap-clone + install, `update-skills` GitHub refresh, and `skillx` temp-workspace paths go).
- AREG is **kept as a standalone whole-project inspector**: `check`/`doctor`/`skill-kind`/`skill-find` examine a project "in its totality," across skills/artifacts installed from any source (our npm-bundled provisioning, direct `npx skills`, hand-authored) — not just what we bundle.

## Decisions and dispositions

- **Graduated** the merged row into Subobjective `npm-bundled-artifact-provisioning` (Objective Edge added, mirrored). It owns: widening the shared core's source model from `first-party`-only to an npm-module source; static declaration discovery; a reconcile/provision slice (module install/enable + `ns update`); the AREG npx-feature removal (folded in); and keeping the AREG inspector green (optionally teaching it the shared install manifest as an inspected source).
- **Retired** the "replace `npx skills` acquisition channel with first-party GitHub fetch-and-vendor" row: we neither wrap nor replace `npx skills`, and do not build first-party GitHub acquisition. Third-party skills are inspected wherever they land, not acquired by us.
- **Retired** the "`skills-lock.json` / install-manifest convergence on one hash/record format" ambition (previously an Open Question and part of the AREG re-platform framing). The two records stay complementary; AREG's inspector reads both rather than merging them.
- The `ns update` command-surface placement question now travels with the graduated Subobjective (which ships the reconcile/provision slice regardless of where the broad surface lands).

An earlier draft this session created a Subobjective `areg-shared-core-replatform` built on the now-rejected "route AREG's materialization through the shared provisioner / converge the record formats" premise. It was uncommitted with no updates and was deleted; `npm-bundled-artifact-provisioning` replaces it.

## Objective Impact

- `objective.md`: Non-Goals parked-breadth list updated (extension-carried + AREG re-platform items marked graduated/merged; npx-wrapping and record-format convergence marked retired); Open Questions updated (convergence resolved-as-retired; `ns update` placement now carried by the child; parked-row disposition partially resolved). Mirrored edge to `npm-bundled-artifact-provisioning` added.
- `roadmap.md`: the extension-carried row flipped to `[~]` and rewritten as the graduated npm-module-bundled row (merging the AREG re-platform row); the npx-acquisition parked row marked `[retired]`.
- Cross-child lesson from the steelthread closure (SDK's two export sync points; `extensions`-typed helpers never in `sdk`) is carried into the new child's Runner Policy, since it adds shared-core exports.

## Follow-Ups

- Keep the `[~]` child row current (defends the fire-and-forget-umbrella failure mode).
- On child closure, synthesize whether the source-model widening needed additive core changes — the proving-consumer finding this row exists to produce.
