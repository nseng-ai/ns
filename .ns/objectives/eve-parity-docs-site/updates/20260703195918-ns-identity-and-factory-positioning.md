# ns identity and software-factory positioning

## Summary

An owner decision session resolved the site's identity and repositioned the product
story the site tells.

**Identity.** The product the site documents is `ns` (`ns` == nonslop; `nseng` ==
nonslop engineering). Lowercase always, matching the sdl/ji wordmark convention.
Production domain is `nseng.ai`; `siteId` is `"ns"`. The repo's CLI is `ji` today and
becomes `ns` soon; the site is deliberately written for the future name ("we program
for the future"), and launch stays gated behind the actual CLI rename.

**Positioning.** Nothing is standalone anymore. The **ns kernel** — canonical new
vocabulary: the core part of the system that extensions are built on — owns worktree
slots, objectives, branch memory (brmem is an internal kernel utility, no longer a
user-facing tool), handoffs, and shipping. `aretro`, `roaster`, and `pr-address`
become **extensions**, and skills ship as part of extensions rather than as their own
top-level docs section. The docs Tools section dissolves accordingly.

**Copy source.** No tagline workshop. Site hero, agent block, and positioning copy
derive from `docs/north-star.md`, which is rewritten under this Objective (a named
exception to the internal-docs non-goal). The rewrite is a deeper repositioning, not
a string swap: the enemy is the **software factory** (from `docs/ji-naming-brief.md`'s
spine, "Engineers are not factory managers; they are sorcerers" — fleets, throughput,
supervision dashboards); the thesis is **nonslop engineering** — slop is a boundary
problem, and ns removes it by construction; the meta-harness demotes to Exhibit A of
factory tooling; "source development lifecycle" goes away as language entirely; kernel
plus extensions is the architecture story. The context-scopes/lifetimes table and the
storage-vs-assembly resolver material carry over as the mechanism.

**Sequencing.** Chrome rebrand proceeds immediately (owner: "no reason to hold it
back"); the ns-first content rewrite and IA restructure follow as the next slice.

## Objective Impact

- Open question "Site identity/positioning copy" is resolved: name, casing, domain,
  `siteId`, and copy-source strategy are all decided; nothing identity-shaped remains
  open.
- Completion criteria change shape: the corpus target IA is now Get started /
  Concepts (ns kernel features) / Extensions / Guides — Tools and Skills as top-level
  sections are gone.
- The non-goal "No changes to the internal `docs/` tree" is narrowed: `docs/north-star.md`
  is the named exception because it is the site's copy source.
- New risk recorded: the site documents `ns` commands while the shipped binary is
  `ji`; docs are aspirational until the rename lands, and the deploy gate is the
  mitigation.
- Roadmap: the identity row's remaining work becomes applying the ns rebrand and
  deriving home/agent copy from the rewritten north-star; the content row gains
  ns-first + IA-restructure guidance.

## Follow-Ups

- **Drift flags for other records (reported, not silently fixed here):**
  - `rename-sdl-to-ji`'s orientation says "the product is `ji`"; the owner's "ji now,
    becoming ns very soon" supersedes that direction. That objective's record needs a
    deliberate reconciliation pass.
  - `docs/ji-naming-brief.md` is ji's marketing story (djinn homage, "no expansion").
    ns contradicts parts of it (ns does expand: nonslop). The anti-factory spine
    carries forward; a ns naming brief successor is needed, outside this Objective.
  - `CONTEXT.md` domain vocabulary does not yet know "ns kernel" or the
    extension-ecosystem framing; that is a domain-language edit to make deliberately,
    not silently.
- Content rewrite proceeds ns-first from the rewritten north-star, including the IA
  restructure (kernel feature pages replace Tools; extension pages absorb skills).
