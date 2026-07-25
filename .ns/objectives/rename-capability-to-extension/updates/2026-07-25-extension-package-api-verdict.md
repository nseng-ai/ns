# Extension Package API Verdict

## Summary

The replacement for **Capability API** is **extension package API**: the public in-process API of one particular extension package, typically imported through its exported `/api` subpath, such as `@nseng-ai/plans/api`.

In prose, prefer **the extension’s package API** or qualify it with the owner, such as **Plans extension package API**. This surface is distinct from both the author-facing `@nseng-ai/sdk` API and Pi’s runtime `ExtensionAPI`; neither of those is an extension package API.

## Objective Impact

The remaining API-surface vocabulary question is settled. The CONTEXT and prose sweep can replace **Capability API** without using the ambiguous bare phrase “extension API” and without introducing a second noun for the feature area implemented by an ns extension.

This decision is vocabulary-only. Existing `/api` export subpaths and imports do not need to change solely because of this terminology verdict.

## Follow-Ups

- Define **extension package API** in root `CONTEXT.md` and apply the owner-qualified form in nested contexts and live prose.
- Preserve the separate names for the `@nseng-ai/sdk` author API and Pi runtime `ExtensionAPI`.
- Do not rename `/api` subpaths as part of the code-level package and tier cutover.
