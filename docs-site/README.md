# asdl docs site

This is the public Astro/Starlight documentation site for `asdl`.

## Local development

From the repository root:

```sh
just docs-dev
just docs-build
just docs-check
```

## Vercel deployment

The repository root `vercel.json` is configured for a Vercel project whose Root Directory is the repository root:

- Install Command: `pnpm --dir docs-site install --frozen-lockfile`
- Build Command: `pnpm --dir docs-site run build`
- Output Directory: `docs-site/dist`

Alternatively, set the Vercel project Root Directory to `docs-site`; in that mode Vercel uses `docs-site/vercel.json` and the output directory is `dist`.

Deployments are temporarily disabled in both Vercel config files with `ignoreCommand: "exit 0"`. Vercel treats an ignored-build command that exits `0` as a skipped build, so connected Git commits should not publish preview or production deployments while this setting is present. Remove the `ignoreCommand` property from both config files to re-enable Vercel deployments.

Set `DOCS_SITE_URL` in Vercel to the canonical production URL if it differs from the default `https://asdl-docs.vercel.app`. This feeds Astro's `site` value for sitemap and canonical metadata.

To make the site publicly viewable, ensure Vercel Deployment Protection / Vercel Authentication is disabled for the production deployment in the Vercel project settings. This access-control setting is not controlled by `vercel.json`.
