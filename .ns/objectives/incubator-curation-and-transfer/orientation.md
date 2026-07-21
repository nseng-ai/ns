**Direction: this repo transfers to the target organization as-is (history intact, names unchanged) and is curated in place under a two-zone model — the existing clean tiers (`infra`, `sdk`, `capability-kit`) plus a flat `ts/packages/incubator/` holding everything not yet warranted. Packages leave the incubator only through a README-driven graduation gate.**

Getting to: incubator layout with an enforced invariant — no package outside `incubator/` depends on a package inside it (`packagechk`/tier machinery) — foundation README contracts, pre-transfer secrets/ops hardening, then the graduation ladder (hosts wave first, daily drivers, herdr for stakeholders, pi extension batch). See this objective's `objective.md` for the gate definition.

What you see now: the incubator directory may not exist yet; capabilities and hosts still sit in their tier directories, and hosts/pi + hosts/ns still import capability packages. Treat all capabilities, hosts, and rough tools as incubator-destined regardless of current location.

Avoid: adding any new dependency from a clean-tier package onto a capability, host, or other incubator-destined package; polishing or refactoring incubator packages outside an explicit graduation slice; letting graduation slices grow redesign or feature work — the gate is honest-and-explainable, not ideal; committing anything to git history that cannot survive an organization transfer (secrets, tokens, private data).

Active slice: see this objective's roadmap.md.
