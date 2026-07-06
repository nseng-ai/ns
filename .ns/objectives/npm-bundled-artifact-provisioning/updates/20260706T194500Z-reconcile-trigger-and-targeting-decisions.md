# Reconcile trigger, targeting, and sweep decisions (grilling session)

## Summary

User-confirmed decisions from a grilling session over the npm-module source model
(`20260706T191545Z-npm-module-source-model-decision.md`), fixing how provisioning is
triggered and targeted. Ties were resolved by an explicit user rule: **tie goes to the
easiest/simplest implementation.**

### 1. The extension lifecycle is the primary provisioning path; no new install flag

`ns skills install` gains no `--from <package>` flag. Module-bundled artifacts are
provisioned by the extension install/update codepath — which today means the reconcile
command below, since no extension install/enable command exists yet (extensions arrive
by directory presence).

### 2. Minimal top-level `ns update` ships in this objective — placement question resolved

The standing open question ("this record vs kernel/extension-lifecycle") resolves:
**this record, as a top-level `ns update` command**, implementing the decided reconcile
architecture minimally: enumerate declared catalogs → diff against install manifests →
provision. The kernel keeps zero knowledge of artifacts. A future richer
extension-lifecycle `ns update` absorbs this by calling the same reconcile primitive.
`--dry-run` / `--force` mirror `ns skills install`.

### 3. Reconcile semantics: uniform install-new + refresh across all sources

`ns update` both installs declared-but-never-provisioned artifacts and refreshes stale
manifest-tracked ones, **uniformly for first-party and npm-module sources** (declared =
desired state; consent is inherent in invoking the command, per the decided
architecture). No source-type asymmetry in the primitive. Orphaned manifest entries
(source vanished) are reported, never deleted (uninstall stays parked).
Locally-edited targets keep refusing without `--force` via the existing decision
classifier. Selective install, if ever needed, is a future desired-state filter on top
of reconcile, not a source-type rule.

### 4. Targeting state: `ns.toml` harness selection, project scope

New-artifact targeting reads the project's existing durable harness state: the
top-level `harnesses = [...]` in repo-root `ns.toml` (written by `ns init`). Project
scope only; reconcile never writes user scope. No `ns.toml` or no harness selection →
reconcile installs nothing new, nudges toward `ns init`, and still refreshes
manifest-tracked entries (their targeting is recorded per entry). Consequence: the
`ns.toml` harness parser moves down from `@nseng-ai/ns-init` into
`@nseng-ai/harness-artifacts` (ns-init depends on harness-artifacts, so reconcile
cannot import upward); ns-init re-imports it. This is an internal module move, not a
`SkillMaterializer` gateway-contract change.

### 5. Sweep covers both extension roots; collisions are plan-time errors

`ns update` sweeps XDG-global and project `.ns/extensions/` roots — the same
enumeration kernel command discovery uses. Rationale confirmed by the user: extensions
typically **require** their skills to function, so artifact visibility must match
command visibility (a global extension's artifacts provision into any project where
`ns update` runs). Same-name target-path collisions (cross-root, cross-module, or
module-vs-first-party) are plan-time errors, not precedence rules, until real usage
demands better.

### 6. Non-extension npm packages deferred; resolver not built until it has a caller

With no `--from` flag and reconcile sweeping only extension roots + first-party,
non-extension npm packages have no provisioning path in this objective — accepted.
The explicit-name lookup decision stands on paper, but `resolveNpmModuleRoot` is not
implemented until a real caller exists (no dead exports). Anticipated follow-on shape,
recorded so it is not invented twice: a `ns.toml` package list (e.g.
`artifact-packages = ["@acme/pkg"]`) that reconcile resolves by name and treats
identically to an extension's declaration.

### 7. Load-time fingerprint backstop deferred

The ambient staleness nudge stays out of this objective, preserving the design's
zero-kernel-changes property. Known accepted gap: an extension's commands activate on
directory presence immediately, but its skills appear only at the next `ns update`.
Mitigation inside owned surfaces: the `ns update` report lists newly-discovered /
refreshed / conflicted / orphaned artifacts, and `ns skills list` can show
declared-but-unprovisioned module artifacts.

## Documentation drift found and addressed

The `ns.toml` harness-selection state was recorded nowhere (no ns-init `CONTEXT.md`;
CONTEXT-MAP and this objective's starting state omitted it), which is why it was
initially missed in this session. Fixed in-lane: this objective's starting-state now
names it; `@nseng-ai/ns-init` was added to `repo-ontology`'s undecided-packages roadmap
row with the vocabulary gap called out (authoring the package context is
repo-ontology's decision, not this objective's).

## Objective Impact

- `objective.md`: the `ns update` command-surface placement open question is resolved
  (this record, top-level `ns update`); starting-state gains the `ns.toml` line.
- `roadmap.md`: the provisioning row's trigger clause is now fully decided; the
  discovery row's sweep inputs are fixed (extension roots + first-party only).
- `repo-ontology/roadmap.md`: ns-init added to the undecided-packages row (drift
  report, not a widened slice).

## Follow-Ups

- Build the discovery + reconcile slices against these decisions.
- AREG↔manifest inspection depth remains the only open question.
