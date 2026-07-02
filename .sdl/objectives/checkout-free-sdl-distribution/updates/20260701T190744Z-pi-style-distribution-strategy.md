# Pi-Style Distribution Strategy Chosen

## Summary

The distribution strategy should deliberately copy Pi's shape rather than invent a new SDL-specific packaging model. Inspection of the local Pi checkout at `/Users/schrockn/code/githubs/earendil-works/pi` found that Pi publishes a real npm CLI package (`@earendil-works/pi-coding-agent`) with `bin.pi` pointing at prebuilt `dist/cli.js`, `files` including `dist`, docs, examples, `CHANGELOG.md`, and an npm shrinkwrap, and first-party runtime packages (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`) versioned alongside the CLI package. Pi uses a build step (`tsgo -p tsconfig.build.json`, chmod bin, copy assets) rather than requiring consumers to run from a source checkout.

Pi also provides useful product patterns for later SDL work: a package manager that accepts npm/git/local sources, installs into user/project roots (`~/.pi/agent/npm`, `~/.pi/agent/git`, `.pi/npm`, `.pi/git`), discovers resources via `package.json` `pi` manifests or conventional directories, gates project-local resources behind project trust, supports `pi update` / `pi update --all` / `pi update --extensions`, and shows in-product changelog/update notices from a packaged `CHANGELOG.md` while tracking the last seen version in settings.

For this Objective, the strategy decision is: publish SDL as a checkout-free npm CLI package with a `sdl` bin pointing at prebuilt JS, prefer publishing the first-party runtime workspace graph as versioned packages where feasible, and reserve bundle-inline for dependency-closure exceptions found during triage. Avoid a single opaque bundle as the primary design. Core first-party capability loading should resolve installed package JS, not checkout source paths; jiti may remain useful for development or user/package extensions, but not as the runtime path for bundled first-party capabilities.

## Objective Impact

This closes the roadmap's bundle-strategy gate and unblocks the runtime dependency triage and loader rewrite rows. The next decision should classify each runtime workspace dependency of `@sdl/kernel` as publish, bundle-inline exception, or exclude using the Pi-style package graph as the default.

The Pi package/update/changelog patterns are relevant product inspiration, but full SDL extension/package/changelog management should not be smuggled into this distribution Objective beyond the substrate needed for checkout-free `sdl`.

## Follow-Ups

- Build the runtime workspace dependency closure for `@sdl/kernel` and record a per-package publish vs bundle-inline vs exclude table.
- Treat "publish as versioned first-party package" as the default outcome for runtime packages unless triage finds a concrete reason not to.
- During the loader rewrite, make installed-package JS resolution the target and keep checkout/source-path jiti resolution only where it is explicitly a dev or extension path.
- Consider a future Objective or parked slice for SDL's own Pi-inspired package/update/changelog UX once checkout-free distribution is working.
