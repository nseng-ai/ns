**Direction: ns extensions declare themselves through one typed descriptor module; JSON extension metadata and extension-root scanning are gone.**

Getting to: every extension package exposes `exports["./ns-extension"]` — a cheap typed descriptor (metadata plus lazy load thunks, importing only `@nseng-ai/kernel/sdk`) that is the sole source of commands, points, and harness artifacts; command sources are exactly built-ins + preinstalled + ns.toml-declared descriptors. The promoted author contract lives in `ts/packages/kernel/docs/writing-an-ns-extension.md`; this objective's `references/README-draft.md` is a historical pointer.

What you see now: the migration has landed on trunk — the JSON extension manifests, `.ns/extensions/*` shims, per-package `repo-local-ns-extension.ts`/`preinstalled-catalog.ts` modules, and `.ns/extensions`/global-XDG extension-root scanning are deleted.

Avoid: reintroducing JSON extension manifests, `.ns/extensions` entries, preinstalled-catalog modules, or code that depends on extension-root scanning; making descriptor modules import implementation code.

Active slice: see this objective's roadmap.md.
