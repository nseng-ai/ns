# docs-site -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 4 confirmed finding(s) (1 high, 2 medium, 1 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## docs-site

1. **Duplicated Code** (high) -- `docs-site/app/[lang]/extensions/page.tsx:23-41`
   - Roast: Two hero sections were hand-cloned down to the exact Tailwind class strings instead of being built from the shared marketing-ui kit that already exists for this purpose.
   - Evidence: extensions/page.tsx:23-41 repeats home/page.tsx:51-72 almost verbatim: same `mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-10 px-6 py-16 ... lg:items-center lg:py-24` wrapper, identical `text-balance font-semibold text-5xl text-gray-1000 tracking-[-0.04em] md:text-7xl` h1 class, identical `text-balance text-gray-800 text-xl leading-8` paragraph class, and the same `flex flex-wrap gap-3` CTA row, differing only in copy and a 440px/420px grid column width.
   - Smallest fix: Add a `Hero`/`MarketingHero` component to components/marketing-ui.tsx (alongside Card, CtaLink, Eyebrow, PreviewPanel) that takes eyebrow/title/description/ctas/sidePanel props, and have both page.tsx files call it instead of re-typing the markup and classes.

2. **Divergent Change** (medium) -- `docs-site/geistdocs.tsx:1-76`
   - Roast: This single file is simultaneously the brand logo component, the GitHub identity, the nav menu, the AI chat persona/prompt/suggestions, and the i18n/site-identity settings, so four unrelated kinds of edits all collide on the same file.
   - Evidence: geistdocs.tsx mixes a React `Logo()` component (line 1), `github`/`nav` site-chrome config (12-30), AI-assistant `suggestions`/`agent`/`prompt` copy (32-64), and `translations`/`basePath`/`siteUrl`/`siteId` identity settings (66-76) in one flat module that is spread wholesale into `defineConfig(...)` in lib/geistdocs/config.tsx.
   - Smallest fix: Split into focused modules (e.g. lib/geistdocs/nav.ts, lib/geistdocs/ai-assistant.ts, lib/geistdocs/site-identity.ts) and keep config.tsx as the single composition point that imports and assembles them, rather than one file owning all the unrelated config domains.

3. **Speculative Generality** (medium) -- `docs-site/lib/extensions-catalog.ts:28-90`
   - Roast: You built a compile-time exhaustiveness-checking type system with four mutually-recursive generics to babysit a five-item literal array that only one function in the whole codebase ever calls.
   - Evidence: DescriptorCategory, MissingDescriptorCategory, ExtraDescriptorCategory, and DescriptorCoverageCheck conditional types feed into defineExtensionCategoryDescriptors(...), whose only caller is the single hardcoded extensionCategoryDescriptors array literal at line 54.
   - Smallest fix: Drop the generic coverage-check machinery; either hardcode a Record<ExtensionCategory, string> literal (which TypeScript already exhaustiveness-checks for free) or add a one-line runtime test asserting the array covers ExtensionCategory.

4. **Duplicated Code** (low) -- `docs-site/lib/geistdocs/og-image.tsx:10-13,49-51`
   - Roast: Two sibling files independently reinvent the exact same 'cast page.data and fall back on missing title/description' dance instead of sharing one page-metadata accessor.
   - Evidence: og-image.tsx declares `interface OgPageData { description?: string; title?: string }` and does `const data = page.data as OgPageData; const pageTitle = data.title ?? "sdl Documentation"`; rss.ts (docs-site/lib/geistdocs/rss.ts:7-11,24-32) declares its own near-identical `RssPageData` and does `const data = page.data as RssPageData; title: data.title ?? page.url, description: data.description`.
   - Smallest fix: Add a shared getPageMetadata(page) helper in source.ts that returns a typed {title, description, lastModified} with defaults applied, and have both og-image.tsx and rss.ts call it instead of each casting page.data through its own ad hoc interface.
