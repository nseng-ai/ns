# npm-module source model decided

## Summary

Design decision for the roadmap's first row ("Decide the npm-module source model"), confirmed with the user per the Runner Policy's ask-first boundary. No implementation yet; this record fixes the API shape the discovery and provisioning slices build on.

**Decision: additive two-variant source union, `ns.harnessArtifacts` kind-discriminated declaration, explicit-name module lookup, schema owned by `@nseng-ai/harness-artifacts`.**

### 1. Source union (additive, first-party untouched)

`HarnessArtifactEntryBase.source` widens from `FirstPartyHarnessArtifactSource` to a union:

```ts
export type HarnessArtifactSource =
	| { type: "first-party"; packageName: string; relativePath: string }
	| { type: "npm-module"; packageName: string; relativePath: string };
```

`ProvisionSourceProvenance` (and therefore `InstallManifestSourceData`) gains the mirrored `npm-module` variant with `version`. For `npm-module`, `version` is the declaring module's `package.json` `version`, falling back to the literal `"unversioned"` when absent; `first-party` keeps its `"static-catalog-v1"` sentinel. Grounding for why this is safe: the plan/apply core (`buildProvisionPlan` → `applyHarnessArtifactProvision`) only reads `source.relativePath` (joined under an externally supplied `sourceRoot`) and passes the rest through as provenance, and both variants share `packageName` + `relativePath`, so the widening is structural. Manifest v1 needs no version bump — `source` is already a discriminated object and existing `first-party` entries remain valid. The rejected alternative (collapse to a single `npm-module` source with `@nseng-ai/ns` self-declaring) is cleaner as an end-state but would migrate recorded manifest provenance and rework the working steelthread path now; it stays available as a later re-expression.

### 2. Static declaration shape

A declaring npm module carries a flat, kind-discriminated array under the existing `ns` field:

```jsonc
{
	"name": "@acme/my-ext",
	"version": "1.2.3",
	"ns": {
		"commands": [ /* existing kernel extension commands, optional */ ],
		"harnessArtifacts": [
			{ "kind": "skill", "name": "my-skill", "path": "skills/my-skill", "description": "..." }
		]
	}
}
```

- Entries mirror the `HarnessArtifactEntry` kind union. Only `kind: "skill"` is accepted today; `agent` / `extension-bundle` entries produce a diagnostic (not silent drops), matching the objective's "modeled in types; skills first" boundary.
- `path` validation mirrors the kernel's command-entry rules: relative POSIX path, no leading `/`, no backslashes, must not escape the package directory (`isPathInside`), and for skills the directory must contain `SKILL.md`.
- Artifact ids are **derived**, not declared: `<packageName>:<name>` (e.g. `@acme/my-ext:my-skill`), guaranteeing manifest-key uniqueness across modules without author-managed ids.
- Declarations are static JSON reads only — no module code executed at discovery, honoring the hard non-goal.

### 3. Module root resolution (extensions vs other npm packages)

- **Extensions:** a module root is the extension's directory under the kernel's extension roots (XDG-global `extensions/`, project `.ns/extensions/`). Discovery enumerates those roots and statically reads each `package.json` — the same directories kernel command discovery walks, read independently.
- **Non-extension npm packages:** resolved **by explicit package name only** via a static `node_modules` walk upward from the project root (`resolveNpmModuleRoot(projectRoot, packageName)`, LBYL directory probing — not `require.resolve`, which fails when `package.json` is not an exported subpath). No blanket dependency scan: reconcile does not probe every dependency for declarations, so a transitive dep cannot inject artifacts by merely publishing a declaration. A dependency-sweep mode remains possible later as sugar over the same resolver.

Discovery output carries `moduleRoot` and `version` alongside the entries (a resolved npm-module catalog), so provision callers get `sourceRoot` / `sourceVersion` from discovery rather than from `resolveFirstPartyCatalogSourceRoot()`.

### 4. Schema ownership

The `ns.harnessArtifacts` Zod sub-schema and its parser live in `@nseng-ai/harness-artifacts` (which owns the artifact vocabulary) and parse `package.json` text directly. The kernel's `nsExtensionPackageManifestSchema` is a `looseObject`, so the new key coexists with command discovery with **zero kernel changes** — deliberately sidestepping the steelthread's binding cross-child lesson about the kernel SDK's two export sync points (`sdk` barrel + jiti mirror in `runtime/module-loader.ts`). If the kernel ever needs to understand the key, that is a later, explicit convergence.

### Cross-cutting rules fixed by this decision

- **Target-path collision is a plan-time error.** Two modules declaring the same skill name yield distinct manifest keys (derived ids differ) but the same `targetArtifactPath`; the discovery/reconcile slice must surface this as an error rather than last-writer-wins.
- **Additivity contract:** `FirstPartyHarnessArtifactSource`, `NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG`, `ns skills install`, and `@nseng-ai/ns-init`'s `RealSkillMaterializer` keep compiling and behaving unchanged. Neither existing consumer switches on `source.type`, so the union widening is source-compatible for them; only internal helpers (`sourceProvenance` in `provision-plan.ts`) generalize their parameter types.

## API consequences

- `@nseng-ai/harness-artifacts/api` exports the widened `HarnessArtifactSource` union, the `npm-module` provenance variant, the declaration schema/parser, and the module-root resolver + resolved-catalog types when the discovery row lands. Existing exports keep their names and shapes.
- `ns` CLI wiring (`src/ns/skills-*.ts`) later gains a module-sourced install path; the first-party path is untouched by this decision.
- `@nseng-ai/ns-init` is unaffected now; its `SkillMaterializer` seam may later accept module-sourced artifacts, but that would be a separate, explicit gateway-contract change (Runner Policy ask-first item).

## Objective Impact

- `objective.md`: the "npm-module source model" open question is resolved and removed.
- `roadmap.md`: the "Decide the npm-module source model" row flips to done with this update as evidence; the discovery row is unblocked.
- Umbrella sync happens at closure per the "Synthesize closure into the umbrella" row (this update is the proving-consumer evidence that the widening stayed additive).

## Follow-Ups

- Build the discovery slice against this shape (next roadmap row).
- `ns update` command-surface placement and AREG↔manifest inspection depth remain open, unchanged.
