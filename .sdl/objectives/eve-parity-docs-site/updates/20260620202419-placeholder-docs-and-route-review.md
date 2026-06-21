# Placeholder Docs and Route Review

## Summary

The docs-site machine-routes cleanup branch now intentionally replaces the generated published docs prose under `docs-site/docs/**` with obvious TODO/Lorum ipsum placeholder content. The Fumadocs page set, frontmatter, `meta.json` IA, and route shape remain, but the page bodies are no longer launch-ready documentation.

The same branch also addressed PR feedback on shared Geistdocs route helpers: site-origin handling now uses the platform `URL` API rather than a custom scheme regex, localized machine-route proxy bypasses use Geistdocs' language list, and the localized route handlers were verified to exist under `app/[lang]`. Validation passed with `just dprint-check` and `pnpm --dir docs-site run check`.

## Objective Impact

The content-corpus roadmap slice is no longer complete in launch-readiness terms. Its structure remains useful and wired, but publishable SDL prose must be rewritten after the placeholder decision. This corrects the older "Published Docs Corpus Ported" update, which remains historical evidence for the earlier generated corpus before the placeholder replacement.

The AI-native/machine-routes slice remains complete, with additional confidence from the PR feedback fixes and build output listing localized machine routes.

## Follow-Ups

- Rewrite the TODO/Lorum ipsum docs pages into accurate SDL copy before treating the content corpus as complete again.
- Wire Geistdocs search while continuing to omit AI chat.
- Finish launch-level marketing home/site identity and positioning copy.
- Resolve the integrations/gallery direction.
- Complete Vercel/repo launch wiring and docs-site README/AGENTS refresh.
