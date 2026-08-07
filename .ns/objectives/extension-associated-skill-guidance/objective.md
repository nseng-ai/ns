# Extension-Associated Skill Guidance

## Thesis

Retire ns-owned Harness artifact provisioning and make `npx skills` the sole owner of skill acquisition, installation layout, conflict handling, lock state, updates, and removal. Extensions may instead declare one version-pinned source and a set of associated skills. The read-only `ns extension setup-skills <package>` command resolves an installed or declared extension and prints the copy-pasteable `npx skills add` command needed to install its matching skills; it never executes that command or writes a Harness root.

This keeps skill guidance discoverable and coupled to the extension release without maintaining a second skill installer. Published extension preparation injects the exact repository commit SHA used for the release. A source-installed extension derives equivalent provenance from its containing Git checkout when a repository origin and commit can be established.

## Scope

- Extend the Extension Descriptor with optional Associated Skills metadata containing exactly one Git source and one or more skill names.
- Inject release repository commit provenance during package preparation so a historical installed extension renders a command pinned to matching source bytes.
- For local/source-installed extensions, derive the repository origin and current commit when available; return a clear provenance error rather than silently rendering an unpinned source.
- Add `ns extension setup-skills <package> [--scope project|user]` for extensions already declared or installed in the selected scope.
- Accept explicit `npx skills` installation options such as repeatable `--agent` and `--global`; when omitted, leave those choices to `npx skills`.
- Render a shell-safe, copy-pasteable command by default and structured executable-plus-argv data with `--format json`.
- Treat an extension with no Associated Skills declaration as a successful empty result with explicit human and JSON output.
- After successful extension installation, print a concise follow-up hint to `ns extension setup-skills` when the extension declares associated skills; do not print or run the full generated command there.
- Use `@nseng-ai/objectives` as the real proof, associating `objective`, `objective-create`, `objective-next`, `objective-update`, `objective-close`, `objective-refresh`, `objective-critique`, and `objective-autorun` from one pinned ns repository source. Exclude the obsolete/internal `objective-runner-step`.
- Remove the Harness artifact subsystem completely: `ns skills`, Harness path tables, artifact catalogs and schemas, provisioning plans and application, manifests, reconciliation remnants, stale exports, tests, and live documentation. Relocate only unrelated utilities with demonstrated production consumers.
- Add a superseding ADR and synchronize package READMEs, author documentation, conventions, domain context, and command help with the new ownership split.

## Non-Goals

- Executing `npx skills`, checking whether `npx` exists, accessing the network, detecting installed agents, or inspecting destination directories from `setup-skills`.
- Installing, updating, removing, reconciling, or diagnosing installed skills in ns.
- Supporting arbitrary uninstalled package names or acquiring packages merely to preview guidance.
- Supporting multiple skill sources for one extension in the initial contract.
- Retaining generic Harness artifact contracts for hypothetical future artifact kinds.
- Making hosted skills.sh Packs authoritative for extension compatibility; a pack may be documented separately as a latest-version convenience, but it does not replace commit-pinned guidance.
- Automatically installing associated skills during extension install, update, activation, or initialization.
- Preserving unreleased `ns skills` compatibility through a deprecation period.

## Completion Criteria

- The Extension Descriptor validates optional Associated Skills metadata with one source and a non-empty deterministic skill-name set, while descriptors without it remain valid.
- Published extension preparation records an exact repository commit SHA, and a packed historical extension can render guidance pinned to that SHA without relying on the current checkout.
- A declared local extension inside a suitable Git checkout renders equivalent commit-pinned guidance; unavailable or ambiguous provenance returns an actionable deterministic error and never falls back to an unpinned source.
- `ns extension setup-skills <package>` selects only an extension declared or installed in the requested project or user scope and prints a shell-safe `npx skills add` command without executing it.
- Explicit `--agent` and `--global` options are represented in the rendered argv; omission preserves `npx skills` interactive/default behavior.
- `--format json` returns structured executable and argv fields, while an extension without associated skills succeeds with an explicit empty result in both formats.
- Successful extension install emits only a concise `setup-skills` follow-up hint when applicable and performs no Harness-root mutation.
- The Objectives extension proves the full eight-skill association and produces one version-pinned command.
- No live `ns skills` or Harness artifact provisioning/reconciliation surface, manifest ownership, path registry, or public export remains; unrelated retained utilities have coherent non-Harness homes and real consumers.
- Tests prove command rendering, shell escaping, JSON output, scope selection, no-association behavior, provenance failures, packed/source-installed provenance, install hints, and absence of skill-installation side effects.
- A new ADR supersedes the retained `ns skills` decision in ADR 0057 and records `npx skills` as the sole skill-management owner.

## Assumptions and Risks

Assumptions:

- `npx skills add` remains the supported external interface for source selection, named-skill selection, agent targeting, global placement, and installation lifecycle.
- An extension release and its associated skills can be traced to one repository commit even when npm package versions and repository tags are not one-to-one.
- Descriptor metadata is the appropriate discoverable owner for extension-to-skill association because it travels with the installed extension and can be validated before command rendering.
- The ns release tooling can inject provenance without requiring extension authors to hand-maintain commit SHAs.

Risks:

- **Release provenance drift.** Incorrect or absent injected commit data could render a plausible but mismatched command. Package preparation and packed-artifact tests must fail closed when an associated-skills declaration lacks release provenance.
- **Local checkout ambiguity.** Dirty worktrees, non-Git sources, detached provenance, or non-GitHub origins may not map cleanly to a `npx skills` source. The first implementation must define and test its accepted origin/commit facts and report unsupported cases honestly.
- **Shell rendering hazards.** A human command string can be unsafe or lossy if values are concatenated casually. Build argv as the source of truth, validate descriptor inputs, and derive shell output with explicit escaping; JSON must expose argv directly.
- **Descriptor loading trust.** `setup-skills` must reuse admitted installed/declared extension resolution rather than execute arbitrary requested packages.
- **Historical documentation conflict.** Existing ADRs and closed Objectives preserve the former two-installer decision. Live docs must clearly point to the superseding ADR without rewriting historical records.
- **Broad deletion fallout.** `harness-artifacts` currently contains a few utilities used outside provisioning. Deletion must follow actual production references, relocating only code with a coherent owner rather than preserving the subsystem as a miscellaneous container.

## Open Questions

- What exact descriptor field names and JSON result schema best express Associated Skills while keeping the public interface small?
- Which Git remote forms are accepted for source-installed provenance, and what user-facing remedy should unsupported origins receive?
- Should `--global` be accepted only as a direct `npx skills` pass-through, or should the command eventually expose a more general allowlisted pass-through mechanism?
