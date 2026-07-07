# Managed-extensions storage decision: consumption-agnostic acquisition, `.ns/managed-extensions/`, no lockfile

## Summary

Interactive grill session (user-decided, 2026-07-07) resolving the fetched-module
storage roadmap row. The session also produced a conceptual reframe that supersedes
the `artifact-packages` working name.

**Conceptual model (user-driven):**

1. **Consumption-agnostic acquisition.** ns consumes npm modules for two distinct
   reasons: they package harness artifacts (passive files, never executed), and/or
   they plug into the ns CLI (kernel command extensions, executable). **Extension**
   is the canonical, aspect-oriented term for a consumed module — its role comes from
   what it declares and which consumers read it, not from where it sits. This matches
   today's code reality (kernel discovery and harness-artifact discovery already scan
   the same `.ns/extensions` + XDG roots independently) and pi's design (one
   `packages` list carrying mixed passive/executable contents).
2. **Independent acquisition subpackage.** Acquisition is owned by a new workspace
   package (working name `@nseng-ai/extensions`, placement TBD at implementation)
   whose entire job in life is: read declared extension specs → materialize modules
   into the managed root. It knows nothing about what consumers do with fetched
   modules. Future scope note (user, 2026-07-07): this package's durable job covers
   all three grammar source kinds — npm registry (slice one), **acquiring extensions
   from GitHub/git sources**, and **mounting ad hoc local extensions** (local-path
   specs) — which leans the open local-path question toward "mounting is acquisition's
   job," to be confirmed when that kind ships.
3. **Per-consumer wiring.** Slice one wires only harness-artifact discovery (passive).
   Kernel command loading from fetched content is a separate, explicitly recorded
   later decision — it means executing remotely fetched code, beyond this record's
   accepted trust posture — and should be judged together with the trust re-judgment
   roadmap row.

**Concrete storage decisions:**

4. **ns.toml key: `extensions = [...]`** — a list of source specs in the decided
   grammar. This supersedes the inherited working name `artifact-packages` everywhere
   in this record.
5. **Managed root: `.ns/managed-extensions/`** — project-local, machine-owned,
   reproducible from the committed ns.toml declaration. A gitignored sibling of the
   committed hand-placed `.ns/extensions/` root; fetched content never mixes into the
   committed root (kernel discovery treats each child of `.ns/extensions/` as an
   extension entry, and hand-placed vs machine-managed content must stay visibly
   separate).
6. **Internal layout: pi-aligned per-source-kind subdirs** — `npm/<pkg-name>/` in
   slice one; `git/<host>/<path>/` reserved (mirrors pi's `.pi/npm/` and
   `.pi/git/<host>/<path>`). Identity for dedup follows pi: npm = package name,
   git = repo URL without ref.
7. **No lockfile.** The ns.toml spec is the durable record of intent; pin the spec
   (`npm:pkg@ver`) when reproducibility is wanted. Resolved state is inspectable in
   the fetched module's own `package.json` and in install-manifest provenance. No
   separate resolution record — avoids a second pin registry and defends against the
   record's package-manager scope-gravity risk. Matches pi (no lockfile; the spec is
   the pin).
8. **Gitignore: repo-root `.gitignore` entry** for `.ns/managed-extensions/`, written
   by `ns init` for consumer projects and added by hand in this repo (user decision,
   over the self-ignoring-file alternative).
9. **Discovery integration: third root.** `.ns/managed-extensions/npm/` (and later
   `git/...`) is added as an additional discovery root reusing the existing
   module-discovery walk in `@nseng-ai/harness-artifacts`
   (`discoverExtensionModuleHarnessArtifacts()` currently scans `.ns/extensions` +
   XDG); any fetched-vs-present provenance distinction stays an additive field.
10. **Standing principle (user instruction): align with pi's design decisions**
    throughout this record — pi's packages machinery
    (`earendil-works/pi` `packages/coding-agent`, pinned commit in the comparison
    update) is the debugged reference for grammar, layout, pinning, and identity.

## Objective Impact

- Resolves the second roadmap decision row (fetched-module storage location, explicit
  record, discovery integration) — marked `[x]`.
- Supersedes the `artifact-packages` working name: the ns.toml key is `extensions`.
  Roadmap rows referencing the working name are updated; `objective.md` prose retains
  the historical working name with this update as the correction of record.
- Sharpens the "Local-path specs" open question: leaning acquisition/mounting, to be
  confirmed when local-path ships.
- Adds explicit content to the trust re-judgment roadmap row: it must also decide
  whether the kernel may load command extensions from fetched (managed-root) modules,
  since that crosses from prompt-payload provisioning into executing fetched code.
- Introduces a new package boundary (acquisition-only subpackage, working name
  `@nseng-ai/extensions`) for the implementation slices; final name/placement per
  `docs/conventions/` package rules at implementation time.
- The aspect-oriented "extension" vocabulary may deserve umbrella/CONTEXT.md
  recording once implementation validates it — flagged as a follow-up, not silently
  widened here.

## Follow-Ups

- Next decision rows: fetch mechanics / acquisition gateway seam, then `ns update`
  composition + per-source update semantics, then the trust re-judgment (now
  including the kernel-wiring question).
- At implementation: confirm the acquisition package's name/placement against
  workspace conventions; update the ns-toml implementation row to the `extensions`
  key; add the `.gitignore` entry to this repo and to `ns init` scaffolding.
- Surface the "extension = aspect-oriented consumed module" vocabulary to the
  umbrella / root CONTEXT.md when it stabilizes.
