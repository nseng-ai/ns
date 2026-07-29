# Extension Kit Rebaseline

## Summary

The machine-readable capability-to-extension cutover landed before this umbrella began its first package child. The former `ts/packages/capability-kit` is now `ts/packages/extension-kit` / `@nseng-ai/extension-kit`, and the vocabulary verdict no longer blocks the SDK or Extension Kit package passes. No package-level Readme-Driven-Development child or `references/README-draft.md` exists yet.

The live dependency graph supports Clinkr → Foundation → SDK → Extension Kit, with Brmem independently available after Foundation. Brmem and SDK already have README files, but those files do not satisfy this Objective's child-record, draft, mismatch-disposition, and closure-evidence contract.

Provenance: objective-refresh basis target=5d52b257cc380143528f8353e3712e3cf63152fe from=trunk-HEAD

## Objective Impact

The Objective and roadmap now use Extension Kit, remove the resolved rename gate and stale rename-execution question, distinguish dependency order from deliberate serial learning order, and keep Clinkr as the unstarted gate dry-run.

## Follow-Ups

- Create the Clinkr Readme-Driven-Development Subobjective.
- Decide after the Foundation pass whether Brmem and SDK remain serial or may proceed in parallel.
