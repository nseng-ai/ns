# Pi-aligned fetch mechanics and dependency behavior decided

## Summary

Decision (user-confirmed after inspecting pi's package acquisition path, 2026-07-07): ns acquisition should follow pi's package-manager acquisition model, not npm tarball extraction.

Concrete decisions:

- **Npm acquisition uses a managed package-manager project.** Slice one creates/uses a private managed npm project under `.ns/managed-extensions/npm/` and installs declared npm specs into that project. The resolved extension module path is therefore `.ns/managed-extensions/npm/node_modules/<pkg-name>`, refining the earlier shorthand `npm/<pkg-name>` layout from the storage decision.
- **Runtime dependencies are installed.** Matching pi, normal package `dependencies` are installed for npm-sourced extensions. This is intentional because extensions may eventually include executable command extensions as well as passive harness artifacts. The hard non-goal is now sharpened: ns does not own or expose a dependency graph/solver; each declared spec is still one top-level extension, while the package manager handles that extension's runtime dependency tree.
- **Peer/host dependency resolution is suppressed where applicable.** Follow pi's managed-install posture: extension packages should not cause package managers to install/solve host-provided ns/pi-style peer packages. The exact npm/pnpm/bun flags are implementation detail behind the acquisition gateway, but the behavior is durable.
- **No lockfile.** The existing storage decision stands: `ns.toml` specs are the durable record of intent, and resolved state is inspectable through fetched package contents and manifest/provenance. The managed npm project is machine-owned storage, not a second source of durable truth.
- **Git-sourced extensions use direct managed clones.** When git sources ship, install them under `.ns/managed-extensions/git/<host>/<path>` (identity is repo URL without ref), not under npm `node_modules`. If the clone contains `package.json`, install its runtime dependencies inside the checkout, matching pi's behavior. Pinned refs reconcile to the configured ref; unpinned git update details remain in the later update-semantics/composition row.
- **Local-path specs remain reserved.** The earlier leaning toward acquisition-owned mounting still stands, but this decision does not finalize copy/link/pointer behavior for local paths.
- **Gateway seam:** acquisition should expose fakeable command/gateway boundaries for package-manager/npm operations and future git operations. Tests must not perform real network fetches. Real package-manager/git invocations belong only in the real adapter or explicitly invoked local commands.
- **Diagnostics:** unlike pi's mostly exception/progress-callback command flow, ns acquisition should return per-extension acquisition diagnostics so one failed remote source does not prevent provisioning of already-present modules or other successfully acquired modules.

Pi evidence inspected in the installed package:

- `docs/packages.md`: npm sources install under `.pi/npm/` (project) or `~/.pi/agent/npm/` (user); versioned npm specs are pinned/skipped by package updates; git clones live under `.pi/git/<host>/<path>`; local paths point to disk without copying; package dependencies belong in `dependencies`; host pi packages are peers.
- `dist/core/package-manager.js`: `ensureNpmProject()` creates a private managed npm project; npm install uses package-manager commands with peer/host dependency suppression (`--legacy-peer-deps` for npm, peer suppression for pnpm/bun); git sources clone directly, reconcile refs with fetch/reset/clean, and run dependency install when `package.json` exists; missing-package resolution installs on demand unless offline or an `onMissing` policy skips/errors.
- `dist/utils/git.js`: git source parsing validates host/path components and keeps managed clone paths inside the install root.

## Objective Impact

- Resolves the fetch-mechanics / acquisition-gateway roadmap row and marks it `[x]`.
- Refines, without rewriting, the prior storage update's npm layout: npm is pi-aligned as a managed npm project with `node_modules/<pkg-name>`, while git remains `git/<host>/<path>`.
- Updates the Objective non-goal/risk wording so package-manager-installed runtime dependencies are allowed without turning ns into a package manager or dependency solver.
- Leaves `ns update` composition and the exact per-source update command contract open for the next design row.
- Leaves trust re-judgment open, especially whether fetched managed-root modules may be loaded as executable kernel command extensions.

## Follow-Ups

- Next decision row: decide how acquisition composes with `ns update` and spell out command/update behavior for pinned and unpinned specs.
- Implementation should start with the acquisition package boundary and fakeable gateways for package-manager/npm operations; git gateways can be reserved or stubbed until git sources ship.
- Discovery wiring must read `.ns/managed-extensions/npm/node_modules/<pkg-name>` module roots, not the npm project root as a module.
