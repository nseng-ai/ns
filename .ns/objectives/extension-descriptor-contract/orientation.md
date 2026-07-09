**Direction: ns extensions declare themselves through one typed descriptor module; JSON extension metadata and extension-root scanning are being deleted.**

Getting to: every extension package exposes `exports["./ns-extension"]` — a cheap typed descriptor (metadata plus lazy load thunks, importing only `@nseng-ai/kernel/sdk`) that is the sole source of commands, points, and harness artifacts; command sources become exactly built-ins + preinstalled + ns.toml-declared descriptors. The promoted author contract lives in `ts/packages/kernel/docs/writing-an-ns-extension.md`; this objective's `references/README-draft.md` is now a historical pointer.

What you see now — legacy, do not copy: package.json `ns.commands`/`ns.points`/`ns.harnessArtifacts` JSON manifests; `.ns/extensions/*` shim directories; per-package `repo-local-ns-extension.ts` and `preinstalled-catalog.ts` modules; `.ns/extensions` and global XDG extension-root scanning.

Avoid: adding new JSON extension manifests, `.ns/extensions` entries, preinstalled-catalog modules, or code that depends on extension-root scanning; making descriptor modules import implementation code.

Active slice: see this objective's roadmap.md.
